package org.octopusden.octopus.components.portal.configuration

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.Customizer
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity
import org.springframework.security.config.web.server.SecurityWebFiltersOrder
import org.springframework.security.config.web.server.ServerHttpSecurity
import org.springframework.security.oauth2.client.oidc.web.server.logout.OidcClientInitiatedServerLogoutSuccessHandler
import org.springframework.security.oauth2.client.registration.ReactiveClientRegistrationRepository
import org.springframework.security.web.server.DelegatingServerAuthenticationEntryPoint
import org.springframework.security.web.server.DelegatingServerAuthenticationEntryPoint.DelegateEntry
import org.springframework.security.web.server.SecurityWebFilterChain
import org.springframework.security.web.server.ServerAuthenticationEntryPoint
import org.springframework.security.web.server.authentication.RedirectServerAuthenticationEntryPoint
import org.springframework.security.web.server.authentication.RedirectServerAuthenticationFailureHandler
import org.springframework.security.web.server.authentication.logout.ServerLogoutSuccessHandler
import org.springframework.security.web.server.csrf.CookieServerCsrfTokenRepository
import org.springframework.security.web.server.csrf.CsrfToken
import org.springframework.security.web.server.csrf.ServerCsrfTokenRequestAttributeHandler
import org.springframework.security.web.server.util.matcher.ServerWebExchangeMatcher
import org.springframework.security.web.server.util.matcher.ServerWebExchangeMatchers
import org.springframework.security.web.server.util.matcher.ServerWebExchangeMatchers.pathMatchers
import org.springframework.web.server.WebFilter
import reactor.core.publisher.Mono

// BFF pattern: the portal authenticates the browser via OIDC (authorization code flow),
// stores the access token in the server-side session, and the Spring Cloud Gateway
// TokenRelay default-filter forwards it as `Authorization: Bearer <token>` when
// proxying to the registry service.
//
// Auth entry points are split so API callers get a JSON-shaped 401 instead of the
// OAuth2 302 redirect that browsers need for SPA navigation:
//   - /rest/** and /auth/** -> JSON 401 (via [ApiJson401Writer]) so
//     `frontend/src/lib/api.ts` 401-handler fires cleanly. The frontend additionally
//     sets X-Requested-With: XMLHttpRequest as belt-and-braces; the server-side gate
//     is path-based and does not require that header.
//   - Everything else (typed URL, link, SPA navigation) redirects to
//     /oauth2/authorization/<REGISTRATION_ID>, which Spring Security intercepts
//     to start the OIDC authorization code flow.
//   - The DelegatingServerAuthenticationEntryPoint above only fires for
//     unauthenticated/anonymous calls. The other auth-failure path — authenticated
//     session whose access_token expired and whose refresh_token can no longer be
//     used — surfaces from Spring Cloud Gateway's TokenRelay as a
//     ClientAuthorizationException (e.g. invalid_grant when the refresh token has
//     expired) or its subclass ClientAuthorizationRequiredException, which
//     `oauth2Login()` would otherwise turn into a 302 to OIDC (CORS-fails on
//     cross-origin XHR — the original bug).
//     [ApiClientAuthorizationFailureFilter] catches that exception for api paths
//     and routes through the same [ApiJson401Writer], so the SPA sees an identical
//     401 envelope on either path.
//
// CSRF: because authentication is a session cookie (BFF), cross-origin mutating calls
// could ride an authenticated user's session without a double-submit token. We use
// Spring Security's cookie-based CSRF token repository, with the cookie readable by the
// SPA (HttpOnly=false); the frontend must echo the token in the X-XSRF-TOKEN header on
// every non-safe request. The Login/OIDC redirect dance itself remains exempt via the
// OIDC `state` parameter.
@Configuration
@EnableWebFluxSecurity
open class SecurityConfig(
    private val clientRegistrationRepository: ReactiveClientRegistrationRepository,
    private val apiJson401Writer: ApiJson401Writer,
) {
    @Bean
    open fun securityFilterChain(http: ServerHttpSecurity): SecurityWebFilterChain {
        val apiMatcher: ServerWebExchangeMatcher = pathMatchers("/rest/**", "/auth/**", "/portal/validation/**")
        val apiEntryPoint =
            ServerAuthenticationEntryPoint { exchange, _ ->
                apiJson401Writer.write(exchange, ApiJson401Reason.UNAUTHENTICATED)
            }
        val browserEntryPoint =
            RedirectServerAuthenticationEntryPoint("/oauth2/authorization/$OIDC_REGISTRATION_ID")
        val delegatingEntryPoint =
            DelegatingServerAuthenticationEntryPoint(
                DelegateEntry(apiMatcher, apiEntryPoint),
                DelegateEntry(ServerWebExchangeMatchers.anyExchange(), browserEntryPoint),
            )

        http
            .authorizeExchange { ex ->
                ex
                    .pathMatchers(
                        "/assets/**",
                        "/favicon.ico",
                        "/vite.svg",
                        // Only health probes are anonymous. application.yaml exposes
                        // health,info,metrics and sets health.show-details: always —
                        // anything beyond /actuator/health would leak operational
                        // details (jvm metrics, info bean contents) to anyone who can
                        // reach the route. Keep richer endpoints behind auth.
                        "/actuator/health",
                        "/actuator/health/**",
                        "/logout/connect/back-channel/**",
                        // Footer build-info: portal version (served by PortalInfoController)
                        // and CRS service version (proxied to /rest/api/4/info, which is
                        // permitAll on the CRS side). The portal must let anonymous
                        // requests through both so the footer renders before login —
                        // otherwise the portal gateway answers 401 before TokenRelay
                        // ever forwards the call to CRS.
                        "/portal/info",
                        "/rest/api/4/info",
                    ).permitAll()
                    .anyExchange().authenticated()
            }
            .oauth2Login { login ->
                // Self-healing on a broken OIDC callback. The default failure handler
                // redirects to /login?error, which nothing serves (no controller, and
                // SpaFallbackFilter deliberately excludes /login) — the user dead-ends
                // on a Whitelabel 404. The common trigger is a portal redeploy: the
                // in-memory session holding the saved authorization request is wiped,
                // so the callback fails with authorization_request_not_found. A
                // redirect to "/" instead restarts a clean flow: entry point ->
                // Keycloak (SSO, no password prompt) -> logged back in.
                //
                // Known trade-off: if the callback fails PERMANENTLY (e.g. redirect_uri
                // or realm misconfig) this loops / -> Keycloak -> / instead of parking
                // on an error page. Acceptable for now — that class of failure is a
                // deploy-config bug, loud in server logs either way.
                login.authenticationFailureHandler(RedirectServerAuthenticationFailureHandler("/"))
            }
            // Override the entry point AFTER oauth2Login registers its default so the
            // delegating one wins: it keeps browser OIDC redirect for navigations but
            // returns JSON 401 for API callers.
            .exceptionHandling { it.authenticationEntryPoint(delegatingEntryPoint) }
            // Inner filter (sits AFTER OAUTH2_AUTHORIZATION_CODE in DSL = deeper in the
            // chain = sees errors before the redirect filter does) that catches
            // ClientAuthorizationException (and its subclass ClientAuthorizationRequiredException)
            // from TokenRelay and routes API/XHR
            // calls through the same JSON 401 writer. Without this, an authenticated
            // session with an unrefreshable token would 302 cross-origin to Keycloak
            // and CORS-fail the SPA's XHR — see filter Kdoc for the full chain.
            .addFilterAfter(
                ApiClientAuthorizationFailureFilter(apiMatcher, apiJson401Writer),
                SecurityWebFiltersOrder.OAUTH2_AUTHORIZATION_CODE,
            )
            .logout { it.logoutSuccessHandler(oidcLogoutSuccessHandler()) }
            .oidcLogout { it.backChannel(Customizer.withDefaults()) }
            .csrf { csrf ->
                // withHttpOnlyFalse() so the SPA can read XSRF-TOKEN and echo it in
                // X-XSRF-TOKEN (default header). ServerCsrfTokenRequestAttributeHandler
                // is the plain double-submit handler — it does NOT run the BREACH-mitigation
                // XOR step that the default-since-5.8 XorServerCsrfTokenRequestAttributeHandler
                // applies. We pick the plain handler because the SPA reads the token raw
                // from the cookie and echoes it raw on the X-XSRF-TOKEN header; with the
                // XOR variant the token in the cookie does not match what the handler
                // expects to see in the header and every non-safe request would 403.
                csrf.csrfTokenRepository(CookieServerCsrfTokenRepository.withHttpOnlyFalse())
                csrf.csrfTokenRequestHandler(ServerCsrfTokenRequestAttributeHandler())
            }
        return http.build()
    }

    /**
     * Forces the CSRF token to be materialised on every request so Spring Security writes
     * the XSRF-TOKEN cookie. Without this, the cookie is only set when a handler actually
     * reads the token; the SPA would have no way to pick it up on first load.
     *
     * The Mono is chained in front of the filter chain so the token is subscribed to
     * (and therefore the cookie is written) before downstream processing runs.
     */
    @Bean
    open fun csrfCookieWebFilter(): WebFilter =
        WebFilter { exchange, chain ->
            val csrfToken = exchange.getAttribute<Mono<CsrfToken>>(CsrfToken::class.java.name)
            csrfToken?.then(chain.filter(exchange)) ?: chain.filter(exchange)
        }

    private fun oidcLogoutSuccessHandler(): ServerLogoutSuccessHandler =
        OidcClientInitiatedServerLogoutSuccessHandler(clientRegistrationRepository)
            .apply { setPostLogoutRedirectUri("{baseUrl}") }

    companion object {
        // Matches spring.security.oauth2.client.registration.<id> in application.yaml.
        // Kept in one place so the redirect URL in browserEntryPoint and the
        // matching constant in frontend/src/lib/auth.ts stay in sync.
        const val OIDC_REGISTRATION_ID = "keycloak"
    }
}
