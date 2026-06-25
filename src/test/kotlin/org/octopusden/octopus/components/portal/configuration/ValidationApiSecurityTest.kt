package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient

// Proves the P4 apiMatcher change: the /portal/validation path prefix is registered
// as an API path, so an unauthenticated XHR gets a JSON 401 envelope (via
// ApiJson401Writer) — NOT an OIDC 302/HTML redirect that would CORS-fail the SPA.
//
// Mirrors SecurityConfigAuthEntryPointTest's API-401 assertions (status 401 + JSON
// content type + $.error == "Unauthenticated"). The X-Requested-With header is sent
// as the SPA does, though the server-side gate is purely path-based.
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["management.server.port=0"],
)
@AutoConfigureWebTestClient
@ActiveProfiles("test")
@Import(TestSecurityConfig::class)
class ValidationApiSecurityTest {
    @Autowired
    lateinit var webTestClient: WebTestClient

    @Test
    fun `unauthenticated XHR to validation components returns json 401 not a redirect`() {
        webTestClient.get().uri("/portal/validation/components")
            .header("X-Requested-With", "XMLHttpRequest")
            .exchange()
            .expectStatus().isUnauthorized
            .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
            .expectBody().jsonPath("$.error").isEqualTo("Unauthenticated")
    }

    @Test
    fun `unauthenticated XHR to live per-component path also returns json 401`() {
        webTestClient.get().uri("/portal/validation/components/some-component")
            .header("X-Requested-With", "XMLHttpRequest")
            .exchange()
            .expectStatus().isUnauthorized
            .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
            .expectBody().jsonPath("$.error").isEqualTo("Unauthenticated")
    }
}
