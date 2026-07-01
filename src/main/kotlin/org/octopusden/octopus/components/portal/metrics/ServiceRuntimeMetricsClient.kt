package org.octopusden.octopus.components.portal.metrics

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.http.HttpStatus
import org.springframework.web.reactive.function.client.WebClient
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import java.time.Duration
import java.util.Optional

/**
 * Best-effort reader of a downstream service's actuator runtime metrics for the
 * admin System tab — used for both CRS and RMS (release-management-service).
 * Mirrors EmployeeServiceIntegrationHealthIndicator: a plain WebClient over the
 * service's base URL, short timeouts, and every failure downgraded rather than
 * propagated — the portal's own metrics never depend on the service answering.
 *
 * The actuator health path is anonymous, so it is always queried credential-free.
 * Metrics-endpoint auth differs per service and is controlled by [relayToken]:
 *  - CRS actuator metrics are authenticated() (any valid JWT, no special role), so
 *    the caller's bearer token is relayed (relayToken=true); without a token (or if
 *    CRS rejects it) metrics surface as available=false with a reason while the
 *    health status is still shown.
 *  - RMS actuator metrics are anonymous (relayToken=false), so no bearer is ever
 *    attached and metrics resolve without a token.
 *
 * Micrometer process.uptime and jvm.gc.pause TOTAL_TIME are in SECONDS, so both
 * are multiplied by 1000 to milliseconds. Wiring of the two instances (CRS + RMS)
 * lives in [org.octopusden.octopus.components.portal.metrics.MetricsClientsConfig].
 */
class ServiceRuntimeMetricsClient(
    baseUrl: String,
    private val relayToken: Boolean,
) {
    private val webClient = WebClient.builder().baseUrl(baseUrl).build()

    /**
     * @param bearerToken the caller's OAuth2 access token, relayed to the service's
     *   authenticated() actuator metrics endpoints ONLY when [relayToken] is true.
     *   Ignored entirely when relayToken=false (anonymous metrics, e.g. RMS). Null
     *   (or relayToken=false) → credential-free: health still resolves; for a
     *   token-gated service metrics then come back as require-authentication.
     */
    fun fetch(bearerToken: String? = null): Mono<ServiceRuntime> =
        Mono.zip(fetchStatus(), probeMetrics(bearerToken)).map { tuple ->
            val snapshot = tuple.t1.orElse(null)
            val reachable = snapshot != null
            val status = snapshot?.status
            val downComponents = snapshot?.downComponents ?: emptyList()
            val employeeService = snapshot?.employeeService
            when (val probe = tuple.t2) {
                is MetricsProbe.Available ->
                    ServiceRuntime(
                        available = true,
                        reason = null,
                        status = status,
                        uptimeMillis = probe.uptimeMillis,
                        jvm = probe.jvm,
                        reachable = reachable,
                        downComponents = downComponents,
                        employeeService = employeeService,
                    )
                is MetricsProbe.Unavailable ->
                    ServiceRuntime(
                        available = false,
                        reason = probe.reason,
                        status = status,
                        uptimeMillis = null,
                        jvm = null,
                        reachable = reachable,
                        downComponents = downComponents,
                        employeeService = employeeService,
                    )
            }
        }

    /**
     * CRS aggregate health snapshot (status + down components + the employeeService
     * mirror); empty Optional when unreachable/unparseable. The presence of the
     * Optional is what `reachable` keys off — an aggregate DOWN with a body is still
     * "reachable", only a no-response is "unreachable". Credential-free on purpose —
     * CRS health is anonymous, so the token is not relayed here (only the
     * authenticated() metrics endpoints get it).
     */
    private fun fetchStatus(): Mono<Optional<HealthSnapshot>> =
        webClient
            .get()
            .uri("/actuator/health")
            .exchangeToMono { response ->
                response.bodyToMono(HealthBody::class.java)
                    .map { Optional.of(it.toSnapshot()) }
                    // A service that answers with an EMPTY body (startup, or a proxy
                    // stripping a 503 body) makes bodyToMono complete empty. Without this
                    // coalesce that empty signal propagates through Mono.zip and blanks the
                    // whole /portal/metrics response (204 → undefined on the SPA). Map it to
                    // an empty Optional so the zip still emits and the service simply
                    // surfaces as unreachable, never taking down the other service or portal.
                    .switchIfEmpty(Mono.just(Optional.empty<HealthSnapshot>()))
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
            .headers { headers -> if (relayToken) bearerToken?.let(headers::setBearerAuth) }
            .exchangeToMono { response ->
                val code = response.statusCode()
                when {
                    code.is2xxSuccessful ->
                        response.bodyToMono(ActuatorMetric::class.java)
                            .map<ProbeClassification> { ProbeClassification.Ok(it) }
                            // A 2xx with an EMPTY body makes bodyToMono complete empty, which
                            // would propagate through probeMetrics → Mono.zip and blank the whole
                            // /portal/metrics response (mirrors the fetchStatus fix). Degrade
                            // instead of vanishing.
                            .switchIfEmpty(Mono.just(ProbeClassification.Unavailable(EMPTY_UPTIME_REASON)))
                    code.isSameCodeAs(HttpStatus.UNAUTHORIZED) || code.isSameCodeAs(HttpStatus.FORBIDDEN) ->
                        response.releaseBody().thenReturn(
                            ProbeClassification.Unavailable("Service metrics require authentication"),
                        )
                    code.isSameCodeAs(HttpStatus.NOT_FOUND) ->
                        response.releaseBody().thenReturn(
                            ProbeClassification.Unavailable("Service exposes no process.uptime metric"),
                        )
                    else ->
                        response.releaseBody().thenReturn(
                            ProbeClassification.Unavailable("Service metrics returned HTTP ${code.value()}"),
                        )
                }
            }
            .timeout(TIMEOUT)
            .onErrorResume { e ->
                Mono.just(ProbeClassification.Unavailable("Service unreachable: ${e.javaClass.simpleName}"))
            }

    private fun fetchAvailable(uptime: ActuatorMetric, bearerToken: String?): Mono<MetricsProbe> {
        val uptimeMillis = uptime.value("VALUE")?.let { (it * MILLIS_PER_SECOND).toLong() }
        return Flux
            .fromIterable(METRIC_SPECS)
            .flatMap { spec -> metricValue(spec.path, spec.statistic, bearerToken).map { spec.key to it } }
            .collectMap({ it.first }, { it.second })
            .map { values -> MetricsProbe.Available(uptimeMillis, buildJvm(values)) }
    }

    private fun buildJvm(values: Map<String, Double>): ServiceJvm =
        ServiceJvm(
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
            .headers { headers -> if (relayToken) bearerToken?.let(headers::setBearerAuth) }
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
        data class Available(val uptimeMillis: Long?, val jvm: ServiceJvm) : MetricsProbe

        data class Unavailable(val reason: String) : MetricsProbe
    }

    /** Outcome of the cheap uptime probe, before the metric fan-out. */
    private sealed interface ProbeClassification {
        data class Ok(val uptime: ActuatorMetric) : ProbeClassification

        data class Unavailable(val reason: String) : ProbeClassification
    }

    private data class MetricSpec(val key: String, val path: String, val statistic: String)

    // `components`/`details` are nullable (not defaulted-non-null): an absent JSON key
    // makes the Jackson Kotlin module pass null to the constructor rather than apply
    // the default, which would otherwise fail deserialization of a bodied-but-
    // componentless health response like {"status":"UP"}.
    @JsonIgnoreProperties(ignoreUnknown = true)
    data class HealthBody(
        val status: String? = null,
        val components: Map<String, ComponentBody>? = null,
    ) {
        /** Aggregate status + the DOWN components and the employeeService mirror. */
        fun toSnapshot(): HealthSnapshot {
            val comps = components.orEmpty()
            val down = comps.filterValues { it.status in DOWN_STATUSES }.keys.toList()
            val employee = comps["employeeService"]?.let {
                ServiceComponentHealth(status = it.status, reason = it.reason())
            }
            return HealthSnapshot(status, down, employee)
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class ComponentBody(
        val status: String? = null,
        val details: Map<String, Any?>? = null,
    ) {
        fun reason(): String? = details?.get("reason") as? String
    }

    /** Parsed health: aggregate status, DOWN component names, employeeService mirror. */
    data class HealthSnapshot(
        val status: String?,
        val downComponents: List<String>,
        val employeeService: ServiceComponentHealth?,
    )

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
        private const val EMPTY_UPTIME_REASON = "Service returned an empty process.uptime body"

        // Actuator statuses that fail the aggregate. UNKNOWN (e.g. discoveryComposite)
        // does not, mirroring Spring Boot's default StatusAggregator ordering.
        private val DOWN_STATUSES = setOf("DOWN", "OUT_OF_SERVICE")

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
