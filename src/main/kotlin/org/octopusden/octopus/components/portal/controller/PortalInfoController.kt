package org.octopusden.octopus.components.portal.controller

import com.fasterxml.jackson.annotation.JsonInclude
import org.octopusden.octopus.components.portal.configuration.PortalLinksProperties
import org.springframework.boot.info.BuildProperties
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("portal")
class PortalInfoController(
    private val buildProperties: BuildProperties,
    private val linksProperties: PortalLinksProperties,
) {
    @GetMapping("/info")
    fun info(): InfoResponse = InfoResponse(
        // BuildProperties.name/version became @Nullable in Spring Boot 4 — fall back
        // to empty strings so the SPA footer can still render without optional-chaining.
        // springBoot { buildInfo() } in build.gradle.kts always writes both keys, so the
        // fallback is defensive against missing build-info.properties in dev runs only.
        name = buildProperties.name ?: "",
        version = buildProperties.version ?: "",
    )

    @GetMapping("/links")
    fun links(): LinksResponse = LinksResponse(
        // empty-string yaml binding collapses to null so unset vars produce JSON null
        jiraBaseUrl = linksProperties.jiraBaseUrl?.takeIf(String::isNotBlank),
        gitBaseUrl = linksProperties.gitBaseUrl?.takeIf(String::isNotBlank),
        tcBaseUrl = linksProperties.tcBaseUrl?.takeIf(String::isNotBlank),
        dmsBaseUrl = linksProperties.dmsBaseUrl?.takeIf(String::isNotBlank),
    )

    data class InfoResponse(
        val name: String,
        val version: String,
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
}
