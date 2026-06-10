package org.octopusden.octopus.components.portal.health

import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.boot.health.contributor.Status
import java.net.InetSocketAddress
import java.time.Duration

/**
 * Unit tests for [EmployeeServiceIntegrationHealthIndicator] against a tiny
 * in-process HTTP stub standing in for the registry's anonymous
 * `/actuator/health/employeeService` component endpoint. No Spring context —
 * the indicator is plain construction over a [WebClient].
 *
 * The registry returns the component status with the conventional actuator
 * HTTP mapping (200 for UP/UNKNOWN, 503 for DOWN), so the indicator must read
 * the BODY status regardless of the HTTP code.
 */
class EmployeeServiceIntegrationHealthIndicatorTest {
    private var server: HttpServer? = null

    @AfterEach
    fun tearDown() {
        server?.stop(0)
    }

    private fun startStub(httpStatus: Int, body: String): String {
        val stub = HttpServer.create(InetSocketAddress(0), 0)
        stub.createContext("/actuator/health/employeeService") { exchange ->
            val bytes = body.toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(httpStatus, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        stub.start()
        server = stub
        return "http://localhost:${stub.address.port}"
    }

    private fun indicator(baseUrl: String) =
        EmployeeServiceIntegrationHealthIndicator(baseUrl)

    private fun healthOf(baseUrl: String) =
        indicator(baseUrl).health().block(Duration.ofSeconds(10))!!

    @Test
    @DisplayName("registry UP → UP")
    fun `up passes through`() {
        val health = healthOf(startStub(200, """{"status":"UP"}"""))
        assertEquals(Status.UP, health.status)
    }

    @Test
    @DisplayName("registry DOWN (503 + body) → DOWN with reason")
    fun `down passes through`() {
        val health = healthOf(startStub(503, """{"status":"DOWN","details":{"reason":"x"}}"""))
        assertEquals(Status.DOWN, health.status)
        assertNotNull(health.details["reason"])
    }

    @Test
    @DisplayName("registry UNKNOWN (integration disabled) → UNKNOWN, not a failure")
    fun `unknown passes through`() {
        val health = healthOf(startStub(200, """{"status":"UNKNOWN","details":{"enabled":false}}"""))
        assertEquals(Status.UNKNOWN, health.status)
    }

    @Test
    @DisplayName("registry without the indicator (404) → UNKNOWN, not a failure")
    fun `missing indicator is UNKNOWN`() {
        val health = healthOf(startStub(404, """{"error":"Not Found"}"""))
        assertEquals(Status.UNKNOWN, health.status)
    }

    @Test
    @DisplayName("registry unreachable → DOWN with reason")
    fun `unreachable is DOWN`() {
        // Port from a stub that has already been shut down — connection refused.
        val baseUrl = startStub(200, """{"status":"UP"}""")
        server!!.stop(0)
        server = null
        val health = healthOf(baseUrl)
        assertEquals(Status.DOWN, health.status)
        assertNotNull(health.details["reason"])
    }
}
