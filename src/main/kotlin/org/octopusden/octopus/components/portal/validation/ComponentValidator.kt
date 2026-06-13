package org.octopusden.octopus.components.portal.validation

import org.octopusden.octopus.components.portal.validation.model.ValidationProblem
import org.octopusden.octopus.components.portal.validation.model.ValidationProblemType
import reactor.core.publisher.Mono

/**
 * Validator SPI. A new problem kind is added by dropping in a new `@Component`
 * implementing this interface (and a matching [ValidationProblemType]).
 *
 * The orchestrator supplies [releasedVersions] (fetched once per component and
 * shared across validators that need it). If a future validator needs other
 * inputs, widen the orchestrator's per-component context rather than this
 * signature.
 */
interface ComponentValidator {
    val type: ValidationProblemType

    fun validate(component: String, releasedVersions: List<String>): Mono<List<ValidationProblem>>
}
