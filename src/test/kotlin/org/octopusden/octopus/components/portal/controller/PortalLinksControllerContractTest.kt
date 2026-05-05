package org.octopusden.octopus.components.portal.controller

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.octopusden.octopus.components.portal.configuration.TestSecurityConfig
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient
import java.nio.file.Files
import java.nio.file.Paths
import kotlin.test.assertEquals

// Contract guard against backend/frontend shape drift on /portal/links.
//
// JSON fixtures in frontend/src/test-fixtures/ are the canonical wire formats.
// They are also imported by useInfo.test.ts ("contract:" cases) so the same
// JSON drives both sides. If Spring's serialization of LinksResponse ever
// stops matching a fixture (envelope wrap, field rename, null-omission policy
// change), the relevant @Nested case fails. If the frontend type expects a
// different shape, the JS-side contract test fails.
class PortalLinksControllerContractTest {

    private val mapper = ObjectMapper()

    private fun fixture(name: String): JsonNode =
        mapper.readTree(Files.readString(Paths.get("frontend", "src", "test-fixtures", name)))

    private fun fetchBody(client: WebTestClient): JsonNode {
        val bytes = client.get().uri("/portal/links")
            .exchange()
            .expectStatus().isOk
            .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
            .returnResult(ByteArray::class.java)
            .responseBody
            .blockFirst()!!
        return mapper.readTree(bytes)
    }

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
    inner class AllUrlsConfigured {
        @Autowired
        lateinit var client: WebTestClient

        @Test
        fun `served response matches portal-links contract fixture`() {
            assertEquals(fixture("portal-links.contract.json"), fetchBody(client))
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
    inner class NoUrlsConfigured {
        @Autowired
        lateinit var client: WebTestClient

        @Test
        fun `served response matches portal-links empty contract fixture`() {
            // Empty-string yaml binding collapses to null in the controller and
            // Jackson omits null properties, so the body is `{}` — frontend code
            // must tolerate the four keys being absent, not merely null.
            assertEquals(fixture("portal-links.empty.contract.json"), fetchBody(client))
        }
    }
}
