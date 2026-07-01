package org.octopusden.octopus.components.portal.health

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.health.contributor.Health
import org.springframework.boot.health.contributor.ReactiveHealthIndicator
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import reactor.core.publisher.Mono
import java.time.Duration

/**
 * Portal-side mirror of the registry's `employeeService` health component:
 * actuator component `employeeServiceIntegration` under `/actuator/health`.
 *
 * The portal itself never talks to employee-service — the registry does — but
 * the person pickers and owner/champion status badges the portal renders are
 * degraded whenever that integration is broken, so the portal's own health
 * check must surface it. The registry exposes the component status anonymously
 * (its actuator health paths are permitAll and show-details is on), which
 * keeps this indicator credential-free.
 *
 * Status mapping (the registry uses the conventional actuator HTTP codes, so
 * the BODY status is authoritative, not the HTTP code):
 * - registry UP      → UP
 * - registry DOWN    → DOWN (+ reason)
 * - registry UNKNOWN → UNKNOWN (integration intentionally disabled — not a failure)
 * - 404 (older registry without the indicator) → UNKNOWN
 * - registry unreachable / timeout → DOWN (+ reason)
 *
 * Deployment safety: the OKD probe hits `/actuator/health/liveness` (the
 * liveness GROUP), and custom indicators are not part of probe groups — a DOWN
 * here flips the aggregate health for monitoring without restarting pods or
 * blocking a rollout.
 */
@Component("employeeServiceIntegration")
class EmployeeServiceIntegrationHealthIndicator(
    @Value("\${portal.registry-base-url}") registryBaseUrl: String,
) : ReactiveHealthIndicator {
    // Built directly (not from a Boot-managed WebClient.Builder bean): this
    // Boot 4 gateway app does not ship the webclient autoconfiguration module,
    // so no builder bean exists — and a one-call-per-scrape internal probe
    // needs none of its customizations.
    private val webClient = WebClient.builder().baseUrl(registryBaseUrl).build()

    override fun health(): Mono<Health> =
        webClient
            .get()
            .uri("/actuator/health/employeeService")
            .exchangeToMono { response ->
                if (response.statusCode() == HttpStatus.NOT_FOUND) {
                    // Registry predates the employeeService indicator — nothing
                    // to mirror; explicitly not a failure.
                    response.releaseBody().thenReturn(
                        Health.unknown()
                            .withDetail("reason", "components-registry exposes no employeeService health component")
                            .build(),
                    )
                } else {
                    response.bodyToMono(ComponentHealthBody::class.java).map { body -> body.toHealth() }
                }
            }
            .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
            .onErrorResume { e ->
                Mono.just(
                    Health.down()
                        .withDetail("reason", "components-registry unreachable: ${e.javaClass.simpleName}")
                        .build(),
                )
            }

    /** The subset of the actuator component-health payload the mirror needs. */
    data class ComponentHealthBody(
        val status: String? = null,
    ) {
        fun toHealth(): Health =
            when (status) {
                "UP" -> Health.up().build()
                "UNKNOWN" ->
                    Health.unknown()
                        .withDetail("reason", "employee-service integration is disabled on components-registry")
                        .build()
                else ->
                    Health.down()
                        .withDetail(
                            "reason",
                            "employee-service integration is DOWN on components-registry (status=$status)",
                        )
                        .build()
            }
    }

    private companion object {
        private const val TIMEOUT_SECONDS = 3L
    }
}
