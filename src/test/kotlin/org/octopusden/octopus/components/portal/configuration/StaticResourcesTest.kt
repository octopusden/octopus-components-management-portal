package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockUser
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient

// Locks down the static-resource handler wiring inside WebConfig.
//
// Regression covered: the registry that powers the SPA emits hashed bundles
// under dist/assets/. Spring's ResourceHandlerRegistry for an /assets/**
// pattern strips the literal prefix before resolving against the location, so
// the location has to point at classpath:/static/assets/ (not
// classpath:/static/). Earlier the location was the parent folder and every
// JS/CSS chunk returned 404 in production.
//
// The test fixture src/test/resources/static/assets/probe.js is what we
// assert against — it ships in the test classpath and does not depend on the
// real Vite bundle whose hash changes on every build.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
@ActiveProfiles("test")
@Import(TestSecurityConfig::class)
class StaticResourcesTest {
    @Autowired
    private lateinit var webTestClient: WebTestClient

    @Test
    fun `serves hashed bundle under assets prefix`() {
        webTestClient
            .get()
            .uri("/assets/probe.js")
            .exchange()
            .expectStatus()
            .isOk
            .expectBody(String::class.java)
            .value { body ->
                check(body.contains("static-routing probe")) {
                    "Expected probe.js content, got: $body"
                }
            }
    }

    @Test
    fun `serves index_html at root`() {
        // /index.html is NOT in the SecurityConfig permitAll list (only /assets/**,
        // /favicon.ico, /vite.svg, /actuator/**, and the OIDC back-channel are
        // anonymous). In production a browser hits / unauthenticated, gets bounced
        // through OIDC, and the SPA shell is served once a session cookie exists.
        // Here we are exercising the resource-handler wiring in WebConfig, not the
        // auth flow, so we mutate the test client with a mock authenticated user
        // and assert the static handler resolves /index.html to
        // classpath:/static/index.html.
        webTestClient
            .mutateWith(mockUser())
            .get()
            .uri("/index.html")
            .exchange()
            .expectStatus()
            .isOk
            .expectHeader()
            .contentTypeCompatibleWith("text/html")
    }

    @Test
    fun `assets endpoint is publicly reachable`() {
        webTestClient
            .get()
            .uri("/assets/probe.js")
            .exchange()
            .expectStatus()
            .isOk
    }
}
