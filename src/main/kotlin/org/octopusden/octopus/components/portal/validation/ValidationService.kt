package org.octopusden.octopus.components.portal.validation

import org.octopusden.octopus.components.portal.validation.client.RegistryClient
import org.octopusden.octopus.components.portal.validation.client.ReleaseManagementClient
import org.octopusden.octopus.components.portal.validation.model.ComponentValidation
import org.octopusden.octopus.components.portal.validation.model.ValidationProblem
import org.octopusden.octopus.components.portal.validation.model.ValidationReport
import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClientRequestException
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import reactor.core.scheduler.Schedulers
import java.net.ConnectException
import java.net.UnknownHostException
import java.time.Duration
import java.time.Instant
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.SSLException

/**
 * Orchestrates the validation sweep, caches the report in memory, and refreshes
 * it on a schedule. Each Portal replica computes its own cache — acceptable for
 * a read-only report.
 *
 * Failure semantics:
 * - A per-component downstream error is isolated but SURFACED as
 *   checkFailed=true (never swallowed to a clean/empty result).
 * - A whole-sweep failure (e.g. the component-list fetch fails) retains the
 *   previous good `components`, sets `refreshError`, and bumps `lastAttemptAt`,
 *   leaving `generatedAt` at the last success.
 */
@Service
class ValidationService(
    private val registryClient: RegistryClient,
    private val releaseManagementClient: ReleaseManagementClient,
    private val validators: List<ComponentValidator>,
    private val properties: ValidationProperties,
) {
    private val log = LoggerFactory.getLogger(ValidationService::class.java)

    @Volatile
    private var report: ValidationReport =
        ValidationReport(generatedAt = null, lastAttemptAt = null, refreshError = null, components = emptyList())

    /** Single-flight guard: an overlapping refresh is a no-op rather than a double sweep. */
    private val refreshing = AtomicBoolean(false)

    /** The current cached report. */
    fun currentReport(): ValidationReport = report

    /**
     * Live (cache-bypassing) per-component check, bounded by the live timeout budget.
     * A timeout (or any error escaping perComponent) surfaces as checkFailed=true so
     * the endpoint returns 200 + an honest failed-check body rather than a 500.
     */
    fun validateLive(component: String): Mono<ComponentValidation> =
        perComponent(component)
            .timeout(Duration.ofSeconds(properties.liveTimeoutSeconds))
            .onErrorResume { e ->
                log.warn("Live validation check failed for component '{}': {}", component, e.toString())
                Mono.just(
                    ComponentValidation(
                        component = component,
                        problems = emptyList(),
                        checkFailed = true,
                        checkError = shortReason(e),
                    ),
                )
            }

    /**
     * Full sweep: all CRS component ids → per-component validation, bounded by
     * `concurrency`. Success yields a fresh report (new generatedAt+lastAttemptAt,
     * refreshError=null). A component-list fetch failure propagates so the caller
     * (refresh) can retain the previous good report.
     */
    fun sweep(): Mono<ValidationReport> =
        registryClient.componentIds()
            .flatMapMany { ids -> Flux.fromIterable(ids) }
            .flatMap({ id -> perComponent(id) }, properties.concurrency)
            .collectList()
            .map { components ->
                val now = Instant.now()
                ValidationReport(
                    generatedAt = now,
                    lastAttemptAt = now,
                    refreshError = null,
                    // Sort by component name so the API output is stable across runs
                    // (flatMap with concurrency collects in completion order).
                    components = components.sortedBy { it.component },
                )
            }

    /**
     * Validate one component: fetch its released versions, run all validators.
     * Any downstream error is isolated and surfaced as checkFailed=true — one bad
     * component never aborts the sweep and never masquerades as clean.
     */
    fun perComponent(component: String): Mono<ComponentValidation> =
        releaseManagementClient.releasedVersions(component)
            .flatMap { releasedVersions ->
                Flux.fromIterable(validators)
                    .flatMap { validator -> validator.validate(component, releasedVersions) }
                    .collectList()
                    .map { lists -> lists.flatten() }
            }
            .map { problems: List<ValidationProblem> -> ComponentValidation(component, problems) }
            .onErrorResume { e ->
                logPerComponentFailure(component, e)
                Mono.just(
                    ComponentValidation(
                        component = component,
                        problems = emptyList(),
                        checkFailed = true,
                        checkError = shortReason(e),
                    ),
                )
            }

    /** Scheduled background refresh (fixedDelay → no pile-up). Runs on a Spring scheduler thread. */
    @Scheduled(fixedDelayString = "\${portal.validation.refresh-interval-ms}")
    fun scheduledRefresh() {
        refresh()
    }

    /** One-shot refresh at startup, off the boot thread so it never blocks readiness. */
    @EventListener(ApplicationReadyEvent::class)
    fun refreshOnStartup() {
        Mono.fromRunnable<Unit> { refresh() }
            .subscribeOn(Schedulers.boundedElastic())
            .subscribe()
    }

    /**
     * Runs a sweep under the single-flight guard, blocking up to the sweep
     * timeout (safe: only ever called from a Spring scheduler / boundedElastic
     * thread, never the Netty event loop). On success → fresh report. On
     * failure/timeout → retain previous `components`, set refreshError + bump
     * lastAttemptAt (stale-but-honest).
     */
    @Suppress("TooGenericExceptionCaught")
    fun refresh() {
        if (!refreshing.compareAndSet(false, true)) {
            log.debug("Validation refresh already running, skipping this trigger")
            return
        }
        try {
            val fresh = sweep().block(Duration.ofSeconds(properties.sweepTimeoutSeconds))
            if (fresh != null) {
                report = fresh
                log.info("Validation sweep completed: {} component(s)", fresh.components.size)
            } else {
                retainStale("sweep produced no report")
            }
        } catch (e: Exception) {
            // Broad catch is intentional: .block() can throw reactor's ReactiveException
            // wrapper or an IllegalStateException on sweep-timeout — all must retain the
            // previous report rather than crash the scheduler thread.
            //
            // The sweep starts with registry.componentIds(), so a whole-sweep failure is
            // almost always the components-registry being unreachable/misconfigured. Emit
            // an ACTIONABLE server-side warning that includes the configured base URL and
            // the env var to set — this detail stays in the SERVER log only; the
            // client-facing refreshError is the sanitized, host-free category below.
            val connectionClass = isConnectionClass(e)
            if (connectionClass) {
                log.warn(
                    "Validation sweep failed reaching components-registry at {} — set " +
                        "portal.validation.registry-base-url (env COMPONENTS_REGISTRY_SERVICE_URL) " +
                        "to a reachable https URL",
                    properties.registryBaseUrl,
                    e,
                )
            } else {
                log.warn("Validation sweep failed, retaining previous report: {}", e.toString())
            }
            // Categorized, still host-free client-facing reason: name the downstream +
            // failure kind for connection-class errors, else the bare class name.
            val reason = if (connectionClass) "$REGISTRY_LABEL unreachable: ${shortReason(e)}" else shortReason(e)
            retainStale(reason)
        } finally {
            refreshing.set(false)
        }
    }

    private fun retainStale(reason: String) {
        report = report.copy(lastAttemptAt = Instant.now(), refreshError = reason)
    }

    /**
     * Per-component failure log. The per-component check calls release-management
     * first, then components-registry (via the validator), so a connection-class
     * failure here is most often an unreachable/misconfigured RM or CRS. Emit an
     * ACTIONABLE server-side warning naming both base URLs and their env vars so
     * the operator can tell which downstream to fix. URLs stay in the SERVER log
     * only — the client-facing `checkError` is the sanitized [shortReason].
     */
    private fun logPerComponentFailure(component: String, e: Throwable) {
        if (isConnectionClass(e)) {
            log.warn(
                "Validation check failed for component '{}' reaching a downstream — verify " +
                    "release-management (portal.validation.release-management-base-url / env " +
                    "RELEASE_MANAGEMENT_SERVICE_URL) at {} and components-registry " +
                    "(portal.validation.registry-base-url / env COMPONENTS_REGISTRY_SERVICE_URL) at {} " +
                    "are configured and reachable over https",
                component,
                properties.releaseManagementBaseUrl,
                properties.registryBaseUrl,
                e,
            )
        } else {
            log.warn("Validation check failed for component '{}': {}", component, e.toString())
        }
    }

    /**
     * Client-facing failure reason. Deliberately sanitized to the exception's
     * simple class name only — the raw `e.message` can carry downstream URLs,
     * hostnames/ports or other internal detail and is returned to API callers via
     * `checkError`/`refreshError`. The full detail (incl. `e.message`) is logged
     * server-side at the call sites; only this short, safe form is exposed.
     */
    private fun shortReason(e: Throwable): String = e.javaClass.simpleName

    /**
     * True when [e] (or anything in its cause chain) is a connection-class
     * failure: a WebClient transport error, a refused/unresolvable connection, a
     * TLS handshake failure, or a timeout. These are the cases that point at a
     * misconfigured/unreachable downstream URL rather than a bad response.
     * Reactor wraps the real cause, so we walk the chain.
     */
    private fun isConnectionClass(e: Throwable): Boolean {
        var cur: Throwable? = e
        val seen = HashSet<Throwable>()
        while (cur != null && seen.add(cur)) {
            when (cur) {
                is WebClientRequestException,
                is ConnectException,
                is UnknownHostException,
                is SSLException,
                is TimeoutException,
                -> return true
            }
            cur = cur.cause
        }
        return false
    }

    private companion object {
        private const val REGISTRY_LABEL = "components-registry"
    }
}
