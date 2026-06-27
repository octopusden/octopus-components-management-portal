package org.octopusden.octopus.components.portal.metrics

import com.fasterxml.jackson.annotation.JsonInclude
import org.octopusden.octopus.components.portal.security.RecentLogin
import java.time.Instant

/**
 * Wire model for `GET /portal/metrics` — the admin System tab on the Admin Settings
 * page. Portal metrics are always present (read locally from JVM MXBeans); CRS
 * metrics are best-effort (queried with the caller's relayed bearer token; CRS
 * health stays anonymous) and may be unavailable, in which case only
 * `available`/`reason` (+ `status`) carry.
 */
data class MetricsResponse(
    val portal: PortalRuntime,
    val crs: CrsRuntime,
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

@JsonInclude(JsonInclude.Include.NON_NULL)
data class CrsRuntime(
    val available: Boolean,
    val reason: String?,
    val status: String?,
    val uptimeMillis: Long?,
    val jvm: CrsJvm?,
)

/** Best-effort subset of CRS JVM metrics — every field nullable (any can degrade). */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class CrsJvm(
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
