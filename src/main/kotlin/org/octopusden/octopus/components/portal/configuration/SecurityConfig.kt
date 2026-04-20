package org.octopusden.octopus.components.portal.configuration

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.Customizer
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity
import org.springframework.security.config.web.server.ServerHttpSecurity
import org.springframework.security.oauth2.client.oidc.web.server.logout.OidcClientInitiatedServerLogoutSuccessHandler
import org.springframework.security.oauth2.client.registration.ReactiveClientRegistrationRepository
import org.springframework.security.web.server.SecurityWebFilterChain
import org.springframework.security.web.server.authentication.logout.ServerLogoutSuccessHandler

/**
 * BFF pattern: the portal authenticates the browser via OIDC (authorization code flow),
 * stores the access token in the server-side session, and the Spring Cloud Gateway
 * `TokenRelay` default-filter forwards it as `Authorization: Bearer <token>` when
 * proxying to the registry service.
 */
@Configuration
@EnableWebFluxSecurity
open class SecurityConfig(
    private val clientRegistrationRepository: ReactiveClientRegistrationRepository,
) {
    @Bean
    open fun securityFilterChain(http: ServerHttpSecurity): SecurityWebFilterChain {
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
            .logout { it.logoutSuccessHandler(oidcLogoutSuccessHandler()) }
            .oidcLogout { it.backChannel(Customizer.withDefaults()) }
            .csrf { it.disable() }
        return http.build()
    }

    private fun oidcLogoutSuccessHandler(): ServerLogoutSuccessHandler =
        OidcClientInitiatedServerLogoutSuccessHandler(clientRegistrationRepository)
            .apply { setPostLogoutRedirectUri("{baseUrl}") }
}
