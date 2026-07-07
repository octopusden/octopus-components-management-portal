package org.octopusden.octopus.components.portal.controller

import org.eclipse.jgit.api.Git
import org.eclipse.jgit.lib.PersonIdent
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.octopusden.octopus.components.portal.configuration.OnboardingVideoProperties
import org.octopusden.octopus.components.portal.configuration.TestSecurityConfig
import org.octopusden.octopus.components.portal.onboarding.OnboardingVideoService
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.test.annotation.DirtiesContext
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient
import java.nio.file.Files
import java.nio.file.Path

// /portal/links is authenticated — it falls through to the default
// anyExchange().authenticated() rule in SecurityConfig and is NOT on the
// permitAll list. Three @Nested classes cover the property-matrix so each
// context boots with its own portal.links.* values. Top-level @SpringBootTest
// is intentionally absent; each @Nested carries its own so property overrides
// are applied per-context.
//
// @WithMockUser at class level grants a synthetic authenticated principal so
// Spring Security passes the request through to the controller without a real
// OIDC session — identical to the pattern in StaticResourcesTest.
@ActiveProfiles("test")
@Import(TestSecurityConfig::class, PortalInfoControllerTest.TestBuildPropertiesConfig::class)
class PortalConfigControllerTest {

    @Nested
    @SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = [
            "management.server.port=0",
            "portal.links.jira-base-url=https://jira.example.com",
            "portal.links.git-base-url=https://git.example.com",
            "portal.links.tc-base-url=https://tc.example.com",
            "portal.links.dms-base-url=https://dms.example.com",
        ],
    )
    @AutoConfigureWebTestClient
    @ActiveProfiles("test")
    @Import(TestSecurityConfig::class, PortalInfoControllerTest.TestBuildPropertiesConfig::class)
    @WithMockUser
    inner class AllLinksConfigured {
        @Autowired
        lateinit var client: WebTestClient

        @Test
        fun `all four URLs configured returns them all`() {
            client.get().uri("/portal/links")
                .exchange()
                .expectStatus().isOk
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
                .expectBody()
                .jsonPath("$.jiraBaseUrl").isEqualTo("https://jira.example.com")
                .jsonPath("$.gitBaseUrl").isEqualTo("https://git.example.com")
                .jsonPath("$.tcBaseUrl").isEqualTo("https://tc.example.com")
                .jsonPath("$.dmsBaseUrl").isEqualTo("https://dms.example.com")
        }
    }

    @Nested
    @SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = [
            "management.server.port=0",
            "portal.links.jira-base-url=",
            "portal.links.git-base-url=",
            "portal.links.tc-base-url=",
            "portal.links.dms-base-url=",
        ],
    )
    @AutoConfigureWebTestClient
    @ActiveProfiles("test")
    @Import(TestSecurityConfig::class, PortalInfoControllerTest.TestBuildPropertiesConfig::class)
    @WithMockUser
    inner class AllLinksEmpty {
        @Autowired
        lateinit var client: WebTestClient

        @Test
        fun `all four empty strings collapse to null in response`() {
            client.get().uri("/portal/links")
                .exchange()
                .expectStatus().isOk
                .expectBody()
                .jsonPath("$.jiraBaseUrl").doesNotExist()
                .jsonPath("$.gitBaseUrl").doesNotExist()
                .jsonPath("$.tcBaseUrl").doesNotExist()
                .jsonPath("$.dmsBaseUrl").doesNotExist()
        }
    }

    @Nested
    @SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = [
            "management.server.port=0",
            "portal.links.jira-base-url=https://jira.example.com",
            "portal.links.git-base-url=",
            "portal.links.tc-base-url=",
            "portal.links.dms-base-url=",
        ],
    )
    @AutoConfigureWebTestClient
    @ActiveProfiles("test")
    @Import(TestSecurityConfig::class, PortalInfoControllerTest.TestBuildPropertiesConfig::class)
    @WithMockUser
    inner class MixedLinks {
        @Autowired
        lateinit var client: WebTestClient

        @Test
        fun `only jira configured returns jira non-null others null`() {
            client.get().uri("/portal/links")
                .exchange()
                .expectStatus().isOk
                .expectBody()
                .jsonPath("$.jiraBaseUrl").isEqualTo("https://jira.example.com")
                .jsonPath("$.gitBaseUrl").doesNotExist()
                .jsonPath("$.tcBaseUrl").doesNotExist()
                .jsonPath("$.dmsBaseUrl").doesNotExist()
        }
    }

    @Nested
    @SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = [
            "management.server.port=0",
            "portal.component.solution-key-patterns=-solution, dmp-bundle ,",
        ],
    )
    @AutoConfigureWebTestClient
    @ActiveProfiles("test")
    @Import(TestSecurityConfig::class, PortalInfoControllerTest.TestBuildPropertiesConfig::class)
    @WithMockUser
    inner class SolutionKeyPatternsConfigured {
        @Autowired
        lateinit var client: WebTestClient

        @Test
        fun `comma list is trimmed, blanks dropped, returned as an array`() {
            client.get().uri("/portal/config")
                .exchange()
                .expectStatus().isOk
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
                .expectBody()
                .jsonPath("$.solutionKeyPatterns.length()").isEqualTo(2)
                .jsonPath("$.solutionKeyPatterns[0]").isEqualTo("-solution")
                .jsonPath("$.solutionKeyPatterns[1]").isEqualTo("dmp-bundle")
        }
    }

    @Nested
    @SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = [
            "management.server.port=0",
            "portal.component.solution-key-patterns=",
        ],
    )
    @AutoConfigureWebTestClient
    @ActiveProfiles("test")
    @Import(TestSecurityConfig::class, PortalInfoControllerTest.TestBuildPropertiesConfig::class)
    @WithMockUser
    inner class SolutionKeyPatternsEmpty {
        @Autowired
        lateinit var client: WebTestClient

        @Test
        fun `blank config returns an empty array (never omitted)`() {
            client.get().uri("/portal/config")
                .exchange()
                .expectStatus().isOk
                .expectBody()
                .jsonPath("$.solutionKeyPatterns").isArray
                .jsonPath("$.solutionKeyPatterns.length()").isEqualTo(0)
        }
    }

    // Default test config leaves portal.onboarding-video.vcs.root blank → the feature is
    // off, so /portal/config reports it disabled with no poster.
    @Nested
    @SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = ["management.server.port=0"],
    )
    @AutoConfigureWebTestClient
    @ActiveProfiles("test")
    @Import(TestSecurityConfig::class, PortalInfoControllerTest.TestBuildPropertiesConfig::class)
    @WithMockUser
    inner class OnboardingVideoDisabled {
        @Autowired
        lateinit var client: WebTestClient

        @Test
        fun `blank root reports disabled and no poster`() {
            client.get().uri("/portal/config")
                .exchange()
                .expectStatus().isOk
                .expectBody()
                .jsonPath("$.onboardingVideoStatus").isEqualTo("disabled")
                .jsonPath("$.onboardingVideoHasPoster").isEqualTo(false)
        }
    }

    // After the service loads a fixture repo, /portal/config flips to ready and reports the
    // poster presence — the tri-/quad-state the SPA polls on.
    // Mutates the singleton service to READY → isolated context (own cache key) +
    // @DirtiesContext, so the DISABLED/links/solution contexts never see a loaded bean.
    @Nested
    @SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = ["management.server.port=0", "test.context=onboarding-video-ready-config"],
    )
    @AutoConfigureWebTestClient
    @ActiveProfiles("test")
    @Import(TestSecurityConfig::class, PortalInfoControllerTest.TestBuildPropertiesConfig::class)
    @WithMockUser
    @DirtiesContext
    inner class OnboardingVideoReady {
        @Autowired lateinit var client: WebTestClient
        @Autowired lateinit var service: OnboardingVideoService
        @Autowired lateinit var props: OnboardingVideoProperties

        @BeforeEach
        fun loadFixture(@TempDir tmp: Path) {
            val repo = Files.createDirectory(tmp.resolve("repo"))
            Git.init().setDirectory(repo.toFile()).call().use { git ->
                Files.write(repo.resolve("intro.mp4"), byteArrayOf(1, 2, 3))
                Files.write(repo.resolve("poster.jpg"), byteArrayOf(4, 5))
                git.add().addFilepattern(".").call()
                val who = PersonIdent("test", "test@example.com")
                git.commit().setMessage("fixture").setAuthor(who).setCommitter(who).call()
            }
            props.workDir = Files.createDirectory(tmp.resolve("work")).toString()
            props.vcs.root = repo.toUri().toString()
            props.posterPath = "poster.jpg"
            check(service.tryLoadSafely())
        }

        @Test
        fun `loaded video reports ready with poster`() {
            client.get().uri("/portal/config")
                .exchange()
                .expectStatus().isOk
                .expectBody()
                .jsonPath("$.onboardingVideoStatus").isEqualTo("ready")
                .jsonPath("$.onboardingVideoHasPoster").isEqualTo(true)
        }
    }
}
