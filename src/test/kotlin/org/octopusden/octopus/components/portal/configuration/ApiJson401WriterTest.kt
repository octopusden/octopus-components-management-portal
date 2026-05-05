package org.octopusden.octopus.components.portal.configuration

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.mock.http.server.reactive.MockServerHttpRequest
import org.springframework.mock.web.server.MockServerWebExchange

// Locks in the JSON envelope shape and reason texts. The SPA's
// `frontend/src/lib/api.ts` currently branches only on `response.status === 401` and
// does not inspect the body — a body change is NOT load-bearing for the login-bounce
// flow today. The reason this writer matters anyway: both auth-failure paths (anonymous
// via SecurityConfig entry point, refresh-failed via ApiClientAuthorizationFailureFilter)
// share it, so the response shape across those paths stays consistent for any client
// that does parse the body (cURL/scripts, future SPA UX surfacing the reason, log
// scrapers, integration tests with shared assertions).
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
