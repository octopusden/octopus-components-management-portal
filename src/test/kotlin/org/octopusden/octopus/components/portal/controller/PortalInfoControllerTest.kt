package org.octopusden.octopus.components.portal.controller

import org.junit.jupiter.api.Test
import org.octopusden.octopus.components.portal.configuration.TestSecurityConfig
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.info.BuildProperties
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient
import java.util.Properties

// The portal footer renders "Components Registry by F1 team (portal X · service Y)"
// before the user has authenticated, so /portal/info must be reachable
// anonymously and return JSON. Three layers compete for /portal/info and all
// of them have to pass-through to the controller for this to work:
//
//   1. SecurityConfig: anyExchange().authenticated() blocks anonymous unless
//      /portal/info is on the permitAll list.
//   2. WebConfig.spaRouter: a GET-with-wildcards route that matches everything
//      except a hand-curated exclude list, otherwise returns index.html.
//   3. SpaFallbackFilter: similar pre-dispatcher path-prefix filter that writes
//      index.html for unknown frontend paths.
//
// A @WebFluxTest slice would not load any of those — only the full
// @SpringBootTest exercises the real chain, so this is the load-bearing
// regression test for the /portal/info contract.
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = [
        "management.server.port=0",
    ],
)
@AutoConfigureWebTestClient
@ActiveProfiles("test")
@Import(TestSecurityConfig::class, PortalInfoControllerTest.TestBuildPropertiesConfig::class)
class PortalInfoControllerTest {
    @Autowired
    lateinit var webTestClient: WebTestClient

    @Test
    fun `anonymous GET portal info returns 200 with build name and version`() {
        webTestClient
            .get()
            .uri("/portal/info")
            .exchange()
            .expectStatus().isOk
            .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
            .expectBody()
            .jsonPath("$.name").isEqualTo(EXPECTED_NAME)
            .jsonPath("$.version").isEqualTo(EXPECTED_VERSION)
    }

    @Test
    fun `links block is present in response`() {
        webTestClient
            .get()
            .uri("/portal/info")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.links").exists()
    }

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
    @Import(TestSecurityConfig::class, TestBuildPropertiesConfig::class)
    inner class AllLinksConfigured {
        @Autowired
        lateinit var client: WebTestClient

        @Test
        fun `all four URLs configured returns them all`() {
            client.get().uri("/portal/info").exchange()
                .expectStatus().isOk
                .expectBody()
                .jsonPath("$.links.jiraBaseUrl").isEqualTo("https://jira.example.com")
                .jsonPath("$.links.gitBaseUrl").isEqualTo("https://git.example.com")
                .jsonPath("$.links.tcBaseUrl").isEqualTo("https://tc.example.com")
                .jsonPath("$.links.dmsBaseUrl").isEqualTo("https://dms.example.com")
        }
    }

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
    @Import(TestSecurityConfig::class, TestBuildPropertiesConfig::class)
    inner class AllLinksEmpty {
        @Autowired
        lateinit var client: WebTestClient

        @Test
        fun `all four empty strings collapse to null in response`() {
            client.get().uri("/portal/info").exchange()
                .expectStatus().isOk
                .expectBody()
                .jsonPath("$.links.jiraBaseUrl").doesNotExist()
                .jsonPath("$.links.gitBaseUrl").doesNotExist()
                .jsonPath("$.links.tcBaseUrl").doesNotExist()
                .jsonPath("$.links.dmsBaseUrl").doesNotExist()
        }
    }

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
    @Import(TestSecurityConfig::class, TestBuildPropertiesConfig::class)
    inner class MixedLinks {
        @Autowired
        lateinit var client: WebTestClient

        @Test
        fun `only jira configured returns jira non-null others null`() {
            client.get().uri("/portal/info").exchange()
                .expectStatus().isOk
                .expectBody()
                .jsonPath("$.links.jiraBaseUrl").isEqualTo("https://jira.example.com")
                .jsonPath("$.links.gitBaseUrl").doesNotExist()
                .jsonPath("$.links.tcBaseUrl").doesNotExist()
                .jsonPath("$.links.dmsBaseUrl").doesNotExist()
        }
    }

    @TestConfiguration
    open class TestBuildPropertiesConfig {
        // BuildProperties is a final class, but its public Properties-based
        // constructor produces a real instance — preferred over a Mockito mock
        // (mockito-inline isn't in the test classpath) and over relying on
        // META-INF/build-info.properties (which is only in the bootJar, not on
        // the test classpath).
        @Bean
        @Primary
        open fun buildProperties(): BuildProperties {
            val props = Properties()
            props.setProperty("name", EXPECTED_NAME)
            props.setProperty("version", EXPECTED_VERSION)
            return BuildProperties(props)
        }
    }

    companion object {
        private const val EXPECTED_NAME = "octopus-components-management-portal"
        private const val EXPECTED_VERSION = "1.2.3"
    }
}
