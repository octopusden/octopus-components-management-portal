package org.octopusden.octopus.components.portal.serviceevent

import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.boot.info.BuildProperties
import org.springframework.context.ApplicationListener
import org.springframework.stereotype.Component

/**
 * SYS-061: report a portal (re)deploy marker into the shared CRS service-event journal on
 * startup, so the Admin "Events" tab shows portal redeploys alongside CRS ones. Best-effort
 * (the client is fire-and-forget and inert unless configured); build version is nullable on
 * Spring Boot 4, so it degrades to empty (matches PortalInfoController).
 */
@Component
class PortalStartupListener(
    private val serviceEventClient: ServiceEventClient,
    private val buildProperties: ObjectProvider<BuildProperties>,
) : ApplicationListener<ApplicationReadyEvent> {
    override fun onApplicationEvent(event: ApplicationReadyEvent) {
        serviceEventClient.reportStartup(buildProperties.ifAvailable?.version)
    }
}
