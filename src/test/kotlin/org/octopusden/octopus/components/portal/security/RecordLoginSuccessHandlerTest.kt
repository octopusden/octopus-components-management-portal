package org.octopusden.octopus.components.portal.security

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.mock.http.server.reactive.MockServerHttpRequest
import org.springframework.mock.web.server.MockServerWebExchange
import org.springframework.security.authentication.TestingAuthenticationToken
import org.springframework.security.web.server.WebFilterExchange
import org.springframework.web.server.WebFilterChain
import reactor.core.publisher.Mono
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/**
 * Verifies the reactive login-success hook records the authenticated username.
 * The full OIDC round-trip is out of scope for a unit test; this proves the
 * handler's contract (record [Authentication.getName] when its Mono is
 * subscribed), which is what `SecurityConfig` wires into `oauth2Login`.
 */
class RecordLoginSuccessHandlerTest {
    private val tracker =
        RecentLoginsTracker(capacity = 10, clock = Clock.fixed(Instant.parse("2026-06-27T10:00:00Z"), ZoneOffset.UTC))
    private val handler = RecordLoginSuccessHandler(tracker)

    private fun filterExchange(): WebFilterExchange {
        val exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/"))
        val chain = WebFilterChain { Mono.empty() }
        return WebFilterExchange(exchange, chain)
    }

    @Test
    fun `records the username when the success Mono is subscribed`() {
        val authentication = TestingAuthenticationToken("alice", "n/a")

        handler.onAuthenticationSuccess(filterExchange(), authentication).block()

        assertEquals(listOf("alice"), tracker.snapshot().map { it.username })
    }

    @Test
    fun `does not record until the Mono is subscribed`() {
        val authentication = TestingAuthenticationToken("bob", "n/a")

        // Building the Mono must have no side-effect — fromRunnable defers to subscribe.
        handler.onAuthenticationSuccess(filterExchange(), authentication)

        assertEquals(emptyList<String>(), tracker.snapshot().map { it.username })
    }
}
