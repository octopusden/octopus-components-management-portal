package org.octopusden.octopus.components.portal.validation

import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.validation.annotation.Validated

/**
 * Bean-validated so a misconfigured deployment fails fast at startup rather than
 * silently sweeping against a blank/zeroed config. Hibernate Validator is already
 * on the classpath (spring-boot-starter-validation, pulled transitively via
 * spring-cloud-starter), so no extra dependency is needed.
 */
@Validated
@ConfigurationProperties(prefix = "portal.validation")
class ValidationProperties {
    /** Base URL of release-management-service (RELEASE_MANAGEMENT_SERVICE_URL). No context-path. */
    @field:NotBlank
    var releaseManagementBaseUrl: String = ""

    /** Base URL of components-registry (defaults to COMPONENTS_REGISTRY_SERVICE_URL). */
    @field:NotBlank
    var registryBaseUrl: String = ""

    /** Background sweep cadence on success (fixedDelay). Default 4h. */
    @field:Positive
    var refreshIntervalMs: Long = 14_400_000

    /**
     * Short cadence used after a FAILED whole-sweep (timeout/unreachable) so a transient
     * downstream outage — e.g. a CRS redeploy running its multi-minute DSL→DB migration,
     * which starves requests and trips the sweep timeout — self-heals within minutes
     * instead of leaving a stale report (and its banner) until the next [refreshIntervalMs].
     * Default 10m.
     */
    @field:Positive
    var retryIntervalMs: Long = 600_000

    /** Max in-flight per-component checks during a sweep (kept modest to not overload a single CRS). */
    @field:Positive
    var concurrency: Int = 4

    /** Per single downstream RM/CRS call timeout (P3) — applied in both clients. */
    @field:Positive
    var requestTimeoutSeconds: Long = 30

    /** Overall budget for one full background sweep (P2). */
    @field:Positive
    var sweepTimeoutSeconds: Long = 600

    /** Overall budget for one live per-component check (P3). */
    @field:Positive
    var liveTimeoutSeconds: Long = 60

    /**
     * Max in-memory buffer (bytes) for a single downstream response body, applied
     * to both client WebClients' codecs. The CRS `/rest/api/3/components` list is
     * already ~1.3 MB (≈979 components) and grows; WebClient's default 256 KB codec
     * limit overflows it with DataBufferLimitException. 16 MiB gives generous headroom.
     */
    @field:Positive
    var maxResponseBytes: Int = 16 * 1024 * 1024

    /**
     * The failure-backoff is only a backoff if the retry cadence is SHORTER than the
     * normal one; a config that inverts them (retry >= refresh) would silently slow
     * retries down. Fail fast at startup instead.
     */
    @AssertTrue(message = "portal.validation.retry-interval-ms must be shorter than refresh-interval-ms")
    fun isRetryIntervalShorterThanRefresh(): Boolean = retryIntervalMs < refreshIntervalMs
}
