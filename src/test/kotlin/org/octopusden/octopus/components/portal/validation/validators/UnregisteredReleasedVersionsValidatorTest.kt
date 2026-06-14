package org.octopusden.octopus.components.portal.validation.validators

import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.octopusden.octopus.components.portal.validation.ValidationProperties
import org.octopusden.octopus.components.portal.validation.client.RegistryClient
import org.octopusden.octopus.components.portal.validation.model.ValidationProblemType
import org.octopusden.octopus.components.portal.validation.model.ValidationSeverity
import java.net.InetSocketAddress
import java.time.Duration

/**
 * Unit tests for [UnregisteredReleasedVersionsValidator].
 *
 * The validator depends on a (final) [RegistryClient], so instead of mocking we
 * drive a real client against a tiny in-process HTTP stub for CRS's
 * `POST /rest/api/2/components/{c}/detailed-versions` endpoint. CRS only returns
 * the RESOLVABLE versions as keys of the `versions` map, so `missing` is exactly
 * the released versions not present in those keys.
 */
class UnregisteredReleasedVersionsValidatorTest {
    private var server: HttpServer? = null

    @AfterEach
    fun tearDown() {
        server?.stop(0)
    }

    /**
     * Stub CRS detailed-versions: echoes the supplied [resolvable] versions as the
     * keys of the returned `versions` map. (The validator never reaches this stub
     * when the released set is empty.)
     */
    private fun validatorReturning(resolvable: Set<String>): UnregisteredReleasedVersionsValidator {
        val stub = HttpServer.create(InetSocketAddress(0), 0)
        stub.createContext("/rest/api/2/components") { exchange ->
            val versionsJson = resolvable.joinToString(",") { "\"$it\":{}" }
            val body = """{"versions":{$versionsJson}}""".toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        stub.start()
        server = stub
        val properties =
            ValidationProperties().apply {
                registryBaseUrl = "http://localhost:${stub.address.port}"
                requestTimeoutSeconds = 10
            }
        return UnregisteredReleasedVersionsValidator(RegistryClient(properties))
    }

    @Test
    @DisplayName("missing = released - resolvable; emits one ERROR problem with details payload")
    fun `flags unresolvable released versions`() {
        val released = listOf("1.0.1", "1.0.2", "1.0.3")
        val validator = validatorReturning(resolvable = setOf("1.0.1", "1.0.3"))

        val problems = validator.validate("comp", released).block(Duration.ofSeconds(10))!!

        assertEquals(1, problems.size)
        val problem = problems.single()
        assertEquals(ValidationProblemType.UNREGISTERED_RELEASED_VERSIONS, problem.type)
        assertEquals(ValidationSeverity.ERROR, problem.severity)
        assertTrue(problem.message.contains("1 released version"), "message was: ${problem.message}")
        assertEquals(listOf("1.0.2"), problem.details["versions"])
        assertEquals(1, problem.details["missingCount"])
        assertEquals(3, problem.details["releasedCount"])
    }

    @Test
    @DisplayName("all resolvable → no problem emitted")
    fun `no problem when everything resolves`() {
        val released = listOf("1.0.1", "1.0.2")
        val validator = validatorReturning(resolvable = setOf("1.0.1", "1.0.2"))

        val problems = validator.validate("comp", released).block(Duration.ofSeconds(10))!!

        assertTrue(problems.isEmpty(), "expected no problems, got: $problems")
    }

    @Test
    @DisplayName("sub-component-qualified versions are passed verbatim and flagged when unresolvable")
    fun `subcomponent qualified version flagged verbatim`() {
        val released = listOf("ExampleService.1.0.1", "1.0.1")
        // CRS resolves only the plain version; the sub-component-qualified one is missing.
        val validator = validatorReturning(resolvable = setOf("1.0.1"))

        val problems = validator.validate("example-component", released).block(Duration.ofSeconds(10))!!

        val problem = problems.single()
        assertEquals(listOf("ExampleService.1.0.1"), problem.details["versions"])
        assertEquals(1, problem.details["missingCount"])
        assertEquals(2, problem.details["releasedCount"])
    }
}
