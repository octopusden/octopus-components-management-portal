package org.octopusden.octopus.components.portal

import org.octopusden.octopus.components.portal.configuration.PortalLinksProperties
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.runApplication

@SpringBootApplication
@EnableConfigurationProperties(PortalLinksProperties::class)
open class ComponentsManagementPortalApplication

fun main(args: Array<String>) {
    runApplication<ComponentsManagementPortalApplication>(*args)
}
