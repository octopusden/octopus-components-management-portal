package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
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
 * refreshed -> [ClientAuthorizationRequiredException]) is covered in two places:
 * [ApiClientAuthorizationFailureFilterTest] for the filter logic in isolation, and
 * [ClientAuthorizationRequiredIntegrationTest] for the load-bearing piece — that the
 * filter actually sits at the right position in the real Spring Security WebFilter
 * chain so the redirect filter never catches the exception first.
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
            // No CRS runs in the test fixture, so SCG should return a 5xx gateway error
            // (connection refused); if a fixture eventually stands up CRS the upstream
            // can return 2xx instead. Either is "request actually reached the gateway
            // route". We tighten the assertion beyond "not 401, not 302" so a future
            // routing/handler regression that 404s the path or returns SPA HTML cannot
            // silently pass: status must be 2xx or 5xx, AND no Location header pointing
            // back at the OIDC entry point can be set.
            val result =
                webTestClient.get().uri("/rest/api/4/info")
                    .exchange()
                    .returnResult(Void::class.java)
            val status = result.status
            assertTrue(
                status.is2xxSuccessful || status.is5xxServerError,
                "expected proxied response (5xx if no CRS upstream, 2xx if up), got $status",
            )
            assertNull(
                result.responseHeaders.getFirst("Location"),
                "permitAll path must not redirect anywhere",
            )
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
    inner class OidcLoginFailureRecovery {
        @Test
        fun `failed oidc callback redirects to root, not the unhandled login error page`() {
            // After a portal redeploy the in-memory session — and the OAuth2
            // authorization request saved in it — is gone, so the Keycloak callback
            // fails with authorization_request_not_found. Spring's default failure
            // handler would 302 to /login?error, but nothing serves /login (no
            // controller, and SpaFallbackFilter deliberately excludes it) — the user
            // lands on a Whitelabel 404. Redirecting to "/" instead restarts a clean
            // OIDC flow: entry point -> Keycloak SSO -> back in, no dead end.
            webTestClient.get()
                .uri("/login/oauth2/code/${SecurityConfig.OIDC_REGISTRATION_ID}?code=stale&state=stale")
                .exchange()
                .expectStatus().isFound
                .expectHeader().value("Location") { location ->
                    assertEquals(
                        "/",
                        location,
                        "OIDC failure must self-heal via \"/\" (got $location)",
                    )
                }
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
