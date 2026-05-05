package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient

/**
 * Regression for the SPA's "auth check failed" + "Failed to fetch" symptom.
 *
 * Asserts that SecurityConfig's split entry-point routes anonymous traffic to two
 * different responses: API/XHR paths get a JSON 401 (via [ApiJson401Writer]) so the
 * SPA's `frontend/src/lib/api.ts` 401-handler can react cleanly, while browser
 * navigations get the OIDC 302 they expect for full-page login.
 *
 * The other auth-failure path (authenticated session whose access_token cannot be
 * refreshed -> [ClientAuthorizationRequiredException]) is covered separately in
 * [ApiClientAuthorizationFailureFilterTest]. Standing up an SCG TokenRelay route
 * just to provoke that exception inside an integration test is more setup than
 * payoff; the unit test gives deterministic coverage of the same code path.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["management.server.port=0"],
)
@AutoConfigureWebTestClient
@ActiveProfiles("test")
@Import(TestSecurityConfig::class)
class SecurityConfigAuthEntryPointTest {
    @Autowired
    lateinit var webTestClient: WebTestClient

    @Nested
    inner class AnonymousXhrToApiPaths {
        @Test
        fun `auth me returns json 401 envelope`() {
            webTestClient.get().uri("/auth/me")
                .exchange()
                .expectStatus().isUnauthorized
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
                .expectBody().jsonPath("$.error").isEqualTo("Unauthenticated")
        }

        @Test
        fun `protected rest endpoint returns json 401 envelope`() {
            webTestClient.get().uri("/rest/api/4/components?page=0&size=20")
                .exchange()
                .expectStatus().isUnauthorized
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
                .expectBody().jsonPath("$.error").isEqualTo("Unauthenticated")
        }

        @Test
        fun `permitAll proxied rest info is not blocked by auth chain`() {
            // /rest/api/4/info is permitAll on the portal side and proxied to CRS.
            // No CRS runs in the test fixture, so SCG will return a 5xx gateway error;
            // the only invariant we assert is that the security chain neither answers
            // 401 nor 302-bounces to OIDC.
            val status =
                webTestClient.get().uri("/rest/api/4/info")
                    .exchange()
                    .returnResult(Void::class.java)
                    .status
            assertNotEquals(HttpStatus.UNAUTHORIZED, status)
            assertNotEquals(HttpStatus.FOUND, status)
        }

        @Test
        fun `permitAll portal info is reachable without auth`() {
            webTestClient.get().uri("/portal/info")
                .exchange()
                .expectStatus().isOk
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
        }
    }

    @Nested
    inner class AnonymousBrowserNavigation {
        @Test
        fun `root deep link redirects to oidc authorization`() {
            webTestClient.get().uri("/")
                .exchange()
                .expectStatus().isFound
                .expectHeader().value("Location") { location ->
                    assertTrue(
                        location.endsWith("/oauth2/authorization/keycloak"),
                        "Expected redirect to /oauth2/authorization/keycloak but got $location",
                    )
                }
        }

        @Test
        fun `spa frontend route redirects to oidc authorization`() {
            webTestClient.get().uri("/components")
                .exchange()
                .expectStatus().isFound
                .expectHeader().value("Location") { location ->
                    assertTrue(
                        location.endsWith("/oauth2/authorization/keycloak"),
                        "Expected redirect to /oauth2/authorization/keycloak but got $location",
                    )
                }
        }
    }
}
