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
        // Non-zero backlog: under full-suite load several WebClient connections can
        // arrive at once; a backlog of 0 lets the OS refuse the overflow, which
        // surfaced as intermittent "component list came back short" failures.
        val stub = HttpServer.create(InetSocketAddress(0), SERVER_BACKLOG)
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
        liveTimeoutSeconds: Long = 30,
        sweepTimeoutSeconds: Long = 30,
        refreshIntervalMs: Long = 14_400_000,
        retryIntervalMs: Long = 600_000,
    ): ValidationService {
        val properties =
            ValidationProperties().apply {
                registryBaseUrl = "http://localhost:${crs.address.port}"
                releaseManagementBaseUrl = "http://localhost:${rm.address.port}"
                requestTimeoutSeconds = timeoutSeconds
                this.sweepTimeoutSeconds = sweepTimeoutSeconds
                this.liveTimeoutSeconds = liveTimeoutSeconds
                this.refreshIntervalMs = refreshIntervalMs
                this.retryIntervalMs = retryIntervalMs
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
            // Real CRS shape: id nested under "component".
            respondJson(
                exchange,
                200,
                """[{"component":{"id":"good"},"variants":{}},{"component":{"id":"bad"},"variants":{}}]""",
            )
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
            respondJson(exchange, 200, """[{"component":{"id":"broken"},"variants":{}}]""")
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
            respondJson(exchange, 200, """[{"component":{"id":"good"},"variants":{}}]""")
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
    @DisplayName("P1: a connection-class sweep failure sets a CATEGORIZED refreshError and retains components")
    fun `sweep connection failure sets categorized refreshError`() {
        // Phase 1: a good sweep populates the cache.
        val crs = newServer()
        crs.createContext("/rest/api/3/components") { exchange ->
            respondJson(exchange, 200, """[{"component":{"id":"good"},"variants":{}}]""")
        }
        crs.createContext("/rest/api/2/components") { exchange ->
            respondJson(exchange, 200, """{"versions":{"1.0.1":{}}}""")
        }
        val rm = newServer()
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 200, """[{"version":"1.0.1","status":"RELEASE"}]""")
        }
        val svc = service(crs, rm)
        svc.refresh()
        val firstGeneratedAt = svc.currentReport().generatedAt
        assertNotNull(firstGeneratedAt)

        // Phase 2: kill the CRS server entirely → the next componentIds() call hits a
        // refused connection (a WebClientRequestException-class failure), distinct from
        // a 5xx response. This must produce the CATEGORIZED, host-free refreshError.
        crs.stop(0)
        servers.remove(crs)

        svc.refresh()

        val stale = svc.currentReport()
        val reason = stale.refreshError
        assertNotNull(reason)
        assertTrue(
            reason!!.startsWith("components-registry unreachable: "),
            "expected a categorized unreachable reason, got: $reason",
        )
        // Still sanitized: no host/port/URL leaks into the client-facing value.
        assertFalse(reason.contains("localhost"))
        assertFalse(reason.contains("http"))
        // Previous good components + last-success generatedAt retained (stale-but-honest).
        assertEquals(firstGeneratedAt, stale.generatedAt, "generatedAt must point at the last SUCCESS")
        assertEquals(listOf("good"), stale.components.map { it.component }, "previous good components retained")
    }

    @Test
    @DisplayName("a sweep timeout yields a TIMED-OUT refreshError (NOT 'unreachable') + retains components")
    fun `sweep timeout sets timed out refreshError`() {
        // Phase 1: a fast, good sweep populates the cache.
        val crs = newServer()
        val slow = java.util.concurrent.atomic.AtomicBoolean(false)
        crs.createContext("/rest/api/3/components") { exchange ->
            // Phase 2 makes the list call stall past the (1s) sweep budget — reachable but slow.
            if (slow.get()) {
                Thread.sleep(3_000)
            }
            respondJson(exchange, 200, """[{"component":{"id":"good"},"variants":{}}]""")
        }
        crs.createContext("/rest/api/2/components") { exchange ->
            respondJson(exchange, 200, """{"versions":{"1.0.1":{}}}""")
        }
        val rm = newServer()
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 200, """[{"version":"1.0.1","status":"RELEASE"}]""")
        }

        // requestTimeout high (10s) so the per-request timeout does NOT fire — it's the
        // 1s whole-sweep budget that trips, exercising the .block(timeout) path.
        val svc = service(crs, rm, timeoutSeconds = 10, sweepTimeoutSeconds = 1)
        svc.refresh()
        val firstGeneratedAt = svc.currentReport().generatedAt
        assertNotNull(firstGeneratedAt)

        // Phase 2: stall the list call → whole-sweep budget (1s) overruns.
        slow.set(true)
        svc.refresh()

        val stale = svc.currentReport()
        val reason = stale.refreshError
        assertNotNull(reason, "a sweep timeout must set refreshError")
        assertTrue(reason!!.contains("timed out"), "expected a timed-out reason, got: $reason")
        assertFalse(
            reason.contains("unreachable"),
            "a timeout must NOT be reported as unreachable (URL/connectivity is fine): $reason",
        )
        // Still sanitized: no host/port/URL leaks into the client-facing value.
        assertFalse(reason.contains("localhost"))
        assertFalse(reason.contains("http"))
        // Stale-but-honest: previous good components + last-success generatedAt retained.
        assertEquals(firstGeneratedAt, stale.generatedAt, "generatedAt must point at the last SUCCESS")
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
    @DisplayName("failure-backoff: before any sweep the next delay is the normal refresh interval")
    fun `next delay is refresh interval before any sweep`() {
        val crs = newServer()
        val rm = newServer()
        val svc = service(crs, rm, refreshIntervalMs = 14_400_000, retryIntervalMs = 600_000)

        // No refresh yet → no refreshError → normal cadence (the startup sweep owns the
        // immediate first run; the scheduled trigger must not hammer at the retry rate).
        assertEquals(14_400_000, svc.nextDelayMillis())
    }

    @Test
    @DisplayName("failure-backoff: after a SUCCESSFUL sweep the next delay is the normal refresh interval")
    fun `next delay is refresh interval after success`() {
        val crs = newServer()
        crs.createContext("/rest/api/3/components") { exchange ->
            respondJson(exchange, 200, """[{"component":{"id":"good"},"variants":{}}]""")
        }
        crs.createContext("/rest/api/2/components") { exchange ->
            respondJson(exchange, 200, """{"versions":{"1.0.1":{}}}""")
        }
        val rm = newServer()
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 200, """[{"version":"1.0.1","status":"RELEASE"}]""")
        }

        val svc = service(crs, rm, refreshIntervalMs = 14_400_000, retryIntervalMs = 600_000)
        svc.refresh()

        assertNull(svc.currentReport().refreshError)
        assertEquals(14_400_000, svc.nextDelayMillis())
    }

    @Test
    @DisplayName("failure-backoff: after a FAILED sweep the next delay is the SHORT retry interval")
    fun `next delay is retry interval after failure`() {
        // CRS list endpoint 500s → whole-sweep failure → refreshError set.
        val crs = newServer()
        crs.createContext("/rest/api/3/components") { exchange ->
            respondJson(exchange, 500, """{"error":"list-down"}""")
        }
        val rm = newServer()
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 200, """[]""")
        }

        val svc = service(crs, rm, refreshIntervalMs = 14_400_000, retryIntervalMs = 600_000)
        svc.refresh()

        assertNotNull(svc.currentReport().refreshError, "a whole-sweep failure must set refreshError")
        assertEquals(
            600_000,
            svc.nextDelayMillis(),
            "after a failed refresh the next sweep must be scheduled at the short retry interval",
        )
    }

    @Test
    @DisplayName("failure-backoff: a recovered sweep returns the cadence to the normal interval")
    fun `next delay returns to refresh interval after recovery`() {
        val crs = newServer()
        val down = java.util.concurrent.atomic.AtomicBoolean(true)
        crs.createContext("/rest/api/3/components") { exchange ->
            if (down.get()) {
                respondJson(exchange, 500, """{"error":"list-down"}""")
            } else {
                respondJson(exchange, 200, """[{"component":{"id":"good"},"variants":{}}]""")
            }
        }
        crs.createContext("/rest/api/2/components") { exchange ->
            respondJson(exchange, 200, """{"versions":{"1.0.1":{}}}""")
        }
        val rm = newServer()
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 200, """[{"version":"1.0.1","status":"RELEASE"}]""")
        }

        val svc = service(crs, rm, refreshIntervalMs = 14_400_000, retryIntervalMs = 600_000)
        svc.refresh()
        assertEquals(600_000, svc.nextDelayMillis(), "failed sweep → retry interval")

        // Recover: the next sweep succeeds and clears refreshError → back to normal cadence.
        down.set(false)
        svc.refresh()
        assertNull(svc.currentReport().refreshError)
        assertEquals(14_400_000, svc.nextDelayMillis(), "recovered sweep → normal interval")
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

    @Test
    @DisplayName("validateLive timeout surfaces as checkFailed=true (NOT an error/500)")
    fun `validateLive timeout yields checkFailed`() {
        val crs = newServer()
        crs.createContext("/rest/api/2/components") { exchange ->
            respondJson(exchange, 200, """{"versions":{}}""")
        }
        val rm = newServer()
        // RM stalls past the live-timeout budget; the per-call request timeout is left
        // high (default 10s) so it's the OUTER live timeout that fires.
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            Thread.sleep(3_000)
            respondJson(exchange, 200, """[]""")
        }

        val svc = service(crs, rm, timeoutSeconds = 10, liveTimeoutSeconds = 1)
        val cv = svc.validateLive("slow-comp").block(Duration.ofSeconds(10))!!

        assertEquals("slow-comp", cv.component)
        assertTrue(cv.checkFailed, "a live-check timeout must surface as checkFailed, not an error")
        assertTrue(cv.problems.isEmpty())
        assertNotNull(cv.checkError)
    }

    @Test
    @DisplayName("ValidationProperties: retry interval >= refresh interval is rejected (backoff guard)")
    fun `retry interval must be shorter than refresh interval`() {
        jakarta.validation.Validation.buildDefaultValidatorFactory().use { factory ->
            val validator = factory.validator
            val base = { url: String ->
                ValidationProperties().apply {
                    registryBaseUrl = url
                    releaseManagementBaseUrl = url
                }
            }

            // retry < refresh → valid
            val ok = base("http://localhost").apply {
                refreshIntervalMs = 14_400_000
                retryIntervalMs = 600_000
            }
            assertTrue(validator.validate(ok).none { it.propertyPath.toString().contains("RetryInterval") })

            // retry >= refresh → a violation on the cross-field guard
            val bad = base("http://localhost").apply {
                refreshIntervalMs = 600_000
                retryIntervalMs = 600_000
            }
            assertTrue(
                validator.validate(bad).any { it.message.contains("shorter than refresh-interval-ms") },
                "retry >= refresh must be rejected",
            )
        }
    }

    private companion object {
        private const val SERVER_BACKLOG = 16
    }
}
