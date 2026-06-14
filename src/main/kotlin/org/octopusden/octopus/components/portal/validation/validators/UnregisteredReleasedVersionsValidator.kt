package org.octopusden.octopus.components.portal.validation.validators

import org.octopusden.octopus.components.portal.validation.ComponentValidator
import org.octopusden.octopus.components.portal.validation.client.RegistryClient
import org.octopusden.octopus.components.portal.validation.model.ValidationProblem
import org.octopusden.octopus.components.portal.validation.model.ValidationProblemType
import org.octopusden.octopus.components.portal.validation.model.ValidationSeverity
import org.springframework.stereotype.Component
import reactor.core.publisher.Mono

/**
 * Flags released versions (RM RELEASE builds) that the components-registry
 * cannot resolve — exactly the "Unable to find <component>:<version> in
 * Components Registry" set that breaks releng operations.
 *
 * missing = releasedVersions - resolvableVersions(component, releasedVersions)
 */
@Component
class UnregisteredReleasedVersionsValidator(
    private val registryClient: RegistryClient,
) : ComponentValidator {
    override val type: ValidationProblemType = ValidationProblemType.UNREGISTERED_RELEASED_VERSIONS

    override fun validate(component: String, releasedVersions: List<String>): Mono<List<ValidationProblem>> =
        registryClient.resolvableVersions(component, releasedVersions).map { resolvable ->
            val missing = releasedVersions.filterNot { it in resolvable }
            if (missing.isEmpty()) {
                emptyList()
            } else {
                listOf(
                    ValidationProblem(
                        type = type,
                        severity = ValidationSeverity.ERROR,
                        message = "${missing.size} released version(s) not registered in components-registry",
                        details = mapOf(
                            "versions" to missing,
                            "missingCount" to missing.size,
                            "releasedCount" to releasedVersions.size,
                        ),
                    ),
                )
            }
        }
}
