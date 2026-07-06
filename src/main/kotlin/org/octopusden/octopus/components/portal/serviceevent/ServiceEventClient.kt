package org.octopusden.octopus.components.portal.serviceevent

import org.octopusden.octopus.components.portal.validation.ValidationProperties
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant

/**
 * SYS-061: reports portal-owned operational events into the CRS `service_event` journal
 * via `POST /rest/api/4/admin/service-events`. Best-effort and fire-and-forget — a
 * reporting failure must never disturb the sweep or startup that triggered it: the call is
 * subscribed without blocking the caller (the HTTP request runs asynchronously on the
 * WebClient's Reactor Netty connection) and any error is only logged.
 *
 * Auth is the shared-secret `X-Service-Event-Token` header (the portal calls CRS
 * tokenless otherwise). Inert unless [ServiceEventReportingProperties.enabled] and a
 * non-blank token are configured — mirrors the CRS fail-closed ingest gate.
 *
 * WebClient is built directly (no builder bean in this Boot-4 gateway app), mirroring
 * [org.octopusden.octopus.components.portal.validation.client.RegistryClient].
 */
// `open` so a test can substitute a capturing double for ValidationService's dependency
// (this Boot-4 gateway app does not apply the kotlin-spring all-open plugin to @Component).
@Component
open class ServiceEventClient(
    validationProperties: ValidationProperties,
    private val properties: ServiceEventReportingProperties,
) {
    private val webClient: WebClient =
        WebClient.builder().baseUrl(validationProperties.registryBaseUrl).build()

    /** Portal (re)deploy marker. */
    open fun reportStartup(version: String?) =
        post(
            IngestRequest(
                eventType = "STARTUP",
                status = "COMPLETED",
                triggeredBy = "system",
                serviceVersion = version.orEmpty(),
                summary = "components-management-portal started",
                startedAt = Instant.now(),
            ),
        )

    /**
     * One validation-sweep run outcome. [finishedAt] is the report's generatedAt (success)
     * or lastAttemptAt (failure).
     */
    open fun reportValidationSweep(
        status: String,
        startedAt: Instant,
        finishedAt: Instant,
        summary: String,
        detail: Map<String, Any?>,
    ) = post(
        IngestRequest(
            eventType = "VALIDATION_SWEEP",
            status = status,
            triggeredBy = "scheduler",
            summary = summary,
            detail = detail,
            startedAt = startedAt,
            finishedAt = finishedAt,
        ),
    )

    private fun post(body: IngestRequest) {
        if (!properties.enabled || properties.token.isBlank()) return
        webClient
            .post()
            .uri("/rest/api/4/admin/service-events")
            .header(HEADER_TOKEN, properties.token)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body)
            .retrieve()
            .toBodilessEntity()
            .subscribe(
                { /* accepted */ },
                { e -> LOG.warn("Failed to report {} service-event to CRS: {}", body.eventType, e.toString()) },
            )
    }

    /** Wire body for the CRS ingest endpoint; source is always the portal. */
    data class IngestRequest(
        val eventType: String,
        val status: String,
        val triggeredBy: String,
        val serviceVersion: String? = null,
        val summary: String? = null,
        val detail: Map<String, Any?>? = null,
        val startedAt: Instant,
        val finishedAt: Instant? = null,
        val source: String = "portal",
    )

    companion object {
        private val LOG = LoggerFactory.getLogger(ServiceEventClient::class.java)
        private const val HEADER_TOKEN = "X-Service-Event-Token"
    }
}
