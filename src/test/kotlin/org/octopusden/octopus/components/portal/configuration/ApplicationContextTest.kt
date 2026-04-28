package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.ActiveProfiles

/**
 * Boots the full Spring context to catch wiring regressions before they
 * reach a pod.
 *
 * Regression covered: [SecurityConfig] requires a [ReactiveClientRegistrationRepository]
 * bean. In production it comes from `spring.security.oauth2.client.registration.<id>`
 * properties. If those properties are unresolved (e.g. Vault secret missing,
 * placeholder propagation broken in service-config, OAuth2 client autoconfig
 * disabled by accident) the Spring application fails at startup with
 * "Client id must not be empty". Catching that at PR time is much cheaper than
 * shipping it to a deploy pipeline.
 *
 * [TestSecurityConfig] supplies a stub registration so the test does not need
 * a reachable Keycloak — it only verifies that the bean graph is wirable end
 * to end.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestSecurityConfig::class)
class ApplicationContextTest {
    @Test
    fun `context loads`() {
        // Empty body — Spring fails the test if any bean cannot be created.
    }
}
