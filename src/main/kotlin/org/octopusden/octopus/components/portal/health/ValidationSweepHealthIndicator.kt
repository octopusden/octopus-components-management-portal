package org.octopusden.octopus.components.portal.health

import org.octopusden.octopus.components.portal.validation.ValidationService
import org.springframework.boot.health.contributor.Health
import org.springframework.boot.health.contributor.HealthIndicator
import org.springframework.stereotype.Component

/**
 * Actuator health component `validationSweep` under `/actuator/health`.
 *
 * Surfaces the state of the cached validation sweep so a misconfigured /
 * unreachable downstream (e.g. an unset RELEASE_MANAGEMENT_SERVICE_URL or an
 * unreachable components-registry) is DIAGNOSABLE from monitoring rather than
 * only via an opaque per-request error. It reads the CACHED report from
 * [ValidationService] — it makes NO HTTP calls of its own (a health scrape must
 * not trigger a fresh sweep), so a plain blocking [HealthIndicator] is enough.
 *
 * Status mapping:
 * - no sweep yet (generatedAt == null, no refreshError) → UNKNOWN (not a failure)
 * - most recent refresh failed (refreshError != null)   → DOWN (+ categorized reason)
 * - otherwise                                            → UP (+ counts)
 *
 * Sanitization: `/actuator/health` is anonymous (permitAll in SecurityConfig),
 * so the details here MUST NOT contain internal URLs/hosts — only the already
 * sanitized, host-free category from [ValidationService.categorizedReason],
 * timestamps and counts. The actionable detail that DOES name the configured
 * base URLs + env vars is emitted to the SERVER log by ValidationService, never
 * here.
 *
 * Deployment safety: the OKD probe hits `/actuator/health/liveness` (the
 * liveness GROUP), and custom indicators are not part of probe groups — a DOWN
 * here flips the aggregate health for monitoring without restarting pods or
 * blocking a rollout (same trade-off as employeeServiceIntegration).
 */
@Component("validationSweep")
class ValidationSweepHealthIndicator(
    private val validationService: ValidationService,
) : HealthIndicator {
    override fun health(): Health {
        val report = validationService.currentReport()
        return when {
            report.generatedAt == null && report.refreshError == null ->
                Health.unknown()
                    .withDetail("reason", "validation sweep has not run yet")
                    .build()

            report.refreshError != null ->
                Health.down()
                    .withDetail("reason", report.refreshError)
                    .withDetail("lastAttemptAt", report.lastAttemptAt.toString())
                    // generatedAt = last SUCCESS (may be null if no sweep ever succeeded).
                    .withDetail("generatedAt", report.generatedAt.toString())
                    .build()

            else ->
                Health.up()
                    .withDetail("generatedAt", report.generatedAt.toString())
                    .withDetail("componentsChecked", report.components.size)
                    .withDetail(
                        "componentsWithProblems",
                        report.components.count { it.problems.isNotEmpty() || it.checkFailed },
                    )
                    .build()
        }
    }
}
