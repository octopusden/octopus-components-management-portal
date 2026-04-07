package org.octopusden.octopus.components.portal

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
open class ComponentsManagementPortalApplication

fun main(args: Array<String>) {
    runApplication<ComponentsManagementPortalApplication>(*args)
}
