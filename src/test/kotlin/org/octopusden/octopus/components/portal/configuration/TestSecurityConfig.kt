package org.octopusden.octopus.components.portal.configuration

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.client.registration.InMemoryReactiveClientRegistrationRepository
import org.springframework.security.oauth2.client.registration.ReactiveClientRegistrationRepository
import org.springframework.security.oauth2.core.AuthorizationGrantType

/**
 * Provides a stub [ReactiveClientRegistrationRepository] so SecurityConfig
 * can boot without a reachable Keycloak / config-server-supplied properties.
 *
 * Real OIDC issuer-discovery and the TokenRelay flow are out of scope for
 * unit tests; these tests only need a wired [ClientRegistration] bean for the
 * `keycloak` registrationId so SecurityConfig can be constructed and the
 * resource handler / authorizeExchange chain can be exercised.
 */
@TestConfiguration
open class TestSecurityConfig {
    @Bean
    @Primary
    open fun clientRegistrationRepository(): ReactiveClientRegistrationRepository {
        val keycloak =
            ClientRegistration
                .withRegistrationId("keycloak")
                .clientId("test-client")
                .clientSecret("test-secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .scope("openid", "profile", "email")
                .authorizationUri("http://localhost:0/auth")
                .tokenUri("http://localhost:0/token")
                .userInfoUri("http://localhost:0/userinfo")
                .userNameAttributeName("preferred_username")
                .jwkSetUri("http://localhost:0/jwks")
                .build()
        return InMemoryReactiveClientRegistrationRepository(keycloak)
    }
}
