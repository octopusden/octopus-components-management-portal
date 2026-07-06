package org.octopusden.octopus.components.portal.serviceevent

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * SYS-061: configuration for reporting portal-owned operational events (portal
 * redeploys, validation-sweep runs) into the shared CRS `service_event` journal.
 * Bound from `portal.service-events.*`.
 *
 * Inert by default: with [enabled] false (or a blank [token]) the [ServiceEventClient]
 * no-ops, so dev/unconfigured envs don't POST. Production wires the shared secret through
 * service-config; the CRS side rejects a blank token fail-closed anyway. The target URL is
 * the same components-registry base URL the validation sweep already uses
 * (`portal.validation.registry-base-url`).
 */
@ConfigurationProperties(prefix = "portal.service-events")
class ServiceEventReportingProperties {
    /** Master switch. False → no events are reported (client no-ops). */
    var enabled: Boolean = false

    /** Shared secret sent as `X-Service-Event-Token`. Blank → client no-ops (CRS would 403). */
    var token: String = ""
}
