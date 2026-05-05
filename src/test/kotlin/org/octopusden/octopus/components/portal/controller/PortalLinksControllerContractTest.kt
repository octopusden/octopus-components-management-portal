package org.octopusden.octopus.components.portal.controller

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
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
// frontend/src/test-fixtures/portal-links.contract.json is the canonical
// wire format for the LinksResponse DTO. It is also imported by
// useInfo.test.ts ("contract:" cases) so the same JSON drives both sides.
//
// If Spring's serialization of LinksResponse ever stops matching the fixture
// (for example, by wrapping the four fields in an envelope or renaming a
// field), this test fails. If the frontend type ever expects a different
// shape, the JS-side contract test fails. Either failure surfaces the
// drift in normal `gradlew test` / `npm run test:run`, before E2E runs.
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
class PortalLinksControllerContractTest {

    @Autowired
    lateinit var client: WebTestClient

    @Test
    fun `served response matches the shared frontend fixture byte-for-byte`() {
        val fixturePath = Paths.get("frontend", "src", "test-fixtures", "portal-links.contract.json")
        val mapper = ObjectMapper()
        val expected: JsonNode = mapper.readTree(Files.readString(fixturePath))

        val responseBytes = client.get().uri("/portal/links")
            .exchange()
            .expectStatus().isOk
            .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
            .returnResult(ByteArray::class.java)
            .responseBody
            .blockFirst()!!
        val actual: JsonNode = mapper.readTree(responseBytes)

        assertEquals(expected, actual)
    }
}
