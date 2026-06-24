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
 * This trigger ALSO owns the immediate first sweep (it fires right after the context is
 * ready) instead of a separate ApplicationReadyEvent listener. That is what makes the
 * backoff work for a FAILED startup sweep — the exact QA migration-collision case: once
 * the first run completes and fails, the trigger recomputes the next run via
 * [ValidationService.nextDelayMillis] and retries on the short interval. A separate
 * startup listener would not feed the trigger context, so the first retry would stay a
 * full refresh-interval away.
 *
 * The sweep runs on a scheduler thread (never the Netty event loop), so the blocking
 * .block() inside refresh() is safe.
 */
// proxyBeanMethods=false: this class has no @Bean methods needing CGLIB enhancement,
// and Kotlin classes are final (CGLIB cannot subclass them) — without this the context
// fails to start with "Cannot subclass final class".
@Configuration(proxyBeanMethods = false)
class ValidationRefreshScheduler(
    private val validationService: ValidationService,
) : SchedulingConfigurer {
    override fun configureTasks(registrar: ScheduledTaskRegistrar) {
        registrar.addTriggerTask(
            { validationService.scheduledRefresh() },
            Trigger { context: TriggerContext ->
                val lastCompletion: Instant? = context.lastCompletion()
                if (lastCompletion == null) {
                    // First run: fire immediately (replaces a startup-event sweep).
                    context.clock.instant()
                } else {
                    // Subsequent runs anchor on the previous completion (fixedDelay
                    // semantics → no pile-up); the gap shrinks to the retry interval
                    // while the last sweep failed. See [ValidationService.nextDelayMillis].
                    lastCompletion.plusMillis(validationService.nextDelayMillis())
                }
            },
        )
    }
}
