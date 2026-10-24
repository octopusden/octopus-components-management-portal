package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.ApplicationContext
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockOAuth2Login
import org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient

/**
 * Browser-facing protections of the BFF: CSRF on mutating calls, the response security
 * headers, and what anonymous health callers can see.
 *
 * MOCK + `bindToApplicationContext` for the same reason as
 * [ClientAuthorizationRequiredIntegrationTest]: `mockOAuth2Login()` only reaches an
 * in-process client. `management.server.port` is cleared so actuator shares this context.
 *
 * Valid-token case is a real double-submit, not the csrf() mutator (which disables the check).
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.MOCK,
    properties = ["management.server.port="],
)
@ActiveProfiles("test")
@Import(TestSecurityConfig::class)
class BrowserSecurityTest {
    @Autowired
    lateinit var ctx: ApplicationContext

    private val client by lazy { WebTestClient.bindToApplicationContext(ctx).apply(springSecurity()).build() }

    @Test
    fun `authenticated POST to rest without csrf token is rejected`() {
        client.mutateWith(mockOAuth2Login())
            .post().uri("/rest/api/4/components")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{}")
            .exchange()
            .expectStatus().isForbidden
    }

    @Test
    fun `authenticated POST to rest with double-submitted csrf token passes the csrf check`() {
        // No CRS upstream in the fixture, so a request that gets past the CSRF filter ends in
        // the gateway failing to reach it: a 5xx, never the 403 of a rejected token.
        client.mutateWith(mockOAuth2Login())
            .post().uri("/rest/api/4/components")
            .cookie("XSRF-TOKEN", CSRF_TOKEN)
            .header("X-XSRF-TOKEN", CSRF_TOKEN)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{}")
            .exchange()
            .expectStatus().is5xxServerError
    }

    @Test
    fun `spa index carries security headers`() {
        client.mutateWith(mockOAuth2Login())
            .get().uri("/")
            .exchange()
            .expectStatus().isOk
            .expectHeader().valueEquals("Content-Security-Policy", EXPECTED_CSP)
            .expectHeader().valueEquals("X-Content-Type-Options", "nosniff")
            .expectHeader().valueEquals("X-Frame-Options", "DENY")
    }

    @Test
    fun `api 401 from the entry point carries security headers`() {
        // Anonymous, so this 401 is written by the API entry point before routing; a proxied
        // CRS response is not covered, and keeps any such header CRS sets itself.
        client.get().uri("/rest/api/4/components")
            .exchange()
            .expectStatus().isUnauthorized
            .expectHeader().valueEquals("Content-Security-Policy", EXPECTED_CSP)
    }

    @Test
    fun `anonymous health shows status but no component details`() {
        // Status itself depends on indicators with no backends here, so only the shape is checked.
        client.get().uri("/actuator/health")
            .exchange()
            .expectBody()
            .jsonPath("$.status").exists()
            .jsonPath("$.components").doesNotExist()
            .jsonPath("$.details").doesNotExist()
    }

    @Test
    fun `authenticated health shows component details`() {
        client.mutateWith(mockOAuth2Login())
            .get().uri("/actuator/health")
            .exchange()
            .expectBody()
            .jsonPath("$.components").exists()
    }

    private companion object {
        const val CSRF_TOKEN = "test-csrf-token"
        const val EXPECTED_CSP =
            "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
                "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    }
}
