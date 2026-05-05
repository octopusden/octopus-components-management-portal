package org.octopusden.octopus.components.portal.configuration

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.server.ServerWebExchange
import reactor.core.publisher.Mono

// Uniform JSON 401 writer for API/XHR clients. Used on both auth-failure paths so the SPA
// sees an identical response shape regardless of which path produced it:
//
//   1. Anonymous request to a protected /rest or /auth path — invoked from the api branch
//      of SecurityConfig's DelegatingServerAuthenticationEntryPoint.
//   2. Authenticated session whose OAuth2 access_token expired and refresh failed —
//      ApiClientAuthorizationFailureFilter catches ClientAuthorizationRequiredException
//      from Spring Cloud Gateway's TokenRelay and routes here instead of letting
//      OAuth2AuthorizationRequestRedirectWebFilter turn the failure into a 302 to the OIDC
//      provider (which would CORS-fail on cross-origin XHR — the original bug).
//
// Reason text comes from a fixed-set ApiJson401Reason enum, NOT from exception messages.
// Keycloak / Spring Security exception details would leak client_id, provider URLs, and
// potentially unescaped characters that hand-built JSON would mishandle. Operators get the
// full detail via SLF4J at the call site; clients get a stable, safe envelope.
//
// Written as line comments (not KDoc) on purpose: Kotlin supports nested block comments,
// so inline path globs like /rest/** would open a nested /* and require an explicit */.
@Component
class ApiJson401Writer(
    private val objectMapper: ObjectMapper,
) {
    fun write(exchange: ServerWebExchange, reason: ApiJson401Reason): Mono<Void> {
        val response = exchange.response
        response.statusCode = HttpStatus.UNAUTHORIZED
        response.headers.contentType = MediaType.APPLICATION_JSON
        val payload = objectMapper.writeValueAsBytes(mapOf("error" to reason.message))
        val buffer = response.bufferFactory().wrap(payload)
        return response.writeWith(Mono.just(buffer))
    }
}

enum class ApiJson401Reason(val message: String) {
    UNAUTHENTICATED("Unauthenticated"),
    AUTHORIZATION_EXPIRED("Authorization expired"),
}
