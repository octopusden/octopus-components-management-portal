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
import org.springframework.security.web.server.util.matcher.ServerWebExchangeMatchers
import org.springframework.security.web.server.util.matcher.ServerWebExchangeMatchers.pathMatchers

// BFF pattern: the portal authenticates the browser via OIDC (authorization code flow),
// stores the access token in the server-side session, and the Spring Cloud Gateway
// TokenRelay default-filter forwards it as `Authorization: Bearer <token>` when
// proxying to the registry service.
//
// Auth entry points are split so XHR / API callers get a JSON-shaped 401 instead of
// the OAuth2 302 redirect that browsers need for SPA navigation:
//   - /rest, /auth, and any AJAX (X-Requested-With: XMLHttpRequest) get HTTP 401 so
//     `frontend/src/lib/api.ts` 401-handler fires cleanly.
//   - Everything else (typed URL, link, SPA navigation) redirects to
//     /oauth2/authorization/keycloak, which Spring Security intercepts to start
//     the OIDC authorization code flow.
@Configuration
@EnableWebFluxSecurity
open class SecurityConfig(
    private val clientRegistrationRepository: ReactiveClientRegistrationRepository,
) {
    @Bean
    open fun securityFilterChain(http: ServerHttpSecurity): SecurityWebFilterChain {
        val apiMatcher = pathMatchers("/rest/**", "/auth/**")
        val apiEntryPoint = HttpStatusServerEntryPoint(HttpStatus.UNAUTHORIZED)
        val browserEntryPoint = RedirectServerAuthenticationEntryPoint("/oauth2/authorization/keycloak")
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
                        "/actuator/**",
                        "/logout/connect/back-channel/**",
                    ).permitAll()
                    .anyExchange().authenticated()
            }
            .oauth2Login(Customizer.withDefaults())
            // Override the entry point AFTER oauth2Login registers its default so the
            // delegating one wins: it keeps browser OIDC redirect for navigations but
            // returns 401 for API/XHR callers.
            .exceptionHandling { it.authenticationEntryPoint(delegatingEntryPoint) }
            .logout { it.logoutSuccessHandler(oidcLogoutSuccessHandler()) }
            .oidcLogout { it.backChannel(Customizer.withDefaults()) }
            .csrf { it.disable() }
        return http.build()
    }

    private fun oidcLogoutSuccessHandler(): ServerLogoutSuccessHandler =
        OidcClientInitiatedServerLogoutSuccessHandler(clientRegistrationRepository)
            .apply { setPostLogoutRedirectUri("{baseUrl}") }
}
