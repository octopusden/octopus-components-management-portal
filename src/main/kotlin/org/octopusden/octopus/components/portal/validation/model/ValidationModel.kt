package org.octopusden.octopus.components.portal.validation.model

import com.fasterxml.jackson.annotation.JsonIgnore
import java.time.Instant

/**
 * The kind of validation problem. Extend this enum (and add a matching
 * [org.octopusden.octopus.components.portal.validation.ComponentValidator]) to
 * surface new problem kinds. The first and currently only kind reconciles
 * release-management's RELEASE builds against the components-registry resolver.
 */
enum class ValidationProblemType { UNREGISTERED_RELEASED_VERSIONS }

enum class ValidationSeverity { ERROR, WARNING }

/**
 * A single problem found for a component. [details] carries a type-specific
 * payload (e.g. the unresolved versions) so the UI/API can render specifics
 * without the backend committing to a fixed shape per type.
 */
data class ValidationProblem(
    val type: ValidationProblemType,
    val severity: ValidationSeverity,
    val message: String,
    val details: Map<String, Any?> = emptyMap(),
)

/**
 * Validation outcome for one component.
 *
 * A failed check ([checkFailed] = true) means we did NOT learn whether the
 * component is clean — a validator/client error (bad URL, 401/5xx, timeout)
 * prevented the check. This is deliberately distinct from an empty [problems]
 * list (a genuine clean pass): a failure must never masquerade as clean, and
 * `problemsOnly` filtering keeps failed components.
 */
data class ComponentValidation(
    val component: String,
    val problems: List<ValidationProblem>,
    val checkFailed: Boolean = false,
    val checkError: String? = null,
)

/**
 * The cached report produced by a full sweep.
 *
 * - [generatedAt]: when the held [components] were produced (last SUCCESS);
 *   null before the first successful sweep.
 * - [lastAttemptAt]: when the most recent refresh attempt ran (success or not).
 * - [refreshError]: non-null when the most recent attempt failed; in that case
 *   the previous good [components] are retained (stale-but-honest). Callers
 *   compare [lastAttemptAt] vs [generatedAt] (+ [refreshError]) to detect staleness.
 */
data class ValidationReport(
    val generatedAt: Instant?,
    val lastAttemptAt: Instant?,
    val refreshError: String? = null,
    val components: List<ComponentValidation>,
    // Internal scheduling signal, NOT part of the API payload (@get:JsonIgnore): true when
    // the last refresh was a migration SKIP. Folded into the report so refreshError and the
    // skip flag are updated in ONE atomic assignment — nextDelayMillis() then reads a single
    // immutable snapshot and can never observe an inconsistent in-between (the two separate
    // @Volatile writes it replaced could be read mid-update).
    @get:JsonIgnore val lastRunWasSkip: Boolean = false,
)
