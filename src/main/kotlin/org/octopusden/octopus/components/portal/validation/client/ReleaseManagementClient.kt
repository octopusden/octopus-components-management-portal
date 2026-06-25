package org.octopusden.octopus.components.portal.validation.client

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.octopusden.octopus.components.portal.validation.ValidationProperties
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import org.springframework.web.reactive.function.client.WebClientResponseException
import org.springframework.web.reactive.function.client.bodyToMono
import reactor.core.publisher.Mono
import java.time.Duration

/**
 * Thin reactive client over release-management-service (RM). RM has no
 * context-path and no app-level auth.
 *
 * Failure semantics (the crux): ONLY HTTP 404 → empty list (component unknown
 * to RM ⇒ no releases ⇒ genuinely not a problem). Any other status (401/5xx)
 * or timeout propagates as an error so the orchestrator marks the component
 * checkFailed — never mapped to empty.
 *
 * WebClient is built directly (no builder bean in this Boot-4 gateway app).
 */
@Component
class ReleaseManagementClient(
    properties: ValidationProperties,
) {
    private val webClient: WebClient =
        WebClient.builder()
            .baseUrl(properties.releaseManagementBaseUrl)
            .codecs { it.defaultCodecs().maxInMemorySize(properties.maxResponseBytes) }
            .build()
    private val requestTimeout: Duration = Duration.ofSeconds(properties.requestTimeoutSeconds)

    /**
     * GET /rest/api/1/builds/component/{component}?statuses=RELEASE → list of builds;
     * returns the distinct released versions (verbatim, incl. sub-component-qualified).
     */
    fun releasedVersions(component: String): Mono<List<String>> =
        webClient
            .get()
            .uri { builder ->
                builder
                    .path("/rest/api/1/builds/component/{component}")
                    .queryParam("statuses", "RELEASE")
                    .build(component)
            }
            .retrieve()
            .bodyToMono<List<BuildRef>>()
            .map { builds -> builds.mapNotNull { it.version }.distinct() }
            .timeout(requestTimeout)
            .onErrorResume(WebClientResponseException::class.java) { e ->
                if (e.statusCode == HttpStatus.NOT_FOUND) {
                    Mono.just(emptyList())
                } else {
                    Mono.error(e)
                }
            }

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class BuildRef(
        val component: String? = null,
        val version: String? = null,
        val status: String? = null,
        val hotfix: Boolean? = null,
    )
}
