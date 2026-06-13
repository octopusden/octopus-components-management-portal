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
    private val webClient: WebClient = WebClient.builder().baseUrl(properties.registryBaseUrl).build()
    private val requestTimeout: Duration = Duration.ofSeconds(properties.requestTimeoutSeconds)

    /** GET /rest/api/3/components → list of component ids. */
    fun componentIds(): Mono<List<String>> =
        webClient
            .get()
            .uri("/rest/api/3/components")
            .retrieve()
            .bodyToMono<List<ComponentRef>>()
            .map { refs -> refs.mapNotNull { it.id } }
            .timeout(requestTimeout)

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
    data class ComponentRef(val id: String? = null)

    data class VersionsRequest(val versions: List<String>)

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class DetailedVersionsResponse(
        val versions: Map<String, Any?> = emptyMap(),
    )
}
