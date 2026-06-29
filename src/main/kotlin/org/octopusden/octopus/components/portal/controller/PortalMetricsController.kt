package org.octopusden.octopus.components.portal.controller

import org.octopusden.octopus.components.portal.configuration.SecurityConfig
import org.octopusden.octopus.components.portal.metrics.MetricsResponse
import org.octopusden.octopus.components.portal.metrics.PortalJvm
import org.octopusden.octopus.components.portal.metrics.PortalRuntime
import org.octopusden.octopus.components.portal.metrics.ServiceRuntimeMetricsClient
import org.octopusden.octopus.components.portal.security.RecentLoginsTracker
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.security.core.context.ReactiveSecurityContextHolder
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient
import org.springframework.security.oauth2.client.web.server.ServerOAuth2AuthorizedClientRepository
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ServerWebExchange
import reactor.core.publisher.Mono
import java.lang.management.ManagementFactory
import java.time.Instant
import java.util.Optional

/**
 * `GET /portal/metrics` — runtime/system metrics for the admin System tab on the
 * Admin Settings page. Authenticated()-only (see SecurityConfig); admin visibility
 * is enforced in the SPA. Portal metrics are read locally from JVM MXBeans (always
 * present); CRS metrics are best-effort and use the caller's relayed bearer token
 * (see [ServiceRuntimeMetricsClient]). RMS (release-management-service) metrics are
 * best-effort too but anonymous — the RMS client is wired with relayToken=false, so
 * no bearer is attached regardless of the token passed here.
 */
@RestController
@RequestMapping("portal")
class PortalMetricsController(
    @Qualifier("crsRuntimeMetricsClient")
    private val crsRuntimeMetricsClient: ServiceRuntimeMetricsClient,
    @Qualifier("rmsRuntimeMetricsClient")
    private val rmsRuntimeMetricsClient: ServiceRuntimeMetricsClient,
    private val recentLoginsTracker: RecentLoginsTracker,
    private val authorizedClientRepository: ServerOAuth2AuthorizedClientRepository,
) {
    @GetMapping("/metrics")
    fun metrics(exchange: ServerWebExchange): Mono<MetricsResponse> =
        crsAccessToken(exchange).flatMap { token ->
            // CRS gets the caller's bearer (authenticated() metrics); RMS metrics are
            // anonymous so the token is ignored by its client (relayToken=false).
            Mono.zip(
                crsRuntimeMetricsClient.fetch(token.orElse(null)),
                rmsRuntimeMetricsClient.fetch(null),
            ).map { tuple ->
                MetricsResponse(portal = readPortalRuntime(), crs = tuple.t1, rms = tuple.t2)
            }
        }

    /**
     * The caller's CRS access token from the BFF session, relayed to CRS actuator so
     * its authenticated() metrics answer. Loaded leniently from the authorized-client
     * repository (absent → empty, no re-authorization), so a non-OAuth2 principal
     * (e.g. tests) yields no token and CRS metrics simply degrade.
     */
    private fun crsAccessToken(exchange: ServerWebExchange): Mono<Optional<String>> =
        ReactiveSecurityContextHolder
            .getContext()
            .flatMap { context ->
                authorizedClientRepository
                    .loadAuthorizedClient<OAuth2AuthorizedClient>(
                        SecurityConfig.OIDC_REGISTRATION_ID,
                        context.authentication,
                        exchange,
                    )
                    .map { Optional.ofNullable(it.accessToken?.tokenValue) }
            }
            .defaultIfEmpty(Optional.empty())

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
            processId = ProcessHandle.current().pid(),
            javaVersion = System.getProperty("java.version").orEmpty(),
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
