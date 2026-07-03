package org.octopusden.octopus.components.portal.configuration

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Component-editor knobs sourced from service-config (read-only in the Portal).
 *
 * `solutionKeyPatterns` drives the conditional dedicated "Solution" topic/tab:
 * the SPA shows the solution/not-solution switch only for a component whose
 * key CONTAINS one of these substrings (e.g. `-solution`, `dmp-bundle`). For
 * every other component the flag stays server-owned and is surfaced read-only as
 * a header badge/banner. Substring semantics (not regex) so config stays simple;
 * the SPA mirrors this with `String.includes`.
 *
 * Comma-separated in yaml (`portal.component.solution-key-patterns=-solution,dmp-bundle`);
 * Spring's relaxed binding maps that to the list. An empty/blank value → no
 * component ever offers the toggle (safe default).
 */
@ConfigurationProperties(prefix = "portal.component")
class PortalComponentProperties {
    var solutionKeyPatterns: List<String> = emptyList()
}
