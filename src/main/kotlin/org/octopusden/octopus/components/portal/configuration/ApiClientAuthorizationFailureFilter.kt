package org.octopusden.octopus.components.portal.configuration

import org.slf4j.LoggerFactory
import org.springframework.security.oauth2.client.ClientAuthorizationException
import org.springframework.security.web.server.util.matcher.ServerWebExchangeMatcher
import org.springframework.web.server.ServerWebExchange
import org.springframework.web.server.WebFilter
import org.springframework.web.server.WebFilterChain
import reactor.core.publisher.Mono

/**
 * Intercepts [ClientAuthorizationException] (and its subclass
 * [org.springframework.security.oauth2.client.ClientAuthorizationRequiredException]) for
 * API/XHR paths and writes a JSON 401 via [ApiJson401Writer], preventing Spring Security's
 * `OAuth2AuthorizationRequestRedirectWebFilter` from converting the failure into a 302 to
 * the OIDC authorization endpoint.
 *
 * Two pathways reach this filter:
 *
 * 1. **Refresh token rejected** (`invalid_grant`): `RefreshTokenReactiveOAuth2AuthorizedClientProvider`
 *    throws `ClientAuthorizationException` (the parent) when Keycloak rejects the refresh
 *    token, e.g. because the token has expired or been revoked. This is the most common
 *    production case.
 *
 * 2. **SSO session killed by sibling logout**: when no authorized client exists at all
 *    (e.g. the Keycloak SSO session was invalidated by a logout from another service),
 *    the manager throws `ClientAuthorizationRequiredException` (the subclass). See
 *    api-gateway doc Q&A 4.1 for background.
 *
 * Both result in the same user-facing remedy (re-authenticate), so catching the parent
 * `ClientAuthorizationException` handles both cases. We deliberately do not broaden further
 * to `OAuth2AuthorizationException` — that parent also covers resource-server and
 * JWT-validation errors that do not mean "re-authenticate the user".
 *
 * Why this filter must sit INNER of `OAuth2AuthorizationRequestRedirectWebFilter`: Spring
 * Security's redirect filter (registered at `SecurityWebFiltersOrder.HTTP_BASIC`) explicitly
 * catches `ClientAuthorizationRequiredException` (the subclass) and converts it to a 302 to
 * `/oauth2/authorization/keycloak`. The Location target is cross-origin (Keycloak);
 * fetch's default `redirect: 'follow'` makes browsers silently follow it, and the XHR then
 * CORS-fails on Keycloak's preflight — surfacing in the SPA as `TypeError: Failed to fetch`.
 * Wiring this filter via
 * `addFilterAfter(filter, SecurityWebFiltersOrder.OAUTH2_AUTHORIZATION_CODE)` places it
 * at a higher order than HTTP_BASIC and therefore deeper in the chain, so reactive errors
 * propagate outward through `onErrorResume` here before reaching the redirect filter's own
 * `onErrorResume`. (The redirect filter does not catch the parent `ClientAuthorizationException`,
 * so for the `invalid_grant` pathway the ordering is not strictly required — but keeping a
 * single, consistent registration avoids any future confusion.)
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
        chain.filter(exchange).onErrorResume(ClientAuthorizationException::class.java) { ex ->
            apiMatcher.matches(exchange).flatMap { match ->
                if (match.isMatch) {
                    log.debug(
                        "OAuth2 client authorization failed on api path '{}': {}",
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
