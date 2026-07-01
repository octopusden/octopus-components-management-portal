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
import java.time.Instant

/**
 * Full-chain test for GET /portal/metrics. Authenticated() — so the WebTestClient
 * is bound to the application context with springSecurity() and the request is
 * mutated with a mock user (mockUser cannot inject a security context into an
 * out-of-process RANDOM_PORT server). CRS metrics point at a closed port, so the
 * CRS section exercises the best-effort unavailable path (the happy path is
 * covered by ServiceRuntimeMetricsClientTest). Portal self-metrics are always present,
 * and a pre-recorded login proves the RecentLoginsTracker snapshot reaches the
 * response.
 */
@SpringBootTest(
    properties = [
        "management.server.port=0",
        // Reliably-closed addresses so both the CRS and RMS WebClients fail fast →
        // available=false, exercising the best-effort unavailable path for each.
        "portal.registry-base-url=http://localhost:1",
        "portal.release-management-base-url=http://localhost:1",
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
            // startedAt must be an ISO-8601 string, not an epoch-seconds number —
            // the SPA parses it with new Date(...) and a numeric value would render
            // as ~1970. Parse it back to prove the wire format.
            .jsonPath("$.portal.startedAt").value<String> { Instant.parse(it) }
            .jsonPath("$.portal.processId").isNumber
            .jsonPath("$.portal.javaVersion").exists()
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

    // mockUser() has no OAuth2 authorized client in the session, so crsAccessToken
    // resolves to no token → fetch(null). This test therefore covers BOTH the
    // no-token path and the CRS-unreachable path (closed port) degrading cleanly.
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

    // RMS metrics base URL also points at a closed port (see @SpringBootTest props),
    // so the RMS section degrades just like CRS — proving the second client is wired
    // and surfaced in the response alongside crs.
    @Test
    fun `RMS section is present and degrades gracefully when RMS is unreachable`() {
        webTestClient
            .mutateWith(mockUser("admin"))
            .get()
            .uri("/portal/metrics")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.rms.available").isEqualTo(false)
            .jsonPath("$.rms.reason").exists()
    }
}
