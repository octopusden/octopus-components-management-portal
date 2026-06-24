package org.octopusden.octopus.components.portal.validation

import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.Trigger
import org.springframework.scheduling.TriggerContext
import org.springframework.scheduling.annotation.SchedulingConfigurer
import org.springframework.scheduling.config.ScheduledTaskRegistrar
import java.time.Instant

/**
 * Registers the background validation sweep with a DYNAMIC trigger instead of a static
 * `@Scheduled(fixedDelay=…)`. After each run the trigger asks
 * [ValidationService.nextDelayMillis] for the next gap, which is the short
 * `retry-interval-ms` while the last sweep FAILED and the normal `refresh-interval-ms`
 * otherwise. This gives failure-backoff: a transient downstream outage (e.g. a CRS
 * redeploy running its multi-minute DSL→DB migration) self-heals within minutes rather
 * than leaving a stale report until the next full interval.
 *
 * The immediate first sweep is still owned by [ValidationService.refreshOnStartup]
 * (ApplicationReadyEvent); this trigger schedules every run AFTER that.
 */
@Configuration
class ValidationRefreshScheduler(
    private val validationService: ValidationService,
) : SchedulingConfigurer {
    override fun configureTasks(registrar: ScheduledTaskRegistrar) {
        registrar.addTriggerTask(
            { validationService.scheduledRefresh() },
            Trigger { context: TriggerContext ->
                // Base the next run on the previous completion (no pile-up: the gap is
                // measured from when the last sweep finished). Before the first scheduled
                // run there is no completion yet, so anchor on "now".
                val base: Instant = context.lastCompletion() ?: context.clock.instant()
                base.plusMillis(validationService.nextDelayMillis())
            },
        )
    }
}
