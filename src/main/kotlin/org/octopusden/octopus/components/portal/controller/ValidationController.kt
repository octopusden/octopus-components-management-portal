package org.octopusden.octopus.components.portal.controller

import org.octopusden.octopus.components.portal.validation.ValidationService
import org.octopusden.octopus.components.portal.validation.model.ComponentValidation
import org.octopusden.octopus.components.portal.validation.model.ValidationProblemType
import org.octopusden.octopus.components.portal.validation.model.ValidationReport
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import reactor.core.publisher.Mono

/**
 * Maintainer-facing validation report endpoints. Authenticated (see SecurityConfig —
 * the `/portal/validation` path prefix is registered as an API path so an expired
 * session yields a JSON 401 rather than an OIDC 302/HTML).
 */
@RestController
@RequestMapping("portal/validation")
class ValidationController(
    private val validationService: ValidationService,
) {
    /**
     * Cached report. `problemsOnly=true` keeps a component if it has problems OR
     * checkFailed=true (a failed check is not a clean pass). `type=` filters problems
     * to that type, then drops components left with neither problems nor a check
     * failure. `refreshError`/`generatedAt` always pass through so callers can tell
     * the report is stale.
     */
    @GetMapping("/components")
    fun components(
        @RequestParam(name = "problemsOnly", defaultValue = "false") problemsOnly: Boolean,
        @RequestParam(name = "type", required = false) type: ValidationProblemType?,
    ): ValidationReport {
        val report = validationService.currentReport()
        var components = report.components

        if (type != null) {
            components = components
                .map { cv -> cv.copy(problems = cv.problems.filter { it.type == type }) }
                .filter { it.problems.isNotEmpty() || it.checkFailed }
        }

        if (problemsOnly) {
            components = components.filter { it.problems.isNotEmpty() || it.checkFailed }
        }

        return report.copy(components = components)
    }

    /** Live (cache-bypassing) per-component check. */
    @GetMapping("/components/{component}")
    fun component(
        @PathVariable("component") component: String,
    ): Mono<ComponentValidation> = validationService.validateLive(component)
}
