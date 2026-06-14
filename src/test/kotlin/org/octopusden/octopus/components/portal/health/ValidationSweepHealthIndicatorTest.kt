package org.octopusden.octopus.components.portal.health

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.octopusden.octopus.components.portal.validation.ValidationProperties
import org.octopusden.octopus.components.portal.validation.ValidationService
import org.octopusden.octopus.components.portal.validation.client.RegistryClient
import org.octopusden.octopus.components.portal.validation.client.ReleaseManagementClient
import org.octopusden.octopus.components.portal.validation.validators.UnregisteredReleasedVersionsValidator
import org.springframework.boot.health.contributor.Status
import java.net.InetSocketAddress

/**
 * Unit tests for [ValidationSweepHealthIndicator]. It reads the cached report
 * from a real [ValidationService] (driven into each state via in-process HTTP
 * stubs, mirroring ValidationServiceTest) — it makes no HTTP calls itself.
 *
 * The key contract beyond status mapping: because `/actuator/health` is
 * anonymous, the health DETAILS must never contain an internal URL/host — only
 * the sanitized category, timestamps and counts.
 */
class ValidationSweepHealthIndicatorTest {
    private val servers = mutableListOf<HttpServer>()

    @AfterEach
    fun tearDown() {
        servers.forEach { it.stop(0) }
        servers.clear()
    }

    private fun newServer(): HttpServer {
        // Non-zero backlog so concurrent WebClient connections under full-suite
        // load aren't refused (a backlog of 0 surfaced as intermittent failures).
        val stub = HttpServer.create(InetSocketAddress(0), SERVER_BACKLOG)
        stub.start()
        servers.add(stub)
        return stub
    }

    private fun respondJson(exchange: HttpExchange, status: Int, body: String) {
        val bytes = body.toByteArray()
        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(status, if (bytes.isEmpty()) -1 else bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }

    private fun service(registryBaseUrl: String, rmBaseUrl: String): ValidationService {
        val properties =
            ValidationProperties().apply {
                this.registryBaseUrl = registryBaseUrl
                this.releaseManagementBaseUrl = rmBaseUrl
                requestTimeoutSeconds = 5
                sweepTimeoutSeconds = 30
                liveTimeoutSeconds = 30
                concurrency = 4
            }
        val registry = RegistryClient(properties)
        val rmClient = ReleaseManagementClient(properties)
        val validator = UnregisteredReleasedVersionsValidator(registry)
        return ValidationService(registry, rmClient, listOf(validator), properties)
    }

    /**
     * No detail value may leak a URL scheme or a host. We check for scheme
     * markers and `localhost`. We deliberately avoid a bare `host:port` regex
     * because ISO-8601 timestamps in the details (generatedAt/lastAttemptAt)
     * legitimately contain `:NN` segments (e.g. `...T12:13:16Z`) that such a
     * pattern would false-match — the categorized reason and counts never carry
     * a host, and any leaked downstream URL would necessarily include a scheme
     * or the stub host token.
     */
    private fun assertNoUrlInDetails(details: Map<String, Any?>) {
        details.forEach { (key, value) ->
            val s = value?.toString() ?: return@forEach
            assertFalse(s.contains("http://"), "detail '$key' leaked an http URL: $s")
            assertFalse(s.contains("https://"), "detail '$key' leaked an https URL: $s")
            assertFalse(s.contains("localhost"), "detail '$key' leaked a host: $s")
            assertFalse(s.contains("//"), "detail '$key' leaked a URL authority: $s")
        }
    }

    @Test
    @DisplayName("never run yet → UNKNOWN with reason, no URL in details")
    fun `never run is unknown`() {
        // Construct only — no refresh() — so the cached report is the initial empty one.
        val svc = service("http://localhost:1", "http://localhost:1")
        val health = ValidationSweepHealthIndicator(svc).health()

        assertEquals(Status.UNKNOWN, health.status)
        assertEquals("validation sweep has not run yet", health.details["reason"])
        assertNoUrlInDetails(health.details)
    }

    @Test
    @DisplayName("refresh failure (registry unreachable) → DOWN, categorized reason, no URL in details")
    fun `refresh failure is down`() {
        // A registry stub we immediately stop → connection refused (connection-class).
        val deadRegistry = newServer()
        val deadRegistryBase = "http://localhost:${deadRegistry.address.port}"
        deadRegistry.stop(0)
        servers.remove(deadRegistry)
        val rm = newServer()
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 200, """[]""")
        }

        val svc = service(deadRegistryBase, "http://localhost:${rm.address.port}")
        svc.refresh()

        val health = ValidationSweepHealthIndicator(svc).health()
        assertEquals(Status.DOWN, health.status)
        val reason = health.details["reason"]?.toString()
        assertNotNull(reason)
        // Categorized: names the downstream + failure kind, but no host.
        assertTrue(
            reason!!.startsWith("components-registry unreachable: "),
            "expected a categorized unreachable reason, got: $reason",
        )
        assertNotNull(health.details["lastAttemptAt"])
        assertNoUrlInDetails(health.details)
    }

    @Test
    @DisplayName("healthy sweep → UP with counts (componentsChecked / componentsWithProblems), no URL")
    fun `healthy sweep is up`() {
        val crs = newServer()
        crs.createContext("/rest/api/3/components") { exchange ->
            respondJson(
                exchange,
                200,
                """[{"component":{"id":"clean"},"variants":{}},{"component":{"id":"flagged"},"variants":{}}]""",
            )
        }
        crs.createContext("/rest/api/2/components") { exchange ->
            // "clean" resolves its version; "flagged" resolves nothing → a problem.
            if (exchange.requestURI.path.contains("/clean/")) {
                respondJson(exchange, 200, """{"versions":{"1.0.1":{}}}""")
            } else {
                respondJson(exchange, 200, """{"versions":{}}""")
            }
        }
        val rm = newServer()
        rm.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 200, """[{"version":"1.0.1","status":"RELEASE"}]""")
        }

        val svc = service("http://localhost:${crs.address.port}", "http://localhost:${rm.address.port}")
        svc.refresh()

        val health = ValidationSweepHealthIndicator(svc).health()
        assertEquals(Status.UP, health.status)
        assertEquals(2, health.details["componentsChecked"])
        assertEquals(1, health.details["componentsWithProblems"])
        assertNotNull(health.details["generatedAt"])
        assertNoUrlInDetails(health.details)
    }

    private companion object {
        private const val SERVER_BACKLOG = 16
    }
}
