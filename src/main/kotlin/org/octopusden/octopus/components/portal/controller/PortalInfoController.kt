package org.octopusden.octopus.components.portal.controller

import com.fasterxml.jackson.annotation.JsonInclude
import org.octopusden.octopus.components.portal.configuration.PortalComponentProperties
import org.octopusden.octopus.components.portal.configuration.PortalLinksProperties
import org.octopusden.octopus.components.portal.onboarding.OnboardingVideoService
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.info.BuildProperties
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("portal")
class PortalInfoController(
    private val buildProperties: BuildProperties,
    private val linksProperties: PortalLinksProperties,
    private val componentProperties: PortalComponentProperties,
    private val onboardingVideoService: OnboardingVideoService,
    // Binds from PORTAL_ENVIRONMENT_LABEL via application.yaml. A single scalar,
    // so @Value instead of a dedicated @ConfigurationProperties class — same
    // pattern as registry-base-url in EmployeeServiceIntegrationHealthIndicator.
    @Value("\${portal.environment-label:}") private val environmentLabel: String,
) {
    @GetMapping("/info")
    fun info(): InfoResponse = InfoResponse(
        // BuildProperties.name/version became @Nullable in Spring Boot 4 — fall back
        // to empty strings so the SPA footer can still render without optional-chaining.
        // springBoot { buildInfo() } in build.gradle.kts always writes both keys, so the
        // fallback is defensive against missing build-info.properties in dev runs only.
        name = buildProperties.name.orEmpty(),
        version = buildProperties.version.orEmpty(),
        // blank (env var unset) collapses to null → key omitted, SPA renders no badge
        environmentLabel = environmentLabel.takeIf(String::isNotBlank),
    )

    @GetMapping("/links")
    fun links(): LinksResponse = LinksResponse(
        // empty-string yaml binding collapses to null so unset vars produce JSON null
        jiraBaseUrl = linksProperties.jiraBaseUrl?.takeIf(String::isNotBlank),
        gitBaseUrl = linksProperties.gitBaseUrl?.takeIf(String::isNotBlank),
        tcBaseUrl = linksProperties.tcBaseUrl?.takeIf(String::isNotBlank),
        dmsBaseUrl = linksProperties.dmsBaseUrl?.takeIf(String::isNotBlank),
    )

    // Component-editor config for the SPA. Currently only the solution-key
    // patterns that gate the dedicated Solution topic/tab. Authenticated (falls
    // through to anyExchange().authenticated() like /links) — only consumed on
    // the authenticated component-detail page. Always returns the key so the SPA
    // can treat an empty list as "no component offers the toggle".
    @GetMapping("/config")
    fun config(): ConfigResponse = ConfigResponse(
        solutionKeyPatterns = componentProperties.solutionKeyPatterns
            .map(String::trim)
            .filter(String::isNotBlank),
        // Onboarding-video availability lives on /config (authenticated) rather than
        // /portal/info (anonymous) so we neither leak the internal media repo's readiness
        // to unauthenticated callers nor perturb the strict {name, version} info contract.
        // Tri-/quad-state (not a bare boolean) so the SPA can tell "off forever" (disabled/
        // failed → don't poll) from "still cloning" (loading → poll until ready/failed).
        onboardingVideoStatus = onboardingVideoService.status().name.lowercase(),
        onboardingVideoHasPoster = onboardingVideoService.hasPoster(),
    )

    // NON_NULL so a prod portal (no PORTAL_ENVIRONMENT_LABEL) keeps the exact
    // pre-existing `{name, version}` body; only labelled environments gain the key.
    @JsonInclude(JsonInclude.Include.NON_NULL)
    data class InfoResponse(
        val name: String,
        val version: String,
        val environmentLabel: String?,
    )

    // Omit null fields so a portal with no PORTAL_LINKS_*_BASE_URL env vars
    // configured returns `{}` rather than four explicit null entries — the
    // body is then a clean signal that nothing is set, and frontend code can
    // treat the keys as absent (PortalLinks marks each as optional).
    @JsonInclude(JsonInclude.Include.NON_NULL)
    data class LinksResponse(
        val jiraBaseUrl: String?,
        val gitBaseUrl: String?,
        val tcBaseUrl: String?,
        val dmsBaseUrl: String?,
    )

    data class ConfigResponse(
        val solutionKeyPatterns: List<String>,
        // "disabled" | "loading" | "ready" | "failed"
        val onboardingVideoStatus: String,
        val onboardingVideoHasPoster: Boolean,
    )
}
