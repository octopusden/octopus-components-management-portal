package org.octopusden.octopus.components.portal.controller

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
        name = buildProperties.name,
        version = buildProperties.version,
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

    data class LinksResponse(
        val jiraBaseUrl: String?,
        val gitBaseUrl: String?,
        val tcBaseUrl: String?,
        val dmsBaseUrl: String?,
    )
}
