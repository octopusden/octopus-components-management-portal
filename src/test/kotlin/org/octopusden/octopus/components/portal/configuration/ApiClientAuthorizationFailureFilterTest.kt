package org.octopusden.octopus.components.portal.configuration

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.mock.http.server.reactive.MockServerHttpRequest
import org.springframework.mock.web.server.MockServerWebExchange
import org.springframework.security.oauth2.client.ClientAuthorizationException
import org.springframework.security.oauth2.client.ClientAuthorizationRequiredException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.web.server.util.matcher.ServerWebExchangeMatchers
import org.springframework.web.server.WebFilterChain
import reactor.core.publisher.Mono

// Deterministic coverage of the actual bug fix: ApiClientAuthorizationFailureFilter must
// convert ClientAuthorizationException (and its subclass ClientAuthorizationRequiredException)
// from Spring Cloud Gateway's TokenRelay into a JSON 401 for API/XHR paths, and re-emit
// the exception unchanged for everything else (so Spring Security's
// OAuth2AuthorizationRequestRedirectWebFilter still handles browser navigations with its
// default 302 to OIDC).
//
// Pure unit test is preferred over an integration test here because the only reliable way
// to provoke a ClientAuthorizationException from inside an SCG filter chain is to stand up
// a real route + mocked authorized-client manager, which adds substantial setup
// for one assertion. The filter contract is small and self-contained — exercising it
// directly with MockServerWebExchange gives the same regression guarantee at a fraction
// of the cost.
class ApiClientAuthorizationFailureFilterTest {
    private val apiMatcher = ServerWebExchangeMatchers.pathMatchers("/rest/**", "/auth/**")
    private val writer = ApiJson401Writer(ObjectMapper())
    private val filter = ApiClientAuthorizationFailureFilter(apiMatcher, writer)

    private val authzRequired = ClientAuthorizationRequiredException("keycloak")

    @Test
    fun `intercepts ClientAuthorizationRequiredException on rest path and writes json 401`() {
        val exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/rest/api/4/components"))
        val chain = WebFilterChain { Mono.error(authzRequired) }

        filter.filter(exchange, chain).block()

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.response.statusCode)
        assertEquals(MediaType.APPLICATION_JSON, exchange.response.headers.contentType)
        val body = exchange.response.bodyAsString.block()!!
        assertTrue(body.contains("\"error\""), "expected JSON 'error' field in body, got: $body")
        assertTrue(body.contains("Authorization expired"), "expected reason text in body, got: $body")
    }

    @Test
    fun `intercepts ClientAuthorizationException (invalid_grant) on api path and writes json 401`() {
        val invalidGrant = ClientAuthorizationException(
            OAuth2Error("invalid_grant", "Token is not active", null),
            "keycloak",
        )
        val exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/rest/api/4/components"))
        val chain = WebFilterChain { Mono.error(invalidGrant) }

        filter.filter(exchange, chain).block()

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.response.statusCode)
        assertEquals(MediaType.APPLICATION_JSON, exchange.response.headers.contentType)
        val body = exchange.response.bodyAsString.block()!!
        assertTrue(body.contains("\"error\""), "expected JSON 'error' field in body, got: $body")
        assertTrue(body.contains("Authorization expired"), "expected reason text in body, got: $body")
    }

    @Test
    fun `intercepts ClientAuthorizationRequiredException on auth path and writes json 401`() {
        val exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/auth/me"))
        val chain = WebFilterChain { Mono.error(authzRequired) }

        filter.filter(exchange, chain).block()

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.response.statusCode)
        assertEquals(MediaType.APPLICATION_JSON, exchange.response.headers.contentType)
    }

    @Test
    fun `propagates ClientAuthorizationRequiredException on browser path so default redirect filter handles it`() {
        val exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/components"))
        val chain = WebFilterChain { Mono.error(authzRequired) }

        val thrown = assertThrows<ClientAuthorizationRequiredException> { filter.filter(exchange, chain).block() }
        assertSame(authzRequired, thrown)

        // Filter must not have written anything to the response; the downstream
        // OAuth2AuthorizationRequestRedirectWebFilter is responsible for the 302.
        // ApiJson401Writer always sets both status and content-type before writeWith,
        // so checking they are both null asserts the writer was never invoked.
        assertNull(exchange.response.statusCode)
        assertNull(exchange.response.headers.contentType)
    }

    @Test
    fun `propagates root path exception unchanged`() {
        val exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/"))
        val chain = WebFilterChain { Mono.error(authzRequired) }

        val thrown = assertThrows<ClientAuthorizationRequiredException> { filter.filter(exchange, chain).block() }
        assertSame(authzRequired, thrown)
    }

    @Test
    fun `propagates non-target exceptions on api path`() {
        val unrelated = RuntimeException("not the droid we're looking for")
        val exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/rest/api/4/components"))
        val chain = WebFilterChain { Mono.error(unrelated) }

        val thrown = assertThrows<RuntimeException> { filter.filter(exchange, chain).block() }
        assertSame(unrelated, thrown)
    }

    @Test
    fun `passes through normal chain completion without touching response`() {
        val exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/rest/api/4/components"))
        val chain = WebFilterChain { Mono.empty() }

        filter.filter(exchange, chain).block()

        assertNull(exchange.response.statusCode)
    }
}
