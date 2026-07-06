package org.octopusden.octopus.components.portal.serviceevent

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * SYS-061: configuration for reporting portal-owned operational events (portal
 * redeploys, validation-sweep runs) into the shared CRS `service_event` journal.
 * Bound from `portal.service-events.*`.
 *
 * The [token] is the single on/off gate (same model as the CRS ingest side): a blank
 * token → [ServiceEventClient] no-ops, so dev/unconfigured envs don't POST and setting the
 * per-env secret in Vault (`portal.service-events.token`) is all it takes to turn reporting
 * on. The target URL is the same components-registry base URL the validation sweep already
 * uses (`portal.validation.registry-base-url`).
 */
@ConfigurationProperties(prefix = "portal.service-events")
class ServiceEventReportingProperties {
    /** Shared secret sent as `X-Service-Event-Token`. Blank → reporting off (CRS would 403 anyway). */
    var token: String = ""
}
