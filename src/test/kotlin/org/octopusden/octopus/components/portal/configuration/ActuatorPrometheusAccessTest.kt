package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient
import org.springframework.context.annotation.Import
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient

/**
 * RELENG-3562: `idpmonitoring` Prometheus scrapes `/actuator/prometheus` in-cluster with no
 * token, so that one endpoint must be anonymous. It exposes counters and timers only — no
 * configuration, no memory contents.
 *
 * Two things had to change for this to pass, and both are load-bearing. The service-local
 * `application.yaml` overrides the shared config-server file, so `prometheus` had to be added
 * to `management.endpoints.web.exposure.include` or the endpoint would not exist at all; and
 * [SecurityConfig] permits a single literal path, so it had to be listed there too.
 *
 * What "still protected" looks like here is a **redirect, not a 401**. This is a browser-facing
 * gateway: [SecurityConfig] delegates to an OIDC entry point for anything outside its
 * `apiMatcher`, and `/actuator` paths are outside it, so an unauthorised request is sent to
 * Keycloak rather than answered with a JSON 401. `/actuator/metrics` is the guard against a
 * wildcard under `/actuator` quietly opening more than intended: it is exposed yet must keep
 * redirecting.
 *
 * Note this also means security answers before routing, so before the exposure fix this
 * endpoint redirected rather than 404ing — the filter chain runs ahead of the handler.
 *
 * `management.server.port` is cleared deliberately. Main `application.yaml` pins it to 8080
 * and the sibling tests here set it to `0`, both of which move actuator onto a port
 * [WebTestClient] is not talking to; an empty value restores Boot's default of sharing the
 * application port, which is also how it is deployed.
 *
 * There is no assertion on `/actuator/health`. It is permitted anonymously and answers
 * without a redirect, but its *status* depends on downstream health indicators that have no
 * backends in a test context, so asserting 200 would be asserting the environment.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["management.server.port="],
)
@AutoConfigureWebTestClient
@ActiveProfiles("test")
@Import(TestSecurityConfig::class)
class ActuatorPrometheusAccessTest {
    @Autowired
    lateinit var webTestClient: WebTestClient

    @Test
    fun `prometheus scrape endpoint is anonymous`() {
        webTestClient.get().uri("/actuator/prometheus")
            .exchange()
            .expectStatus().isOk
    }

    @Test
    fun `metrics endpoint stays behind auth`() {
        webTestClient.get().uri("/actuator/metrics")
            .exchange()
            .expectStatus().is3xxRedirection
    }
}
