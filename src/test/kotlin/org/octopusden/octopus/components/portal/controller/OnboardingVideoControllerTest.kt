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
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.test.annotation.DirtiesContext
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient
import java.nio.file.Files
import java.nio.file.Path

// The onboarding-video media endpoints are authenticated (fall through to
// anyExchange().authenticated()) so @WithMockUser supplies a synthetic principal.
// No mocks (matching the repo convention): each context boots the real service and
// loads it synchronously from a throwaway local git repo via tryLoadSafely(), which
// also gives the JGit clone path real HTTP-level coverage.
@ActiveProfiles("test")
class OnboardingVideoControllerTest {

    private val videoBytes = ByteArray(1000) { (it % 256).toByte() }
    private val posterBytes = byteArrayOf(9, 8, 7, 6, 5)

    private fun makeRepo(dir: Path) {
        Git.init().setDirectory(dir.toFile()).call().use { git ->
            Files.write(dir.resolve("intro.mp4"), videoBytes)
            Files.write(dir.resolve("poster.jpg"), posterBytes)
            git.add().addFilepattern(".").call()
            val who = PersonIdent("test", "test@example.com")
            git.commit().setMessage("fixture").setAuthor(who).setCommitter(who).call()
        }
    }

    // Loads a fixture into the singleton service, so it MUST run in an isolated context:
    // a distinct test property gives it its own cache key (the DISABLED context below,
    // with a blank root, is never handed a mutated bean), and @DirtiesContext discards the
    // mutated context afterwards so it can't leak to any later same-config test class.
    @Nested
    @SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = ["management.server.port=0", "test.context=onboarding-video-ready-controller"],
    )
    @AutoConfigureWebTestClient
    @ActiveProfiles("test")
    @Import(TestSecurityConfig::class, PortalInfoControllerTest.TestBuildPropertiesConfig::class)
    @WithMockUser
    @DirtiesContext
    inner class WhenReady {
        @Autowired lateinit var client: WebTestClient
        @Autowired lateinit var service: OnboardingVideoService
        @Autowired lateinit var props: OnboardingVideoProperties

        @BeforeEach
        fun loadFromFixtureRepo(@TempDir tmp: Path) {
            val repo = Files.createDirectory(tmp.resolve("repo"))
            makeRepo(repo)
            props.workDir = Files.createDirectory(tmp.resolve("work")).toString()
            props.vcs.root = repo.toUri().toString()
            props.path = "intro.mp4"
            props.posterPath = "poster.jpg"
            check(service.tryLoadSafely()) { "fixture load must succeed" }
        }

        @Test
        fun `GET video returns 200 with mp4 body`() {
            client.get().uri("/portal/media/onboarding-video")
                .exchange()
                .expectStatus().isOk
                .expectHeader().contentType("video/mp4")
                .expectBody()
                .consumeWith { assertBytesEqual(videoBytes, it.responseBody) }
        }

        @Test
        fun `GET video with Range returns 206 partial content`() {
            client.get().uri("/portal/media/onboarding-video")
                .header(HttpHeaders.RANGE, "bytes=0-4")
                .exchange()
                .expectStatus().isEqualTo(HttpStatus.PARTIAL_CONTENT)
                .expectHeader().exists(HttpHeaders.CONTENT_RANGE)
                .expectBody()
                .consumeWith { assertBytesEqual(videoBytes.copyOfRange(0, 5), it.responseBody) }
        }

        @Test
        fun `GET poster returns 200 with image body`() {
            client.get().uri("/portal/media/onboarding-video/poster")
                .exchange()
                .expectStatus().isOk
                .expectHeader().contentType("image/jpeg")
                .expectBody()
                .consumeWith { assertBytesEqual(posterBytes, it.responseBody) }
        }
    }

    @Nested
    @SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = ["management.server.port=0"],
    )
    @AutoConfigureWebTestClient
    @ActiveProfiles("test")
    @Import(TestSecurityConfig::class, PortalInfoControllerTest.TestBuildPropertiesConfig::class)
    @WithMockUser
    inner class WhenDisabled {
        // Default test config has a blank root → service DISABLED, nothing loaded.
        @Autowired lateinit var client: WebTestClient

        @Test
        fun `GET video is 404 when nothing is loaded`() {
            client.get().uri("/portal/media/onboarding-video")
                .exchange()
                .expectStatus().isNotFound
        }

        @Test
        fun `GET poster is 404 when nothing is loaded`() {
            client.get().uri("/portal/media/onboarding-video/poster")
                .exchange()
                .expectStatus().isNotFound
        }
    }

    private fun assertBytesEqual(expected: ByteArray, actual: ByteArray?) {
        org.junit.jupiter.api.Assertions.assertArrayEquals(expected, actual)
    }
}
