package org.octopusden.octopus.components.portal.metrics

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.time.Duration

/**
 * Unit tests for [ServiceRuntimeMetricsClient] against a tiny in-process HTTP stub
 * standing in for a downstream service's actuator (CRS or RMS). No Spring context —
 * the client is plain construction over a WebClient, mirroring
 * EmployeeServiceIntegrationHealthIndicator.
 */
class ServiceRuntimeMetricsClientTest {
    private var server: HttpServer? = null

    @AfterEach
    fun tearDown() {
        server?.stop(0)
    }

    private fun json(exchange: HttpExchange, status: Int, body: String) {
        val bytes = body.toByteArray()
        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(status, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }

    private fun metric(name: String, statistic: String, value: Number): String =
        """{"name":"$name","measurements":[{"statistic":"$statistic","value":$value}]}"""

    /** Starts a stub serving health UP and a full metrics set. */
    private fun startHealthyStub(): String {
        val stub = HttpServer.create(InetSocketAddress(0), 0)
        stub.createContext("/actuator/health") { json(it, 200, """{"status":"UP"}""") }
        stub.createContext("/actuator/metrics/") { exchange ->
            // Path is /actuator/metrics/<name>; tag query (?tag=area:heap) is ignored by the stub.
            val name = exchange.requestURI.path.removePrefix("/actuator/metrics/")
            val body = when (name) {
                "process.uptime" -> metric(name, "VALUE", 120.0) // seconds
                "jvm.memory.used" -> metric(name, "VALUE", 536870912)
                "jvm.memory.committed" -> metric(name, "VALUE", 805306368)
                "jvm.memory.max" -> metric(name, "VALUE", 1073741824)
                "jvm.threads.live" -> metric(name, "VALUE", 42)
                "jvm.threads.peak" -> metric(name, "VALUE", 55)
                "jvm.threads.daemon" -> metric(name, "VALUE", 30)
                "jvm.gc.pause" ->
                    """{"name":"jvm.gc.pause","measurements":""" +
                        """[{"statistic":"COUNT","value":12},{"statistic":"TOTAL_TIME","value":0.5}]}"""
                "process.cpu.usage" -> metric(name, "VALUE", 0.12)
                "system.cpu.usage" -> metric(name, "VALUE", 0.34)
                "system.cpu.count" -> metric(name, "VALUE", 8)
                else -> null
            }
            if (body != null) json(exchange, 200, body) else json(exchange, 404, """{"error":"not found"}""")
        }
        stub.start()
        server = stub
        return "http://localhost:${stub.address.port}"
    }

    private fun fetch(baseUrl: String, bearerToken: String? = null): ServiceRuntime =
        ServiceRuntimeMetricsClient(baseUrl, relayToken = true).fetch(bearerToken).block(Duration.ofSeconds(10))!!

    @Test
    fun `healthy CRS maps status, uptime (sec to ms) and the full jvm subset`() {
        val crs = fetch(startHealthyStub())

        assertTrue(crs.available)
        assertNull(crs.reason)
        assertEquals("UP", crs.status)
        assertEquals(120_000L, crs.uptimeMillis) // 120 s -> ms
        val jvm = crs.jvm!!
        assertEquals(536870912L, jvm.heapUsedBytes)
        assertEquals(805306368L, jvm.heapCommittedBytes)
        assertEquals(1073741824L, jvm.heapMaxBytes)
        assertEquals(42, jvm.threadsLive)
        assertEquals(55, jvm.threadsPeak)
        assertEquals(30, jvm.threadsDaemon)
        assertEquals(12L, jvm.gcCount)
        assertEquals(500L, jvm.gcTimeMillis) // 0.5 s -> ms
        assertEquals(0.12, jvm.cpuProcess)
        assertEquals(0.34, jvm.cpuSystem)
        assertEquals(8, jvm.availableProcessors)
    }

    @Test
    fun `metrics requiring auth (401) yields unavailable with reason but keeps health status`() {
        val stub = HttpServer.create(InetSocketAddress(0), 0)
        stub.createContext("/actuator/health") { json(it, 200, """{"status":"UP"}""") }
        stub.createContext("/actuator/metrics/") { json(it, 401, """{"error":"Unauthorized"}""") }
        stub.start()
        server = stub
        val crs = fetch("http://localhost:${stub.address.port}")

        assertFalse(crs.available)
        assertNotNull(crs.reason)
        assertTrue(crs.reason!!.contains("auth", ignoreCase = true))
        assertEquals("UP", crs.status) // health still surfaced
        assertNull(crs.jvm)
        assertNull(crs.uptimeMillis)
    }

    @Test
    fun `relays the bearer token so a token-gated metrics endpoint answers`() {
        val stub = HttpServer.create(InetSocketAddress(0), 0)
        stub.createContext("/actuator/health") { json(it, 200, """{"status":"UP"}""") }
        stub.createContext("/actuator/metrics/") { exchange ->
            // Mirrors CRS: actuator metrics require a Bearer JWT (authenticated()).
            if (exchange.requestHeaders.getFirst("Authorization") != "Bearer test-token") {
                json(exchange, 401, """{"error":"Unauthorized"}""")
                return@createContext
            }
            val name = exchange.requestURI.path.removePrefix("/actuator/metrics/")
            val body = if (name == "process.uptime") metric(name, "VALUE", 60.0) else metric(name, "VALUE", 1)
            json(exchange, 200, body)
        }
        stub.start()
        server = stub
        val baseUrl = "http://localhost:${stub.address.port}"

        // Without a token the metrics endpoint 401s → unavailable.
        assertFalse(fetch(baseUrl).available)
        // With the relayed token it answers → available.
        val withToken = fetch(baseUrl, "test-token")
        assertTrue(withToken.available)
        assertEquals(60_000L, withToken.uptimeMillis)
    }

    @Test
    fun `relayToken=false never attaches a bearer so anonymous metrics resolve available`() {
        val stub = HttpServer.create(InetSocketAddress(0), 0)
        stub.createContext("/actuator/health") { json(it, 200, """{"status":"UP"}""") }
        stub.createContext("/actuator/metrics/") { exchange ->
            // Mirrors RMS: actuator metrics are ANONYMOUS — any Authorization header
            // is unexpected. Reject if one is present, so the assertion proves the
            // client sent none even when a token was passed.
            if (exchange.requestHeaders.getFirst("Authorization") != null) {
                json(exchange, 401, """{"error":"unexpected Authorization header"}""")
                return@createContext
            }
            val name = exchange.requestURI.path.removePrefix("/actuator/metrics/")
            val body = if (name == "process.uptime") metric(name, "VALUE", 90.0) else metric(name, "VALUE", 1)
            json(exchange, 200, body)
        }
        stub.start()
        server = stub
        val baseUrl = "http://localhost:${stub.address.port}"

        // Even when a token is passed, relayToken=false must NOT attach it → metrics answer.
        val rms = ServiceRuntimeMetricsClient(baseUrl, relayToken = false)
            .fetch("would-be-token")
            .block(Duration.ofSeconds(10))!!
        assertTrue(rms.available)
        assertEquals(90_000L, rms.uptimeMillis)
        assertEquals("UP", rms.status)
        assertNull(rms.employeeService) // RMS has no employeeService component
    }

    @Test
    fun `unreachable CRS yields unavailable with reason and null status`() {
        val baseUrl = startHealthyStub()
        server!!.stop(0)
        server = null
        val crs = fetch(baseUrl)

        assertFalse(crs.available)
        assertNotNull(crs.reason)
        assertNull(crs.status)
        assertNull(crs.jvm)
        assertFalse(crs.reachable) // no health response at all
        assertTrue(crs.downComponents.isEmpty())
        assertNull(crs.employeeService)
    }

    @Test
    fun `healthy CRS is reachable with no down components`() {
        val crs = fetch(startHealthyStub())

        assertTrue(crs.reachable)
        assertTrue(crs.downComponents.isEmpty())
        assertNull(crs.employeeService)
    }

    @Test
    fun `empty-body health response still emits a result instead of completing empty`() {
        // Regression: a service answering with an empty body makes bodyToMono complete
        // empty; without the switchIfEmpty coalesce that propagates through Mono.zip and
        // blanks the whole /portal/metrics response (204 → undefined on the SPA). The
        // fetch() helper blocks on the result, so the old behaviour would NPE here.
        val crs = fetch(startHealthStub(200, ""))

        assertFalse(crs.reachable) // no parseable snapshot → surfaced as unreachable
        assertNull(crs.status)
    }

    /** Serves a 503 aggregate health with the given components block. */
    private fun startHealthStub(status: Int, healthBody: String): String {
        val stub = HttpServer.create(InetSocketAddress(0), 0)
        stub.createContext("/actuator/health") { json(it, status, healthBody) }
        stub.createContext("/actuator/metrics/") { json(it, 401, """{"error":"Unauthorized"}""") }
        stub.start()
        server = stub
        return "http://localhost:${stub.address.port}"
    }

    @Test
    fun `aggregate DOWN solely from employeeService stays reachable and surfaces the component reason`() {
        val body =
            """{"status":"DOWN","components":{""" +
                """"db":{"status":"UP"},""" +
                """"employeeService":{"status":"DOWN","details":{"reason":"employee-service lookup failed"}},""" +
                """"discoveryComposite":{"status":"UNKNOWN"}""" +
                """}}"""
        val crs = fetch(startHealthStub(503, body))

        assertTrue(crs.reachable) // CRS answered — not "unreachable"
        assertEquals("DOWN", crs.status)
        assertEquals(listOf("employeeService"), crs.downComponents) // UNKNOWN discoveryComposite excluded
        assertEquals("DOWN", crs.employeeService?.status)
        assertNotNull(crs.employeeService?.reason)
        assertTrue(crs.employeeService!!.reason!!.contains("employee-service", ignoreCase = true))
    }

    @Test
    fun `aggregate DOWN from a core component lists it among downComponents`() {
        val body =
            """{"status":"DOWN","components":{""" +
                """"db":{"status":"DOWN","details":{"reason":"connection refused"}},""" +
                """"employeeService":{"status":"UP"}""" +
                """}}"""
        val crs = fetch(startHealthStub(503, body))

        assertTrue(crs.reachable)
        assertTrue(crs.downComponents.contains("db"))
        assertEquals("UP", crs.employeeService?.status)
    }
}
