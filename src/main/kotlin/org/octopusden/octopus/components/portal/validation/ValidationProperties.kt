package org.octopusden.octopus.components.portal.validation

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "portal.validation")
class ValidationProperties {
    /** Base URL of release-management-service (RELEASE_MANAGEMENT_SERVICE_URL). No context-path. */
    var releaseManagementBaseUrl: String = ""

    /** Base URL of components-registry (defaults to COMPONENTS_REGISTRY_SERVICE_URL). */
    var registryBaseUrl: String = ""

    /** Background sweep cadence (fixedDelay). Default 1h. */
    var refreshIntervalMs: Long = 3_600_000

    /** Max in-flight per-component checks during a sweep. */
    var concurrency: Int = 8

    /** Per single downstream RM/CRS call timeout (P3) — applied in both clients. */
    var requestTimeoutSeconds: Long = 30

    /** Overall budget for one full background sweep (P2). */
    var sweepTimeoutSeconds: Long = 600

    /** Overall budget for one live per-component check (P3). */
    var liveTimeoutSeconds: Long = 60
}
