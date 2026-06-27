package org.octopusden.octopus.components.portal.controller

import org.octopusden.octopus.components.portal.metrics.CrsRuntimeMetricsClient
import org.octopusden.octopus.components.portal.metrics.MetricsResponse
import org.octopusden.octopus.components.portal.metrics.PortalJvm
import org.octopusden.octopus.components.portal.metrics.PortalRuntime
import org.octopusden.octopus.components.portal.security.RecentLoginsTracker
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import reactor.core.publisher.Mono
import java.lang.management.ManagementFactory
import java.time.Instant

/**
 * `GET /portal/metrics` — runtime/system metrics for the admin Runtime card on the
 * Health page. Authenticated()-only (see SecurityConfig); admin visibility is
 * enforced in the SPA. Portal metrics are read locally from JVM MXBeans (always
 * present); CRS metrics are best-effort (see [CrsRuntimeMetricsClient]).
 */
@RestController
@RequestMapping("portal")
class PortalMetricsController(
    private val crsRuntimeMetricsClient: CrsRuntimeMetricsClient,
    private val recentLoginsTracker: RecentLoginsTracker,
) {
    @GetMapping("/metrics")
    fun metrics(): Mono<MetricsResponse> =
        crsRuntimeMetricsClient.fetch().map { crs -> MetricsResponse(portal = readPortalRuntime(), crs = crs) }

    private fun readPortalRuntime(): PortalRuntime {
        val runtime = ManagementFactory.getRuntimeMXBean()
        val memory = ManagementFactory.getMemoryMXBean()
        val threads = ManagementFactory.getThreadMXBean()
        val classes = ManagementFactory.getClassLoadingMXBean()
        val gcBeans = ManagementFactory.getGarbageCollectorMXBeans()
        val os = ManagementFactory.getOperatingSystemMXBean()

        val heap = memory.heapMemoryUsage
        val nonHeap = memory.nonHeapMemoryUsage
        // collectionCount/Time return -1 when the collector doesn't report; clamp so a
        // single non-reporting collector doesn't poison the sum.
        val gcCount = gcBeans.sumOf { it.collectionCount.coerceAtLeast(0) }
        val gcTimeMillis = gcBeans.sumOf { it.collectionTime.coerceAtLeast(0) }

        // CPU load is only on the com.sun extension MXBean; absent on exotic JVMs.
        // The bean returns a negative value when a reading isn't available → null.
        val sunOs = os as? com.sun.management.OperatingSystemMXBean
        val cpuProcess = sunOs?.processCpuLoad?.takeIf { it >= 0 }
        val cpuSystem = sunOs?.cpuLoad?.takeIf { it >= 0 }
        val loadAverage = os.systemLoadAverage.takeIf { it >= 0 }

        return PortalRuntime(
            uptimeMillis = runtime.uptime,
            startedAt = Instant.ofEpochMilli(runtime.startTime),
            jvm = PortalJvm(
                heapUsedBytes = heap.used,
                heapCommittedBytes = heap.committed,
                heapMaxBytes = heap.max.takeIf { it >= 0 },
                nonHeapUsedBytes = nonHeap.used,
                nonHeapCommittedBytes = nonHeap.committed,
                threadsLive = threads.threadCount,
                threadsPeak = threads.peakThreadCount,
                threadsDaemon = threads.daemonThreadCount,
                classesLoaded = classes.loadedClassCount,
                classesTotalLoaded = classes.totalLoadedClassCount,
                classesUnloaded = classes.unloadedClassCount,
                gcCount = gcCount,
                gcTimeMillis = gcTimeMillis,
                cpuProcess = cpuProcess,
                cpuSystem = cpuSystem,
                systemLoadAverage = loadAverage,
                availableProcessors = os.availableProcessors,
            ),
            recentLogins = recentLoginsTracker.snapshot(),
        )
    }
}
