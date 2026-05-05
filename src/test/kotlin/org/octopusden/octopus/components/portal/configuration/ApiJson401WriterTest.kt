package org.octopusden.octopus.components.portal.configuration

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.mock.http.server.reactive.MockServerHttpRequest
import org.springframework.mock.web.server.MockServerWebExchange

// Locks in the wire-level JSON envelope that the SPA's frontend/src/lib/api.ts reads.
// The shape `{ "error": "<message>" }` and the constant reason texts must stay stable —
// both auth-failure paths (anonymous via SecurityConfig entry point, and refresh-failed
// via ApiClientAuthorizationFailureFilter) share this writer, so a regression here
// affects both code paths simultaneously.
class ApiJson401WriterTest {
    private val writer = ApiJson401Writer(ObjectMapper())

    @Test
    fun `UNAUTHENTICATED reason writes 401 with json envelope`() {
        val exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/auth/me"))

        writer.write(exchange, ApiJson401Reason.UNAUTHENTICATED).block()

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.response.statusCode)
        assertEquals(MediaType.APPLICATION_JSON, exchange.response.headers.contentType)
        assertEquals(
            """{"error":"Unauthenticated"}""",
            exchange.response.bodyAsString.block(),
        )
    }

    @Test
    fun `AUTHORIZATION_EXPIRED reason writes 401 with json envelope`() {
        val exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/rest/api/4/components"))

        writer.write(exchange, ApiJson401Reason.AUTHORIZATION_EXPIRED).block()

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.response.statusCode)
        assertEquals(MediaType.APPLICATION_JSON, exchange.response.headers.contentType)
        assertEquals(
            """{"error":"Authorization expired"}""",
            exchange.response.bodyAsString.block(),
        )
    }
}
