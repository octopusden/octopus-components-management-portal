package org.octopusden.octopus.components.portal.controller

import org.junit.jupiter.api.Test
import org.octopusden.octopus.components.portal.configuration.TestSecurityConfig
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.info.BuildProperties
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient
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
    fun `anonymous GET portal info does not include links`() {
        webTestClient
            .get()
            .uri("/portal/info")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.links").doesNotExist()
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
