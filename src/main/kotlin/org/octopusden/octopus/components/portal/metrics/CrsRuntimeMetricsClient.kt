package org.octopusden.octopus.components.portal.metrics

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import java.time.Duration
import java.util.Optional

/**
 * Best-effort, credential-free reader of CRS's actuator runtime metrics for the
 * admin Runtime card. Mirrors EmployeeServiceIntegrationHealthIndicator:
 * a plain WebClient over the same portal.registry-health-base-url, short
 * timeouts, and every failure downgraded rather than propagated — the portal's
 * own metrics never depend on CRS answering.
 *
 * The actuator health path is anonymous on CRS (proven by the employee health
 * mirror). The actuator metrics paths very likely are NOT — a 401/403 there is
 * the expected case and surfaces as available=false with a reason, while the
 * health status is still shown. Micrometer process.uptime and jvm.gc.pause
 * TOTAL_TIME are in SECONDS, so both are multiplied by 1000 to milliseconds.
 */
@Component
class CrsRuntimeMetricsClient(
    @Value("\${portal.registry-health-base-url}") registryBaseUrl: String,
) {
    private val webClient = WebClient.builder().baseUrl(registryBaseUrl).build()

    /**
     * @param bearerToken the caller's OAuth2 access token, relayed to CRS so its
     *   authenticated() actuator metrics endpoints answer (CRS gates them on any
     *   valid JWT, no special role). Null → credential-free: health still resolves
     *   but metrics come back as require-authentication.
     */
    fun fetch(bearerToken: String? = null): Mono<CrsRuntime> =
        Mono.zip(fetchStatus(), probeMetrics(bearerToken)).map { tuple ->
            val status = tuple.t1.orElse(null)
            when (val probe = tuple.t2) {
                is MetricsProbe.Available ->
                    CrsRuntime(
                        available = true,
                        reason = null,
                        status = status,
                        uptimeMillis = probe.uptimeMillis,
                        jvm = probe.jvm,
                    )
                is MetricsProbe.Unavailable ->
                    CrsRuntime(
                        available = false,
                        reason = probe.reason,
                        status = status,
                        uptimeMillis = null,
                        jvm = null,
                    )
            }
        }

    /**
     * CRS health status string (e.g. UP/DOWN); empty when unreachable/unparseable.
     * Credential-free on purpose — CRS health is anonymous, so the token is not
     * relayed here (only the authenticated() metrics endpoints get it).
     */
    private fun fetchStatus(): Mono<Optional<String>> =
        webClient
            .get()
            .uri("/actuator/health")
            .exchangeToMono { response ->
                response.bodyToMono(HealthBody::class.java).map { Optional.ofNullable(it.status) }
            }
            .timeout(TIMEOUT)
            .onErrorResume { Mono.just(Optional.empty()) }

    /**
     * Probe `process.uptime` to classify the metrics endpoint; on success fan out
     * the rest of the JVM metrics. The classification drives `available`/`reason`.
     */
    private fun probeMetrics(bearerToken: String?): Mono<MetricsProbe> =
        classifyProbe(bearerToken).flatMap { classification ->
            when (classification) {
                // Fan out the rest only once the probe says metrics are reachable. The
                // per-metric timeouts (see metricValue) bound the fan-out independently —
                // the probe timeout below must NOT wrap it, or a slow LAN would let the
                // probe timeout fire mid-fan-out and spuriously mark CRS unavailable.
                is ProbeClassification.Ok -> fetchAvailable(classification.uptime, bearerToken)
                is ProbeClassification.Unavailable -> Mono.just(MetricsProbe.Unavailable(classification.reason))
            }
        }

    /** Probe `process.uptime` to classify the metrics endpoint (bounded by TIMEOUT). */
    private fun classifyProbe(bearerToken: String?): Mono<ProbeClassification> =
        webClient
            .get()
            .uri("/actuator/metrics/process.uptime")
            .headers { headers -> bearerToken?.let(headers::setBearerAuth) }
            .exchangeToMono { response ->
                val code = response.statusCode()
                when {
                    code.is2xxSuccessful ->
                        response.bodyToMono(ActuatorMetric::class.java).map { ProbeClassification.Ok(it) }
                    code.isSameCodeAs(HttpStatus.UNAUTHORIZED) || code.isSameCodeAs(HttpStatus.FORBIDDEN) ->
                        response.releaseBody().thenReturn(
                            ProbeClassification.Unavailable("CRS metrics require authentication"),
                        )
                    code.isSameCodeAs(HttpStatus.NOT_FOUND) ->
                        response.releaseBody().thenReturn(
                            ProbeClassification.Unavailable("CRS exposes no process.uptime metric"),
                        )
                    else ->
                        response.releaseBody().thenReturn(
                            ProbeClassification.Unavailable("CRS metrics returned HTTP ${code.value()}"),
                        )
                }
            }
            .timeout(TIMEOUT)
            .onErrorResume { e ->
                Mono.just(ProbeClassification.Unavailable("CRS unreachable: ${e.javaClass.simpleName}"))
            }

    private fun fetchAvailable(uptime: ActuatorMetric, bearerToken: String?): Mono<MetricsProbe> {
        val uptimeMillis = uptime.value("VALUE")?.let { (it * MILLIS_PER_SECOND).toLong() }
        return Flux
            .fromIterable(METRIC_SPECS)
            .flatMap { spec -> metricValue(spec.path, spec.statistic, bearerToken).map { spec.key to it } }
            .collectMap({ it.first }, { it.second })
            .map { values -> MetricsProbe.Available(uptimeMillis, buildJvm(values)) }
    }

    private fun buildJvm(values: Map<String, Double>): CrsJvm =
        CrsJvm(
            heapUsedBytes = values["heapUsed"]?.toLong(),
            heapCommittedBytes = values["heapCommitted"]?.toLong(),
            heapMaxBytes = values["heapMax"]?.toLong()?.takeIf { it >= 0 },
            threadsLive = values["threadsLive"]?.toInt(),
            threadsPeak = values["threadsPeak"]?.toInt(),
            threadsDaemon = values["threadsDaemon"]?.toInt(),
            gcCount = values["gcCount"]?.toLong(),
            gcTimeMillis = values["gcTime"]?.let { (it * MILLIS_PER_SECOND).toLong() },
            cpuProcess = values["cpuProcess"],
            cpuSystem = values["cpuSystem"],
            availableProcessors = values["cpuCount"]?.toInt(),
        )

    /** A single metric measurement value; empty Mono when absent/unreachable. */
    private fun metricValue(path: String, statistic: String, bearerToken: String?): Mono<Double> =
        webClient
            .get()
            .uri("/actuator/metrics/$path")
            .headers { headers -> bearerToken?.let(headers::setBearerAuth) }
            .exchangeToMono { response ->
                if (response.statusCode().is2xxSuccessful) {
                    response.bodyToMono(ActuatorMetric::class.java).mapNotNull { it.value(statistic) }
                } else {
                    response.releaseBody().then(Mono.empty())
                }
            }
            .timeout(TIMEOUT)
            .onErrorResume { Mono.empty() }

    private sealed interface MetricsProbe {
        data class Available(val uptimeMillis: Long?, val jvm: CrsJvm) : MetricsProbe

        data class Unavailable(val reason: String) : MetricsProbe
    }

    /** Outcome of the cheap uptime probe, before the metric fan-out. */
    private sealed interface ProbeClassification {
        data class Ok(val uptime: ActuatorMetric) : ProbeClassification

        data class Unavailable(val reason: String) : ProbeClassification
    }

    private data class MetricSpec(val key: String, val path: String, val statistic: String)

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class HealthBody(val status: String? = null)

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class ActuatorMetric(
        val name: String? = null,
        val measurements: List<Measurement> = emptyList(),
    ) {
        fun value(statistic: String): Double? = measurements.firstOrNull { it.statistic == statistic }?.value
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class Measurement(val statistic: String? = null, val value: Double? = null)

    private companion object {
        private val TIMEOUT = Duration.ofSeconds(3)
        private const val MILLIS_PER_SECOND = 1000.0

        // Heap memory is summed across heap pools via the area:heap tag (best-effort —
        // a CRS that ignores the tag selector just yields a different/absent value).
        private val METRIC_SPECS = listOf(
            MetricSpec("heapUsed", "jvm.memory.used?tag=area:heap", "VALUE"),
            MetricSpec("heapCommitted", "jvm.memory.committed?tag=area:heap", "VALUE"),
            MetricSpec("heapMax", "jvm.memory.max?tag=area:heap", "VALUE"),
            MetricSpec("threadsLive", "jvm.threads.live", "VALUE"),
            MetricSpec("threadsPeak", "jvm.threads.peak", "VALUE"),
            MetricSpec("threadsDaemon", "jvm.threads.daemon", "VALUE"),
            MetricSpec("gcCount", "jvm.gc.pause", "COUNT"),
            MetricSpec("gcTime", "jvm.gc.pause", "TOTAL_TIME"),
            MetricSpec("cpuProcess", "process.cpu.usage", "VALUE"),
            MetricSpec("cpuSystem", "system.cpu.usage", "VALUE"),
            MetricSpec("cpuCount", "system.cpu.count", "VALUE"),
        )
    }
}
