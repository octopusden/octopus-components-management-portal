package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient

// Proves /portal/metrics is registered as an API path in the apiMatcher: an
// unauthenticated XHR gets a JSON 401 envelope (via ApiJson401Writer), NOT an
// OIDC 302/HTML redirect that would CORS-fail the SPA's poll. Mirrors
// ValidationApiSecurityTest. The endpoint stays authenticated() (not permitAll).
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["management.server.port=0"],
)
@AutoConfigureWebTestClient
@ActiveProfiles("test")
@Import(TestSecurityConfig::class)
class PortalMetricsApiSecurityTest {
    @Autowired
    lateinit var webTestClient: WebTestClient

    @Test
    fun `unauthenticated XHR to portal metrics returns json 401 not a redirect`() {
        webTestClient.get().uri("/portal/metrics")
            .header("X-Requested-With", "XMLHttpRequest")
            .exchange()
            .expectStatus().isUnauthorized
            .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
            .expectBody().jsonPath("$.error").isEqualTo("Unauthenticated")
    }
}
