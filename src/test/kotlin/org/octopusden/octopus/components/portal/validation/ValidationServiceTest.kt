package org.octopusden.octopus.components.portal.validation

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.octopusden.octopus.components.portal.validation.client.RegistryClient
import org.octopusden.octopus.components.portal.validation.client.ReleaseManagementClient
import org.octopusden.octopus.components.portal.validation.validators.UnregisteredReleasedVersionsValidator
import java.net.InetSocketAddress
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Unit tests for [ValidationService] using in-process HTTP stubs for CRS and RM.
 * Both clients are constructed directly (no Spring), pointed at the stubs; the
 * real [UnregisteredReleasedVersionsValidator] participates so the aggregation is
 * exercised end-to-end through the orchestrator.
 *
 * Failure modes under test (P1/P2):
 *  - a per-component client error → checkFailed=true (not empty/clean),
 *  - a component-list fetch failure → RETAIN previous good components + set
 *    refreshError + lastAttemptAt while leaving generatedAt,
 *  - the single-flight guard makes a concurrent refresh() a no-op.
 */
class ValidationServiceTest {
    private val servers = mutableListOf<HttpServer>()

    @AfterEach
    fun tearDown() {
        servers.forEach { it.stop(0) }
        servers.clear()
    }

    private fun newServer(): HttpServer {
        val stub = HttpServer.create(InetSocketAddress(0), 0)
        stub.start()
        servers.add(stub)
        return stub
    }

    private fun respondJson(
        exchange: HttpExchange,
        status: Int,
        body: String,
    ) {
        val bytes = body.toByteArray()
        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(status, if (bytes.isEmpty()) -1 else bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }

    private fun service(
        crs: HttpServer,
        rm: HttpServer,
        timeoutSeconds: Long = 10,
    ): ValidationService {
        val properties =
            ValidationProperties().apply {
                registryBaseUrl = "http://localhost:${crs.address.port}"
                releaseManagementBaseUrl = "http://localhost:${rm.address.port}"
                requestTimeoutSeconds = timeoutSeconds
                sweepTimeoutSeconds = 30
                liveTimeoutSeconds = 30
                concurrency = 4
            }
        val registry = RegistryClient(properties)
        val rmClient = ReleaseManagementClient(properties)
        val validator = UnregisteredReleasedVersionsValidator(registry)
        return ValidationService(registry, rmClient, listOf(validator), properties)
    }

    @Test
    @DisplayName("sweep aggregates per-component results and refresh populates the cache")
    fun `sweep aggregates and caches`() {
        val crs = newServer()
        crs.createContext("/rest/api/3/components") { exchange ->
            respondJson(exchange, 200, """[{"id":"good"},{"id":"bad"}]""")
        }
        crs.createContext("/rest/api/2/components") { exchange ->
            // "good" resolves everything; "bad" resolves nothing → a missing problem.
            val path = exchange.requestURI.path
            if (path.contains("/good/")) {
                respondJson(exchange, 200, """{"versions":{"1.0.1":{}}}""")
            } else {
                respondJson(exchange, 200, """{"versions":{}}""")
            }
        }
        val rm = newServer()
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 200, """[{"version":"1.0.1","status":"RELEASE"}]""")
        }

        val svc = service(crs, rm)
        // pre-first-sweep: empty cache
        assertNull(svc.currentReport().generatedAt)
        assertTrue(svc.currentReport().components.isEmpty())

        svc.refresh()

        val report = svc.currentReport()
        assertNotNull(report.generatedAt)
        assertNull(report.refreshError)
        assertEquals(2, report.components.size)
        val bad = report.components.single { it.component == "bad" }
        assertEquals(1, bad.problems.size)
        assertFalse(bad.checkFailed)
        val good = report.components.single { it.component == "good" }
        assertTrue(good.problems.isEmpty())
        assertFalse(good.checkFailed)
    }

    @Test
    @DisplayName("P1: a per-component client error yields checkFailed=true (NOT empty/clean)")
    fun `per component error surfaces as checkFailed`() {
        val crs = newServer()
        crs.createContext("/rest/api/3/components") { exchange ->
            respondJson(exchange, 200, """[{"id":"broken"}]""")
        }
        crs.createContext("/rest/api/2/components") { exchange ->
            respondJson(exchange, 200, """{"versions":{}}""")
        }
        val rm = newServer()
        // RM returns 500 for this component → per-component error.
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 500, """{"error":"boom"}""")
        }

        val svc = service(crs, rm)
        svc.refresh()

        val report = svc.currentReport()
        // Whole-sweep succeeded (component list fetched); per-component failure is surfaced.
        assertNull(report.refreshError)
        val cv = report.components.single { it.component == "broken" }
        assertTrue(cv.checkFailed, "a transport error must mark checkFailed, not clean")
        assertTrue(cv.problems.isEmpty())
        assertNotNull(cv.checkError)
    }

    @Test
    @DisplayName("P2: a component-list fetch failure retains previous good components + sets refreshError")
    fun `sweep failure retains previous good report`() {
        // Phase 1: a good sweep populates the cache.
        val crsGood = newServer()
        crsGood.createContext("/rest/api/3/components") { exchange ->
            respondJson(exchange, 200, """[{"id":"good"}]""")
        }
        crsGood.createContext("/rest/api/2/components") { exchange ->
            respondJson(exchange, 200, """{"versions":{"1.0.1":{}}}""")
        }
        val rm = newServer()
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 200, """[{"version":"1.0.1","status":"RELEASE"}]""")
        }
        val svc = service(crsGood, rm)
        svc.refresh()
        val firstGeneratedAt = svc.currentReport().generatedAt
        assertNotNull(firstGeneratedAt)
        assertEquals(listOf("good"), svc.currentReport().components.map { it.component })

        // Phase 2: make the component-list fetch fail. Re-point the service's registry
        // base URL at a CRS that 500s on /components by rebuilding the service against
        // a failing stub but keeping the SAME held report — emulated by a second sweep
        // on a service whose CRS list endpoint errors. We instead drive the existing
        // service after swapping the CRS components handler to a 500.
        crsGood.removeContext("/rest/api/3/components")
        crsGood.createContext("/rest/api/3/components") { exchange ->
            respondJson(exchange, 500, """{"error":"list-down"}""")
        }

        svc.refresh()

        val stale = svc.currentReport()
        assertNotNull(stale.refreshError, "a list-fetch failure must set refreshError")
        assertEquals(firstGeneratedAt, stale.generatedAt, "generatedAt must point at the last SUCCESS")
        assertNotNull(stale.lastAttemptAt)
        assertEquals(listOf("good"), stale.components.map { it.component }, "previous good components retained")
    }

    @Test
    @DisplayName("single-flight guard: a concurrent refresh() is a no-op (only one sweep runs)")
    fun `single flight guard makes concurrent refresh a no-op`() {
        val listCalls = AtomicInteger(0)
        val sweepStarted = CountDownLatch(1)
        val releaseSweep = CountDownLatch(1)

        val crs = newServer()
        crs.createContext("/rest/api/3/components") { exchange ->
            listCalls.incrementAndGet()
            sweepStarted.countDown()
            // Block the first sweep so the second refresh() overlaps it.
            releaseSweep.await(10, TimeUnit.SECONDS)
            respondJson(exchange, 200, """[]""")
        }
        val rm = newServer()
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 200, """[]""")
        }

        val svc = service(crs, rm, timeoutSeconds = 30)

        val first = Thread { svc.refresh() }
        first.start()
        // Wait until the first sweep is actually in-flight inside componentIds().
        assertTrue(sweepStarted.await(5, TimeUnit.SECONDS), "first sweep did not start")

        // Second refresh while the first is blocked → must short-circuit (no second list call).
        svc.refresh()

        // Let the first sweep finish.
        releaseSweep.countDown()
        first.join(10_000)

        assertEquals(1, listCalls.get(), "only one sweep may run; the concurrent refresh must be a no-op")
    }

    @Test
    @DisplayName("validateLive runs a per-component check on demand (bypassing cache)")
    fun `validateLive returns live per-component result`() {
        val crs = newServer()
        crs.createContext("/rest/api/2/components") { exchange ->
            respondJson(exchange, 200, """{"versions":{}}""")
        }
        // No /rest/api/3/components handler registered: validateLive must not fetch the list.
        val rm = newServer()
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 200, """[{"version":"9.9.9","status":"RELEASE"}]""")
        }

        val svc = service(crs, rm)
        val cv = svc.validateLive("live-comp").block(Duration.ofSeconds(10))!!

        assertEquals("live-comp", cv.component)
        assertFalse(cv.checkFailed)
        assertEquals(1, cv.problems.size)
        assertEquals(listOf("9.9.9"), cv.problems.single().details["versions"])
    }
}
