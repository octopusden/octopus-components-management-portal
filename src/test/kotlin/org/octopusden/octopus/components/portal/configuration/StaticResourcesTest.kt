package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient

/**
 * Regression test for static asset serving and SPA fallback in Spring Cloud Gateway.
 *
 * Known issue: WebFluxConfigurer.addResourceHandlers() is silently ignored in Gateway apps —
 * the Gateway's RoutePredicateHandlerMapping intercepts all requests first and returns 404
 * for paths not matching a configured route, including /assets/.
 *
 * Test fixtures are in src/test/resources/static/ (not the production frontend build).
 * This tests the serving mechanism, not the packaged frontend.
 * See AGENTS.md backlog for a separate test covering the full packaging pipeline.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = [
        "management.server.port=0",
    ]
)
@AutoConfigureWebTestClient
@ActiveProfiles("test")
@Import(TestSecurityConfig::class)
@WithMockUser
class StaticResourcesTest {

    @Autowired
    lateinit var webTestClient: WebTestClient

    @Test
    fun `root serves index html containing SPA mount point`() {
        webTestClient.get().uri("/")
            .exchange()
            .expectStatus().isOk
            .expectHeader().contentTypeCompatibleWith(MediaType.TEXT_HTML)
            .expectBody(String::class.java).value { body ->
                assertTrue(body?.contains("""<div id="root">""") == true, "Expected index.html with SPA mount point but got: $body")
            }
    }

    @Test
    fun `spa fallback serves index html for unknown frontend routes`() {
        webTestClient.get().uri("/components")
            .exchange()
            .expectStatus().isOk
            .expectHeader().contentTypeCompatibleWith(MediaType.TEXT_HTML)
            .expectBody(String::class.java).value { body ->
                assertTrue(body?.contains("""<div id="root">""") == true, "Expected index.html with SPA mount point but got: $body")
            }
    }

    @Test
    fun `assets js file is served with correct content type and body`() {
        webTestClient.get().uri("/assets/test.js")
            .exchange()
            .expectStatus().isOk
            .expectHeader().contentTypeCompatibleWith(MediaType.parseMediaType("text/javascript"))
            .expectBody(String::class.java).value { body ->
                assertTrue(body?.contains("console.log") == true, "Expected JS content but got: $body")
            }
    }

    @Test
    fun `assets css file is served with correct content type and body`() {
        webTestClient.get().uri("/assets/test.css")
            .exchange()
            .expectStatus().isOk
            .expectHeader().contentTypeCompatibleWith(MediaType.parseMediaType("text/css"))
            .expectBody(String::class.java).value { body ->
                assertTrue(body?.contains("margin") == true, "Expected CSS content but got: $body")
            }
    }

    @Test
    fun `missing asset returns 404 not index html`() {
        webTestClient.get().uri("/assets/missing.js")
            .exchange()
            .expectStatus().isNotFound
    }
}
