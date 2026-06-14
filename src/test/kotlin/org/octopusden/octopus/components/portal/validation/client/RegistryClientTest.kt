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
import java.net.InetSocketAddress
import java.time.Duration
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/**
 * Unit tests for [RegistryClient] against an in-process [HttpServer] stub
 * standing in for CRS. Mirrors the EmployeeServiceIntegrationHealthIndicatorTest
 * pattern: direct construction, `.block(Duration)` on the returned Mono.
 */
class RegistryClientTest {
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
    ): RegistryClient {
        val properties =
            ValidationProperties().apply {
                registryBaseUrl = "http://localhost:${stub.address.port}"
                requestTimeoutSeconds = timeoutSeconds
            }
        return RegistryClient(properties)
    }

    private fun respondJson(
        exchange: HttpExchange,
        status: Int,
        body: String,
    ) {
        val bytes = body.toByteArray()
        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(status, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }

    @Test
    @DisplayName("componentIds parses the id nested under \"component\" (real CRS shape)")
    fun `componentIds parses nested ids`() {
        val stub = startStub()
        // Real CRS GET /rest/api/3/components returns the id NESTED under "component",
        // not a top-level "id" — each element is {"component":{"id":...},"variants":{...}}.
        stub.createContext("/rest/api/3/components") { exchange ->
            respondJson(
                exchange,
                200,
                """[{"component":{"id":"comp-a","name":"comp-a"},"variants":{}},""" +
                    """{"component":{"id":"comp-b"},"variants":{}}]""",
            )
        }

        val ids = client(stub).componentIds().block(Duration.ofSeconds(10))!!

        assertEquals(listOf("comp-a", "comp-b"), ids)
    }

    @Test
    @DisplayName("resolvableVersions POSTs {versions:[...]} and returns the versions-map keys")
    fun `resolvableVersions posts body and returns keys`() {
        val stub = startStub()
        val capturedBody = AtomicReference<String>()
        val capturedPath = AtomicReference<String>()
        stub.createContext("/rest/api/2/components") { exchange ->
            capturedPath.set(exchange.requestURI.path)
            capturedBody.set(exchange.requestBody.readBytes().toString(Charsets.UTF_8))
            respondJson(exchange, 200, """{"versions":{"1.0.1":{},"1.0.3":{}}}""")
        }

        val resolvable =
            client(stub)
                .resolvableVersions("comp", listOf("1.0.1", "1.0.2", "1.0.3"))
                .block(Duration.ofSeconds(10))!!

        assertEquals(setOf("1.0.1", "1.0.3"), resolvable)
        assertEquals("/rest/api/2/components/comp/detailed-versions", capturedPath.get())
        assertTrue(
            capturedBody.get().contains("\"versions\""),
            "body should contain versions array, was: ${capturedBody.get()}",
        )
        assertTrue(capturedBody.get().contains("1.0.2"), "body should pass versions verbatim")
    }

    @Test
    @DisplayName("resolvableVersions short-circuits to empty on empty input — NO HTTP call")
    fun `resolvableVersions short circuits on empty input`() {
        val stub = startStub()
        val calls = AtomicInteger(0)
        stub.createContext("/rest/api/2/components") { exchange ->
            calls.incrementAndGet()
            respondJson(exchange, 200, """{"versions":{}}""")
        }

        val resolvable = client(stub).resolvableVersions("comp", emptyList()).block(Duration.ofSeconds(10))!!

        assertTrue(resolvable.isEmpty())
        assertEquals(0, calls.get(), "no HTTP call must be made on empty input")
    }

    @Test
    @DisplayName("per-call timeout fires on a slow stub")
    fun `componentIds times out on slow stub`() {
        val stub = startStub()
        stub.createContext("/rest/api/3/components") { exchange ->
            Thread.sleep(2_000)
            respondJson(exchange, 200, "[]")
        }

        val ex =
            assertThrows(RuntimeException::class.java) {
                client(stub, timeoutSeconds = 1).componentIds().block(Duration.ofSeconds(10))
            }
        // reactor wraps the TimeoutException; assert the cause chain mentions a timeout.
        val timedOut =
            generateSequence(ex as Throwable) { it.cause }
                .any {
                    it is java.util.concurrent.TimeoutException ||
                        it.message?.contains("timeout", ignoreCase = true) == true
                }
        assertTrue(timedOut, "expected a timeout, got: $ex")
    }
}
