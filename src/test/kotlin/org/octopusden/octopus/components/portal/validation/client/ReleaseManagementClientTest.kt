package org.octopusden.octopus.components.portal.validation.client

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.octopusden.octopus.components.portal.validation.ValidationProperties
import org.springframework.web.reactive.function.client.WebClientResponseException
import java.net.InetSocketAddress
import java.time.Duration
import java.util.concurrent.atomic.AtomicReference

/**
 * Unit tests for [ReleaseManagementClient] against an in-process [HttpServer]
 * stub standing in for release-management-service.
 *
 * Failure-semantics crux (P1): ONLY 404 → emptyList(); any other status (401/5xx)
 * or a timeout must propagate as an error so the orchestrator marks checkFailed —
 * it must never be mapped to empty.
 */
class ReleaseManagementClientTest {
    private var server: HttpServer? = null

    @AfterEach
    fun tearDown() {
        server?.stop(0)
    }

    private fun startStub(): HttpServer {
        val stub = HttpServer.create(InetSocketAddress(0), 0)
        stub.start()
        server = stub
        return stub
    }

    private fun client(
        stub: HttpServer,
        timeoutSeconds: Long = 10,
    ): ReleaseManagementClient {
        val properties =
            ValidationProperties().apply {
                releaseManagementBaseUrl = "http://localhost:${stub.address.port}"
                requestTimeoutSeconds = timeoutSeconds
            }
        return ReleaseManagementClient(properties)
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

    @Test
    @DisplayName("GET path + ?statuses=RELEASE; parses distinct versions")
    fun `releasedVersions hits path with statuses query and parses distinct versions`() {
        val stub = startStub()
        val capturedPath = AtomicReference<String>()
        val capturedQuery = AtomicReference<String>()
        stub.createContext("/rest/api/1/builds/component") { exchange ->
            capturedPath.set(exchange.requestURI.path)
            capturedQuery.set(exchange.requestURI.query)
            respondJson(
                exchange,
                200,
                """[
                  {"component":"c","version":"1.0.1","status":"RELEASE"},
                  {"component":"c","version":"1.0.2","status":"RELEASE"},
                  {"component":"c","version":"1.0.1","status":"RELEASE"}
                ]""",
            )
        }

        val versions = client(stub).releasedVersions("c").block(Duration.ofSeconds(10))!!

        assertEquals(listOf("1.0.1", "1.0.2"), versions)
        assertEquals("/rest/api/1/builds/component/c", capturedPath.get())
        assertEquals("statuses=RELEASE", capturedQuery.get())
    }

    @Test
    @DisplayName("404 → emptyList (component unknown to RM ⇒ no releases ⇒ not a problem)")
    fun `not found maps to empty list`() {
        val stub = startStub()
        stub.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 404, """{"error":"Not Found"}""")
        }

        val versions = client(stub).releasedVersions("unknown").block(Duration.ofSeconds(10))!!

        assertTrue(versions.isEmpty())
    }

    @Test
    @DisplayName("500 → error propagates (NOT empty)")
    fun `server error propagates`() {
        val stub = startStub()
        stub.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 500, """{"error":"boom"}""")
        }

        val ex =
            assertThrows(WebClientResponseException::class.java) {
                client(stub).releasedVersions("c").block(Duration.ofSeconds(10))
            }
        assertEquals(500, ex.statusCode.value())
    }

    @Test
    @DisplayName("401 → error propagates (NOT empty)")
    fun `unauthorized propagates`() {
        val stub = startStub()
        stub.createContext("/rest/api/1/builds/component") { exchange ->
            respondJson(exchange, 401, """{"error":"unauthorized"}""")
        }

        val ex =
            assertThrows(WebClientResponseException::class.java) {
                client(stub).releasedVersions("c").block(Duration.ofSeconds(10))
            }
        assertEquals(401, ex.statusCode.value())
    }

    @Test
    @DisplayName("per-call timeout fires on a slow stub")
    fun `times out on slow stub`() {
        val stub = startStub()
        stub.createContext("/rest/api/1/builds/component") { exchange ->
            Thread.sleep(2_000)
            respondJson(exchange, 200, "[]")
        }

        val ex =
            assertThrows(RuntimeException::class.java) {
                client(stub, timeoutSeconds = 1).releasedVersions("c").block(Duration.ofSeconds(10))
            }
        assertTrue(
            generateSequence(ex as Throwable) { it.cause }
                .any { it is java.util.concurrent.TimeoutException || it.message?.contains("timeout", ignoreCase = true) == true },
            "expected a timeout, got: $ex",
        )
    }
}
