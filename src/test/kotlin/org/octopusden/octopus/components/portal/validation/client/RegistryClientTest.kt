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
        maxResponseBytes: Int = ValidationProperties().maxResponseBytes,
    ): RegistryClient {
        val properties =
            ValidationProperties().apply {
                registryBaseUrl = "http://localhost:${stub.address.port}"
                requestTimeoutSeconds = timeoutSeconds
                this.maxResponseBytes = maxResponseBytes
            }
        return RegistryClient(properties)
    }

    /**
     * Builds a syntactically valid `/rest/api/3/components` JSON body with [count]
     * elements, all using neutral `comp-N` ids, sized to exceed WebClient's default
     * 256 KB in-memory codec limit. Every 5th element is marked `"archived":true`.
     * Returns the body and the ordered list of NON-archived ids (what the sweep keeps).
     */
    private fun largeComponentsBody(count: Int): Pair<String, List<String>> {
        val expectedIds = mutableListOf<String>()
        val body =
            (0 until count).joinToString(prefix = "[", postfix = "]", separator = ",") { i ->
                val id = "comp-$i"
                val archived = i % 5 == 0
                if (!archived) expectedIds.add(id)
                """{"component":{"id":"$id","name":"$id","archived":$archived},"variants":{}}"""
            }
        return body to expectedIds
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
    @DisplayName("componentIds parses the id nested under \"component\" and SKIPS archived")
    fun `componentIds parses nested ids and skips archived`() {
        val stub = startStub()
        // Real CRS GET /rest/api/3/components returns the id NESTED under "component",
        // not a top-level "id" — each element is
        // {"component":{"id":...,"archived":...},"variants":{...}}.
        // Archived components must be excluded from the sweep.
        stub.createContext("/rest/api/3/components") { exchange ->
            respondJson(
                exchange,
                200,
                """[{"component":{"id":"comp-a","name":"comp-a","archived":false},"variants":{}},""" +
                    """{"component":{"id":"comp-archived","name":"comp-archived","archived":true},"variants":{}},""" +
                    """{"component":{"id":"comp-b"},"variants":{}}]""",
            )
        }

        val ids = client(stub).componentIds().block(Duration.ofSeconds(10))!!

        // comp-archived is dropped; comp-b has no "archived" field → defaults to not-archived.
        assertEquals(listOf("comp-a", "comp-b"), ids)
    }

    @Test
    @DisplayName("componentIds parses a body LARGER than the default 256 KB codec limit and skips archived")
    fun `componentIds parses large body over default codec limit`() {
        val stub = startStub()
        // ~7000 elements ≈ well over WebClient's default 256 KB in-memory buffer
        // (each element is ~70+ bytes). This FAILS against the default 256 KB codec
        // (DataBufferLimitException) and PASSES with the configured maxResponseBytes.
        // expectedIds excludes the archived entries, so this also guards the archived filter.
        val (body, expectedIds) = largeComponentsBody(count = 7_000)
        assertTrue(
            body.toByteArray().size > 256 * 1024,
            "test body must exceed the default 256 KB limit to be meaningful, was ${body.toByteArray().size} bytes",
        )
        stub.createContext("/rest/api/3/components") { exchange ->
            respondJson(exchange, 200, body)
        }

        // Use the new default maxResponseBytes (16 MiB) so the configured buffer is exercised.
        val ids = client(stub).componentIds().block(Duration.ofSeconds(20))!!

        assertEquals(expectedIds, ids)
    }

    @Test
    @DisplayName("componentIds fails when the body exceeds the configured maxResponseBytes (knob works)")
    fun `componentIds fails when body exceeds configured buffer`() {
        val stub = startStub()
        val (body, _) = largeComponentsBody(count = 7_000)
        val bodyBytes = body.toByteArray().size
        stub.createContext("/rest/api/3/components") { exchange ->
            respondJson(exchange, 200, body)
        }

        // Set the buffer BELOW the body size: the call must fail (proves the knob is honored).
        val ex =
            assertThrows(RuntimeException::class.java) {
                client(stub, maxResponseBytes = bodyBytes / 2)
                    .componentIds()
                    .block(Duration.ofSeconds(20))
            }
        val bufferLimited =
            generateSequence(ex as Throwable) { it.cause }
                .any { it.message?.contains("buffer", ignoreCase = true) == true }
        assertTrue(bufferLimited, "expected a buffer-limit failure, got: $ex")
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
