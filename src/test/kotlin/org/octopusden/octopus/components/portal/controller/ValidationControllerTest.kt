package org.octopusden.octopus.components.portal.controller

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.octopusden.octopus.components.portal.configuration.TestSecurityConfig
import org.octopusden.octopus.components.portal.validation.ValidationProperties
import org.octopusden.octopus.components.portal.validation.ValidationService
import org.octopusden.octopus.components.portal.validation.client.RegistryClient
import org.octopusden.octopus.components.portal.validation.client.ReleaseManagementClient
import org.octopusden.octopus.components.portal.validation.validators.UnregisteredReleasedVersionsValidator
import org.springframework.beans.factory.DisposableBean
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.reactive.server.WebTestClient
import java.net.InetSocketAddress

/**
 * @SpringBootTest + WebTestClient over the real chain (mirrors PortalConfigControllerTest).
 *
 * [ValidationService] is final, so rather than mocking it we provide a real
 * primary bean wired to in-process HTTP stubs and pre-load a deterministic cached
 * report (one clean component, one with a problem, one checkFailed) plus a
 * refreshError (a follow-up sweep whose component-list fetch 500s, retaining the
 * good components). The live endpoint hits the stubs directly.
 *
 * @WithMockUser grants an authenticated principal so the (authenticated) endpoints
 * pass the security chain — identical to PortalConfigControllerTest.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["management.server.port=0"],
)
@AutoConfigureWebTestClient
@ActiveProfiles("test")
@Import(
    TestSecurityConfig::class,
    PortalInfoControllerTest.TestBuildPropertiesConfig::class,
    ValidationControllerTest.StubValidationServiceConfig::class,
)
@WithMockUser
class ValidationControllerTest {
    @Autowired
    lateinit var client: WebTestClient

    @Test
    fun `default report returns all components incl clean ones, with generatedAt and refreshError passthrough`() {
        client.get().uri("/portal/validation/components")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.generatedAt").exists()
            // refreshError is a short exception reason (contains a random stub port),
            // so assert it passes through non-empty rather than an exact match.
            .jsonPath("$.refreshError").value<String> { reason ->
                assertTrue(reason.isNotBlank(), "refreshError must pass through non-empty")
                assertTrue(reason.contains("500"), "refreshError should describe the 500: $reason")
            }
            .jsonPath("$.components.length()").isEqualTo(3)
    }

    @Test
    fun `problemsOnly keeps problem-bearing AND checkFailed components, drops clean ones`() {
        client.get().uri("/portal/validation/components?problemsOnly=true")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.components.length()").isEqualTo(2)
            .jsonPath("$.components[?(@.component == 'clean')]").doesNotExist()
            .jsonPath("$.components[?(@.component == 'problem')]").exists()
            .jsonPath("$.components[?(@.component == 'broken')]").exists()
            .jsonPath("$.components[?(@.component == 'broken')].checkFailed").isEqualTo(true)
    }

    @Test
    fun `type filter keeps only that type then drops components with neither problems nor a check failure`() {
        // The only type that exists is UNREGISTERED_RELEASED_VERSIONS, so it keeps the
        // problem component AND the checkFailed one (a failed check is not a clean pass),
        // and drops the clean one.
        client.get().uri("/portal/validation/components?type=UNREGISTERED_RELEASED_VERSIONS")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.components.length()").isEqualTo(2)
            .jsonPath("$.components[?(@.component == 'clean')]").doesNotExist()
            .jsonPath("$.components[?(@.component == 'problem')].problems.length()").isEqualTo(1)
            .jsonPath("$.components[?(@.component == 'broken')].checkFailed").isEqualTo(true)
    }

    @Test
    fun `live per-component path returns the live result`() {
        // The live stubs report version 7.7.7 released but unresolvable → one problem.
        client.get().uri("/portal/validation/components/live-comp")
            .exchange()
            .expectStatus().isOk
            .expectBody()
            .jsonPath("$.component").isEqualTo("live-comp")
            .jsonPath("$.checkFailed").isEqualTo(false)
            .jsonPath("$.problems.length()").isEqualTo(1)
            .jsonPath("$.problems[0].details.versions[0]").isEqualTo("7.7.7")
    }

    @TestConfiguration
    open class StubValidationServiceConfig : DisposableBean {
        private val servers = mutableListOf<HttpServer>()

        /** Stop all stub servers when the context is torn down (mirrors @AfterEach in ValidationServiceTest). */
        override fun destroy() {
            servers.forEach { it.stop(0) }
            servers.clear()
        }

        private fun newServer(): HttpServer {
            val stub = HttpServer.create(InetSocketAddress(0), 0)
            stub.start()
            servers.add(stub)
            return stub
        }

        private fun respond(
            exchange: HttpExchange,
            status: Int,
            body: String,
        ) {
            val bytes = body.toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(status, if (bytes.isEmpty()) -1 else bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }

        @Bean
        @Primary
        open fun validationService(): ValidationService {
            val crs = newServer()
            crs.createContext("/rest/api/3/components") { exchange ->
                respond(exchange, 200, """[{"id":"clean"},{"id":"problem"},{"id":"broken"}]""")
            }
            crs.createContext("/rest/api/2/components") { exchange ->
                val path = exchange.requestURI.path
                when {
                    path.contains("/clean/") -> respond(exchange, 200, """{"versions":{"1.0.1":{}}}""")
                    path.contains("/problem/") -> respond(exchange, 200, """{"versions":{}}""")
                    path.contains("/live-comp/") -> respond(exchange, 200, """{"versions":{}}""")
                    // "broken" CRS resolve never reached: RM 500s first for it.
                    else -> respond(exchange, 200, """{"versions":{}}""")
                }
            }
            val rm = newServer()
            rm.createContext("/rest/api/1/builds/component") { exchange ->
                val path = exchange.requestURI.path
                when {
                    path.endsWith("/broken") -> respond(exchange, 500, """{"error":"boom"}""")
                    path.endsWith("/live-comp") ->
                        respond(exchange, 200, """[{"version":"7.7.7","status":"RELEASE"}]""")
                    else -> respond(exchange, 200, """[{"version":"1.0.1","status":"RELEASE"}]""")
                }
            }

            val properties =
                ValidationProperties().apply {
                    registryBaseUrl = "http://localhost:${crs.address.port}"
                    releaseManagementBaseUrl = "http://localhost:${rm.address.port}"
                    requestTimeoutSeconds = 10
                    sweepTimeoutSeconds = 30
                    liveTimeoutSeconds = 30
                    concurrency = 4
                    // Very large interval: the @Scheduled tick won't fire during the test;
                    // we drive the cache state deterministically below.
                    refreshIntervalMs = 3_600_000
                }
            val registry = RegistryClient(properties)
            val rmClient = ReleaseManagementClient(properties)
            val validator = UnregisteredReleasedVersionsValidator(registry)
            val service = ValidationService(registry, rmClient, listOf(validator), properties)

            // Phase 1: a good sweep → populates the cache (clean / problem / broken).
            service.refresh()
            // Phase 2: make the component-list fetch fail → retains the good components,
            // sets refreshError, leaves generatedAt. Gives us a non-null refreshError to
            // assert passthrough.
            crs.removeContext("/rest/api/3/components")
            crs.createContext("/rest/api/3/components") { exchange ->
                respond(exchange, 500, """{"error":"list-down"}""")
            }
            service.refresh()

            return service
        }
    }

}
