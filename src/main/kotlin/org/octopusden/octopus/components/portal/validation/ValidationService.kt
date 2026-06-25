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
// Orchestrator with many small single-purpose helpers (sweep / perComponent / refresh /
// migration-skip / failure classification + logging). Splitting it would scatter one
// cohesive sweep lifecycle across classes for no readability gain.
@Suppress("TooManyFunctions")
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
            if (skipSweepWhileMigrating()) {
                return
            }
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
            // Three distinct outcomes, because they need DIFFERENT operator action and a
            // timeout must NOT masquerade as "unreachable" (the URL/connectivity is fine,
            // the sweep is just slow/over-loaded):
            //   • timeout    → tuning problem (budget too low / concurrency too high / CRS
            //                  under load). The sweep's .block(sweepTimeoutSeconds) surfaces
            //                  this as IllegalStateException("Timeout on blocking read…")
            //                  whose cause is a TimeoutException.
            //   • unreachable→ genuine connectivity (refused / unresolved host / TLS): name
            //                  the env var to fix.
            //   • other      → bare class name.
            // The actionable detail (configured base URL) stays in the SERVER log; the
            // client-facing refreshError is the sanitized, host-free category.
            when (classifyFailure(e)) {
                FailureKind.TIMEOUT -> {
                    log.warn(
                        "Validation sweep did not finish within its {}s budget (components-registry at {}) — " +
                            "downstream slow or under load; consider raising " +
                            "portal.validation.sweep-timeout-seconds, lowering portal.validation.concurrency, " +
                            "or adding components-registry capacity",
                        properties.sweepTimeoutSeconds,
                        properties.registryBaseUrl,
                        e,
                    )
                    retainStale(SWEEP_TIMED_OUT)
                }

                FailureKind.UNREACHABLE -> {
                    log.warn(
                        "Validation sweep failed reaching components-registry at {} — set " +
                            "portal.validation.registry-base-url (env COMPONENTS_REGISTRY_SERVICE_URL) " +
                            "to a reachable https URL",
                        properties.registryBaseUrl,
                        e,
                    )
                    retainStale("$REGISTRY_LABEL unreachable: ${shortReason(e)}")
                }

                FailureKind.OTHER -> {
                    log.warn("Validation sweep failed, retaining previous report: {}", e.toString())
                    retainStale(shortReason(e))
                }
            }
        } finally {
            refreshing.set(false)
        }
    }

    /**
     * Skip the sweep while CRS is migrating, returning true when it did.
     *
     * Mid Git→DB migration the legacy resolver serves not-yet-migrated archived flags,
     * which would make the sweep cache spurious problems on archived components.
     * migrationInProgress() degrades to false on any probe error, so an undeterminable
     * signal proceeds to a normal sweep rather than wedging.
     *
     * A skip is NOT a failure: retain the previous components, bump lastAttemptAt, and
     * CLEAR refreshError so a banner/health-DOWN left by an earlier failed attempt does
     * not persist (staleness still shows via generatedAt vs lastAttemptAt).
     */
    private fun skipSweepWhileMigrating(): Boolean {
        val migrating =
            registryClient.migrationInProgress().block(Duration.ofSeconds(properties.requestTimeoutSeconds))
        if (migrating != true) {
            return false
        }
        log.info("CRS migration in progress — skipping validation sweep, retaining previous report")
        report = report.copy(lastAttemptAt = Instant.now(), refreshError = null)
        return true
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
        when (classifyFailure(e)) {
            // Slow downstream, not unreachable: no stack (one per slow component would flood
            // the log during a sweep) — just the actionable tuning hint.
            FailureKind.TIMEOUT ->
                log.warn(
                    "Validation check for component '{}' timed out (request-timeout {}s) — " +
                        "release-management / components-registry slow or under load",
                    component,
                    properties.requestTimeoutSeconds,
                )

            FailureKind.UNREACHABLE ->
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

            FailureKind.OTHER ->
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
     * Categorize a sweep/refresh failure by walking [e]'s cause chain once (reactor
     * wraps the real cause; first matching link wins):
     *  • [FailureKind.TIMEOUT] — a per-request timeout (`TimeoutException`) or the
     *    whole-sweep budget overrun, which `Mono.block(Duration)` surfaces as an
     *    `IllegalStateException("Timeout on blocking read for N NANOSECONDS")`. The
     *    downstream is reachable but slow/over-loaded — NOT unreachable.
     *  • [FailureKind.UNREACHABLE] — a genuine connectivity failure (transport error,
     *    refused/unresolved host, TLS): a misconfigured/unreachable downstream URL.
     *  • [FailureKind.OTHER] — anything else (e.g. a 5xx mapped to an exception).
     */
    private fun classifyFailure(e: Throwable): FailureKind {
        var cur: Throwable? = e
        val seen = HashSet<Throwable>()
        var kind = FailureKind.OTHER
        while (cur != null && seen.add(cur)) {
            val c = cur
            val timedOut =
                c is TimeoutException ||
                    (c is IllegalStateException && c.message?.contains("Timeout on blocking read") == true)
            kind =
                when {
                    timedOut -> FailureKind.TIMEOUT
                    UNREACHABLE_TYPES.any { it.isInstance(c) } -> FailureKind.UNREACHABLE
                    else -> FailureKind.OTHER
                }
            if (kind != FailureKind.OTHER) break
            cur = c.cause
        }
        return kind
    }

    private enum class FailureKind { TIMEOUT, UNREACHABLE, OTHER }

    private companion object {
        private const val REGISTRY_LABEL = "components-registry"

        /** Host-free, client-facing reason for a whole-sweep timeout (distinct from "unreachable"). */
        private const val SWEEP_TIMED_OUT = "validation sweep timed out"

        /** Cause-chain types that mean a genuinely unreachable downstream (NOT a timeout). */
        private val UNREACHABLE_TYPES =
            listOf(
                WebClientRequestException::class,
                ConnectException::class,
                UnknownHostException::class,
                SSLException::class,
            )
    }
}
