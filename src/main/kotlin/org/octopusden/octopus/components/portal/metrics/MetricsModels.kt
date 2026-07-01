package org.octopusden.octopus.components.portal.metrics

import com.fasterxml.jackson.annotation.JsonInclude
import org.octopusden.octopus.components.portal.security.RecentLogin
import java.time.Instant

/**
 * Wire model for `GET /portal/metrics` — the admin System tab on the Admin Settings
 * page. Portal metrics are always present (read locally from JVM MXBeans); the CRS
 * and RMS (release-management-service) metrics are best-effort and may be
 * unavailable, in which case only `available`/`reason` (+ `status`) carry. CRS
 * metrics are queried with the caller's relayed bearer token (CRS actuator metrics
 * are authenticated()); RMS actuator metrics are anonymous and queried token-free.
 */
data class MetricsResponse(
    val portal: PortalRuntime,
    val crs: ServiceRuntime,
    val rms: ServiceRuntime,
)

data class PortalRuntime(
    val uptimeMillis: Long,
    val startedAt: Instant,
    // OS process id + running JVM version, for the Portal card meta line
    // ("PID … · JDK … · since …") on the admin System tab.
    val processId: Long,
    val javaVersion: String,
    val jvm: PortalJvm,
    val recentLogins: List<RecentLogin>,
)

/** Full JVM/system readout for the portal itself — every field locally available. */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class PortalJvm(
    val heapUsedBytes: Long,
    val heapCommittedBytes: Long,
    // -1 (no configured max) is collapsed to null so the SPA renders an em-dash.
    val heapMaxBytes: Long?,
    val nonHeapUsedBytes: Long,
    val nonHeapCommittedBytes: Long,
    val threadsLive: Int,
    val threadsPeak: Int,
    val threadsDaemon: Int,
    val classesLoaded: Int,
    val classesTotalLoaded: Long,
    val classesUnloaded: Long,
    val gcCount: Long,
    val gcTimeMillis: Long,
    // null when com.sun.management.OperatingSystemMXBean / load average is unavailable.
    val cpuProcess: Double?,
    val cpuSystem: Double?,
    val systemLoadAverage: Double?,
    val availableProcessors: Int,
)

/**
 * Best-effort runtime readout for a downstream service (CRS or RMS) on the admin
 * System tab. The same shape serves both: each exposes a Spring Boot actuator with
 * an aggregate `/actuator/health` and JVM metrics.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class ServiceRuntime(
    val available: Boolean,
    val reason: String?,
    val status: String?,
    val uptimeMillis: Long?,
    val jvm: ServiceJvm?,
    // Whether the service answered the actuator health probe at all. `true` even
    // when the aggregate status is DOWN — it distinguishes "reachable but a
    // component degraded" from "unreachable", so the admin System tab stops
    // mislabelling an integration outage as "service is down or unreachable".
    val reachable: Boolean = false,
    // Names of health components reported DOWN/OUT_OF_SERVICE in the aggregate
    // (UNKNOWN — e.g. discoveryComposite — is not a failure and is excluded).
    val downComponents: List<String> = emptyList(),
    // The CRS `employeeService` health component (status + reason), mirrored so the
    // banner can name the actual cause when it is the sole reason CRS is degraded.
    // Absent (null) for services without that component, e.g. RMS.
    val employeeService: ServiceComponentHealth? = null,
)

/** A single actuator health component: its status and (best-effort) reason detail. */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class ServiceComponentHealth(
    val status: String?,
    val reason: String?,
)

/** Best-effort subset of a service's JVM metrics — every field nullable (any can degrade). */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class ServiceJvm(
    val heapUsedBytes: Long?,
    val heapCommittedBytes: Long?,
    val heapMaxBytes: Long?,
    val threadsLive: Int?,
    val threadsPeak: Int?,
    val threadsDaemon: Int?,
    val gcCount: Long?,
    val gcTimeMillis: Long?,
    val cpuProcess: Double?,
    val cpuSystem: Double?,
    val availableProcessors: Int?,
)
