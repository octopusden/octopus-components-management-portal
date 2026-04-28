package org.octopusden.octopus.components.portal.configuration

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.security.config.Customizer
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity
import org.springframework.security.config.web.server.ServerHttpSecurity
import org.springframework.security.oauth2.client.oidc.web.server.logout.OidcClientInitiatedServerLogoutSuccessHandler
import org.springframework.security.oauth2.client.registration.ReactiveClientRegistrationRepository
import org.springframework.security.web.server.DelegatingServerAuthenticationEntryPoint
import org.springframework.security.web.server.DelegatingServerAuthenticationEntryPoint.DelegateEntry
import org.springframework.security.web.server.SecurityWebFilterChain
import org.springframework.security.web.server.authentication.HttpStatusServerEntryPoint
import org.springframework.security.web.server.authentication.RedirectServerAuthenticationEntryPoint
import org.springframework.security.web.server.authentication.logout.ServerLogoutSuccessHandler
import org.springframework.security.web.server.csrf.CookieServerCsrfTokenRepository
import org.springframework.security.web.server.csrf.CsrfToken
import org.springframework.security.web.server.csrf.ServerCsrfTokenRequestAttributeHandler
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
//   - /rest/** and /auth/** -> HTTP 401 so `frontend/src/lib/api.ts` 401-handler
//     fires cleanly. The frontend additionally sets
//     X-Requested-With: XMLHttpRequest as belt-and-braces; the server-side gate
//     is path-based and does not require that header.
//   - Everything else (typed URL, link, SPA navigation) redirects to
//     /oauth2/authorization/<REGISTRATION_ID>, which Spring Security intercepts
//     to start the OIDC authorization code flow.
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
) {
    @Bean
    open fun securityFilterChain(http: ServerHttpSecurity): SecurityWebFilterChain {
        val apiMatcher = pathMatchers("/rest/**", "/auth/**")
        val apiEntryPoint = HttpStatusServerEntryPoint(HttpStatus.UNAUTHORIZED)
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
                    ).permitAll()
                    .anyExchange().authenticated()
            }
            .oauth2Login(Customizer.withDefaults())
            // Override the entry point AFTER oauth2Login registers its default so the
            // delegating one wins: it keeps browser OIDC redirect for navigations but
            // returns 401 for API callers.
            .exceptionHandling { it.authenticationEntryPoint(delegatingEntryPoint) }
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
