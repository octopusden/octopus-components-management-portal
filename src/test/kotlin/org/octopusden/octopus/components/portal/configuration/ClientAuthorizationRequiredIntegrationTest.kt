package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.ApplicationContext
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.core.Ordered
import org.springframework.http.MediaType
import org.springframework.security.oauth2.client.ClientAuthorizationRequiredException
import org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient
import org.springframework.web.server.ServerWebExchange
import org.springframework.web.server.WebFilter
import org.springframework.web.server.WebFilterChain
import reactor.core.publisher.Mono

private const val TRIGGER_HEADER = "X-Test-Throw-Refresh-Required"

// Test-only @TestConfiguration that injects a deep WebFilter simulating the SCG
// TokenRelay throwing ClientAuthorizationRequiredException on a refresh-failed
// authenticated session. Lives in the test sources alongside TestSecurityConfig and
// is opt-in via @Import — never picked up by main component scan.
@TestConfiguration
open class ClientAuthFailureSimulatorConfig {
    // LOWEST_PRECEDENCE places this filter deeper in the WebFlux chain than every
    // Spring Security filter (including OAuth2AuthorizationRequestRedirectWebFilter
    // at HTTP_BASIC and our ApiClientAuthorizationFailureFilter at
    // OAUTH2_AUTHORIZATION_CODE + 1), so an error raised here propagates back up
    // through the real production filter chain in production order. That is the
    // whole point of this fixture: locking in the wiring, not just the filter logic.
    @Bean
    open fun simulateClientAuthorizationRequired(): WebFilter =
        object : WebFilter, Ordered {
            override fun filter(exchange: ServerWebExchange, chain: WebFilterChain): Mono<Void> =
                if (exchange.request.headers.containsKey(TRIGGER_HEADER)) {
                    Mono.error(ClientAuthorizationRequiredException("keycloak"))
                } else {
                    chain.filter(exchange)
                }

            override fun getOrder() = Ordered.LOWEST_PRECEDENCE
        }
}

/**
 * Locks in the load-bearing piece of the SPA-401 fix: that
 * [ApiClientAuthorizationFailureFilter] sits at the correct position in the real
 * Spring Security WebFlux filter chain, so [ClientAuthorizationRequiredException]
 * raised by SCG TokenRelay propagates through our `onErrorResume` BEFORE Spring
 * Security's `OAuth2AuthorizationRequestRedirectWebFilter` (registered at
 * `SecurityWebFiltersOrder.HTTP_BASIC`) can convert it to a 302 to OIDC.
 *
 * The unit test [ApiClientAuthorizationFailureFilterTest] verifies the filter logic
 * in isolation but cannot detect a wiring regression — e.g. a Spring Security version
 * bump that reorders enum constants, or an accidental change of `addFilterAfter` to
 * `addFilterBefore`. This test will fail loudly in either case.
 *
 * Uses `WebEnvironment.MOCK` + `bindToApplicationContext` + `springSecurity()` per the
 * approved plan: `mockOAuth2Login()` is unreliable against a live-server (RANDOM_PORT)
 * client because it mutates the in-process SecurityContext, which never reaches the
 * network client.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
@Import(TestSecurityConfig::class, ClientAuthFailureSimulatorConfig::class)
class ClientAuthorizationRequiredIntegrationTest {
    @Autowired
    lateinit var ctx: ApplicationContext

    private lateinit var client: WebTestClient

    @BeforeEach
    fun setUp() {
        client =
            WebTestClient
                .bindToApplicationContext(ctx)
                .apply(SecurityMockServerConfigurers.springSecurity())
                .build()
    }

    @Test
    fun `rest path returns json 401 envelope on refresh failure for authenticated user`() {
        client
            .mutateWith(SecurityMockServerConfigurers.mockOAuth2Login())
            .get().uri("/rest/api/4/components")
            .header(TRIGGER_HEADER, "true")
            .exchange()
            .expectStatus().isUnauthorized
            .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
            .expectBody().jsonPath("$.error").isEqualTo("Authorization expired")
    }

    @Test
    fun `auth path returns json 401 envelope on refresh failure for authenticated user`() {
        client
            .mutateWith(SecurityMockServerConfigurers.mockOAuth2Login())
            .get().uri("/auth/me")
            .header(TRIGGER_HEADER, "true")
            .exchange()
            .expectStatus().isUnauthorized
            .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
            .expectBody().jsonPath("$.error").isEqualTo("Authorization expired")
    }

    // Note: a "browser path returns 302" companion test is intentionally omitted here.
    // SpaFallbackFilter (a regular @Component WebFilter, no Ordered annotation) runs
    // shallower than this fixture's LOWEST_PRECEDENCE simulator and short-circuits
    // /components with index.html before the simulator can throw. More importantly,
    // ClientAuthorizationRequiredException only originates from SCG TokenRelay, which
    // only routes /rest/** and /auth/** in production — non-routed paths simply never
    // produce this exception in real traffic, so a "browser path" assertion here would
    // be testing a path that cannot happen.
    //
    // The rethrow-for-non-api-path branch of ApiClientAuthorizationFailureFilter is
    // unit-tested in ApiClientAuthorizationFailureFilterTest. Anonymous browser
    // navigations still 302 to OIDC — that path is covered in
    // SecurityConfigAuthEntryPointTest.
}

