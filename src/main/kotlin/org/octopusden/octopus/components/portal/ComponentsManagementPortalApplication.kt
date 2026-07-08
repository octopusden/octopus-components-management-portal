package org.octopusden.octopus.components.portal

import org.octopusden.octopus.components.portal.configuration.OnboardingVideoProperties
import org.octopusden.octopus.components.portal.configuration.PortalComponentProperties
import org.octopusden.octopus.components.portal.configuration.PortalLinksProperties
import org.octopusden.octopus.components.portal.serviceevent.ServiceEventReportingProperties
import org.octopusden.octopus.components.portal.validation.ValidationProperties
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(
    PortalLinksProperties::class,
    PortalComponentProperties::class,
    OnboardingVideoProperties::class,
    ValidationProperties::class,
    ServiceEventReportingProperties::class,
)
open class ComponentsManagementPortalApplication

fun main(args: Array<String>) {
    runApplication<ComponentsManagementPortalApplication>(*args)
}
