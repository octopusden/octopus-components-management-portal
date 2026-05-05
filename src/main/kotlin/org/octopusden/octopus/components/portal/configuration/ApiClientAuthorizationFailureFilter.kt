package org.octopusden.octopus.components.portal.configuration

import org.slf4j.LoggerFactory
import org.springframework.security.oauth2.client.ClientAuthorizationRequiredException
import org.springframework.security.web.server.util.matcher.ServerWebExchangeMatcher
import org.springframework.web.server.ServerWebExchange
import org.springframework.web.server.WebFilter
import org.springframework.web.server.WebFilterChain
import reactor.core.publisher.Mono

/**
 * Intercepts [ClientAuthorizationRequiredException] for API/XHR paths and writes a JSON 401
 * via [ApiJson401Writer], preventing Spring Security's
 * `OAuth2AuthorizationRequestRedirectWebFilter` from converting the failure into a 302 to
 * the OIDC authorization endpoint.
 *
 * Why this is needed: Spring Cloud Gateway's `TokenRelayGatewayFilterFactory` calls
 * `ReactiveOAuth2AuthorizedClientManager.authorize()`. When the access_token has expired
 * AND the refresh_token is no longer usable (e.g. the Keycloak SSO session was killed by a
 * logout from a sibling service — see api-gateway doc Q&A 4.1), the manager throws
 * `ClientAuthorizationRequiredException`. By default that exception is caught by
 * `OAuth2AuthorizationRequestRedirectWebFilter` (added by `oauth2Login()`) which sends a
 * 302 to `/oauth2/authorization/keycloak`. The Location target is cross-origin (Keycloak),
 * fetch's default `redirect: 'follow'` makes browsers silently follow it, and the XHR then
 * CORS-fails on Keycloak's preflight — surfacing in the SPA as `TypeError: Failed to fetch`.
 *
 * This filter must sit INNER of `OAuth2AuthorizationRequestRedirectWebFilter` so the
 * exception bubbles up through here first. Spring Security registers that redirect
 * filter at `SecurityWebFiltersOrder.HTTP_BASIC` (an outer position in the WebFilter
 * chain). Wiring this filter via
 * `addFilterAfter(filter, SecurityWebFiltersOrder.OAUTH2_AUTHORIZATION_CODE)` places it
 * at a higher order than HTTP_BASIC and therefore deeper in the chain, so reactive
 * errors propagate outward through `onErrorResume` here before reaching the redirect
 * filter's own `onErrorResume`.
 *
 * For non-API paths (browser navigations like `/`, `/components`) the exception is
 * re-emitted unchanged so the default redirect filter handles it normally — full-page
 * navigation to OIDC, which is the correct UX for a top-level browsing context.
 */
class ApiClientAuthorizationFailureFilter(
    private val apiMatcher: ServerWebExchangeMatcher,
    private val writer: ApiJson401Writer,
) : WebFilter {
    private val log = LoggerFactory.getLogger(javaClass)

    override fun filter(exchange: ServerWebExchange, chain: WebFilterChain): Mono<Void> =
        chain.filter(exchange).onErrorResume(ClientAuthorizationRequiredException::class.java) { ex ->
            apiMatcher.matches(exchange).flatMap { match ->
                if (match.isMatch) {
                    log.debug(
                        "ClientAuthorizationRequiredException on api path '{}': {}",
                        exchange.request.path,
                        ex.message,
                    )
                    writer.write(exchange, ApiJson401Reason.AUTHORIZATION_EXPIRED)
                } else {
                    Mono.error(ex)
                }
            }
        }
}
