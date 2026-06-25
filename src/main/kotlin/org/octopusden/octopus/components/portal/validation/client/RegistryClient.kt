package org.octopusden.octopus.components.portal.validation.client

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.octopusden.octopus.components.portal.validation.ValidationProperties
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import org.springframework.web.reactive.function.client.bodyToMono
import reactor.core.publisher.Mono
import java.time.Duration

/**
 * Thin reactive client over the components-registry (CRS), mirroring only the
 * fields this feature needs.
 *
 * Every call applies a per-request timeout (P3) so no single slow CRS call can
 * tie up the scheduler or a live request. Transport/HTTP errors propagate (they
 * are NOT mapped to empty) so the orchestrator can mark checkFailed/refreshError.
 *
 * WebClient is built directly (no builder bean in this Boot-4 gateway app),
 * mirroring [org.octopusden.octopus.components.portal.health.EmployeeServiceIntegrationHealthIndicator].
 */
@Component
class RegistryClient(
    properties: ValidationProperties,
) {
    private val webClient: WebClient =
        WebClient.builder()
            .baseUrl(properties.registryBaseUrl)
            .codecs { it.defaultCodecs().maxInMemorySize(properties.maxResponseBytes) }
            .build()
    private val requestTimeout: Duration = Duration.ofSeconds(properties.requestTimeoutSeconds)

    /**
     * GET /rest/api/3/components → list of component ids.
     *
     * Each element is `{"component":{"id":...,"archived":...},"variants":{...}}` —
     * the id is NESTED under "component", not a top-level "id".
     *
     * Archived components are EXCLUDED: there's no point validating decommissioned
     * components, and dropping them trims the per-component fan-out.
     */
    fun componentIds(): Mono<List<String>> =
        webClient
            .get()
            .uri("/rest/api/3/components")
            .retrieve()
            .bodyToMono<List<ComponentRef>>()
            .map { refs -> refs.mapNotNull { it.component }.filterNot { it.archived == true }.mapNotNull { it.id } }
            .timeout(requestTimeout)

    /**
     * GET /rest/api/4/migration-status → true iff CRS reports a migration / resync
     * job RUNNING. The validation sweep reads this and skips while it is true:
     * mid Git→DB migration the legacy v2/v3 resolver can serve not-yet-migrated
     * archived flags, which would otherwise make the sweep flag spurious problems
     * on already-archived components.
     *
     * TRANSITIONAL — paired with CRS's permitAll MigrationStatusControllerV4; both
     * go away once the migration era ends.
     *
     * Degrades to false on ANY non-2xx (notably 404 from a CRS predating the probe)
     * or transport error: an undeterminable signal must NEVER permanently wedge the
     * sweep. A genuinely unreachable CRS instead surfaces through the sweep's own
     * failure handling (checkFailed / refreshError).
     */
    fun migrationInProgress(): Mono<Boolean> =
        webClient
            .get()
            .uri("/rest/api/4/migration-status")
            .exchangeToMono { response ->
                if (response.statusCode().is2xxSuccessful) {
                    response.bodyToMono<MigrationStatusResponse>().map { it.running }
                } else {
                    response.releaseBody().thenReturn(false)
                }
            }
            .timeout(requestTimeout)
            .onErrorReturn(false)

    /**
     * POST /rest/api/2/components/{component}/detailed-versions body {"versions":[…]} →
     * {"versions": {version: {…}}}. CRS omits unresolvable versions, so the KEYS of
     * the returned map are exactly the resolvable versions.
     *
     * Short-circuits to an empty set when [versions] is empty (no CRS call).
     */
    fun resolvableVersions(component: String, versions: List<String>): Mono<Set<String>> {
        if (versions.isEmpty()) {
            return Mono.just(emptySet())
        }
        return webClient
            .post()
            .uri("/rest/api/2/components/{component}/detailed-versions", component)
            .bodyValue(VersionsRequest(versions))
            .retrieve()
            .bodyToMono<DetailedVersionsResponse>()
            .map { it.versions.keys.toSet() }
            .timeout(requestTimeout)
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class ComponentRef(val component: ComponentInner? = null)

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class ComponentInner(val id: String? = null, val archived: Boolean? = null)

    data class VersionsRequest(val versions: List<String>)

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class DetailedVersionsResponse(
        val versions: Map<String, Any?> = emptyMap(),
    )

    /**
     * CRS migration-status probe body. Only [running] is load-bearing; [kind]
     * (COMPONENTS / HISTORY / TC_RESYNC) is carried for diagnostics. Defaults make
     * a partial/older body parse safely to not-running.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    data class MigrationStatusResponse(
        val running: Boolean = false,
        val kind: String? = null,
    )
}
