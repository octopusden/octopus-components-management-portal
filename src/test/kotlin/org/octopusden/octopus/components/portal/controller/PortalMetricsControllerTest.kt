package org.octopusden.octopus.components.portal.controller

import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.octopusden.octopus.components.portal.configuration.TestSecurityConfig
import org.octopusden.octopus.components.portal.security.RecentLoginsTracker
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.ApplicationContext
import org.springframework.context.annotation.Import
import org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockUser
import org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient

/**
 * Full-chain test for GET /portal/metrics. Authenticated() — so the WebTestClient
 * is bound to the application context with springSecurity() and the request is
 * mutated with a mock user (mockUser cannot inject a security context into an
 * out-of-process RANDOM_PORT server). CRS metrics point at a closed port, so the
 * CRS section exercises the best-effort unavailable path (the happy path is
 * covered by CrsRuntimeMetricsClientTest). Portal self-metrics are always present,
 * and a pre-recorded login proves the RecentLoginsTracker snapshot reaches the
 * response.
 */
@SpringBootTest(
    properties = [
        "management.server.port=0",
        // A reliably-closed address so the CRS WebClient fails fast → available=false.
        "portal.registry-health-base-url=http://localhost:1",
    ],
)
@ActiveProfiles("test")
@Import(TestSecurityConfig::class)
class PortalMetricsControllerTest {
    @Autowired
    lateinit var context: ApplicationContext

    @Autowired
    lateinit var recentLoginsTracker: RecentLoginsTracker

    private lateinit var webTestClient: WebTestClient

    @BeforeEach
    fun setUp() {
        webTestClient = WebTestClient
            .bindToApplicationContext(context)
            .apply(springSecurity())
            .configureClient()
            .build()
    }

    @Test
    fun `returns portal self-metrics for an authenticated user`() {
        webTestClient
            .mutateWith(mockUser("admin"))
            .get()
            .uri("/portal/metrics")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.portal.uptimeMillis").isNumber
            .jsonPath("$.portal.startedAt").exists()
            .jsonPath("$.portal.jvm.heapUsedBytes").isNumber
            .jsonPath("$.portal.jvm.threadsLive").isNumber
            .jsonPath("$.portal.jvm.availableProcessors").isNumber
    }

    @Test
    fun `surfaces the recent-logins snapshot in the response`() {
        recentLoginsTracker.record("alice")

        webTestClient
            .mutateWith(mockUser("admin"))
            .get()
            .uri("/portal/metrics")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.portal.recentLogins[0].username").isEqualTo("alice")
            .jsonPath("$.portal.recentLogins[0].loginAt").exists()
    }

    @Test
    fun `CRS section degrades gracefully when CRS is unreachable`() {
        webTestClient
            .mutateWith(mockUser("admin"))
            .get()
            .uri("/portal/metrics")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.crs.available").isEqualTo(false)
            .jsonPath("$.crs.reason").exists()
    }
}
