package org.octopusden.octopus.components.portal.validation

import org.octopusden.octopus.components.portal.validation.client.RegistryClient
import org.octopusden.octopus.components.portal.validation.client.ReleaseManagementClient
import org.octopusden.octopus.components.portal.validation.model.ComponentValidation
import org.octopusden.octopus.components.portal.validation.model.ValidationProblem
import org.octopusden.octopus.components.portal.validation.model.ValidationReport
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClientRequestException
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
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
    // SYS-061: nullable (NOT defaulted) — a Kotlin default value would generate a second
    // synthetic constructor and break Spring's constructor autowiring ("no default constructor").
    // Spring injects the real bean for this nullable param when present; tests pass null via the
    // `service(...)` helper's own default.
    private val serviceEventClient: org.octopusden.octopus.components.portal.serviceevent.ServiceEventClient?,
) {
    private val log = LoggerFactory.getLogger(ValidationService::class.java)

    @Volatile
    private var report: ValidationReport =
        ValidationReport(generatedAt = null, lastAttemptAt = null, refreshError = null, components = emptyList())

    /**
     * SYS-061 coalescing: emit a FAILED service-event only on a success→fail transition, so a
     * multi-hour outage on the short retry cadence doesn't spam near-identical FAILED rows.
     * Successful sweeps emit COMPLETED every run (that IS the job-run operators want to see).
     */
    @Volatile
    private var lastSweepFailed = false

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

    /**
     * Scheduled background refresh. Invoked by [ValidationRefreshScheduler]'s dynamic
     * trigger (NOT a static fixedDelay) so the gap to the next run can shrink to
     * [ValidationProperties.retryIntervalMs] after a failure — see [nextDelayMillis].
     * Runs on a Spring scheduler thread; single-flight guarded in [refresh].
     */
    fun scheduledRefresh() {
        refresh()
    }

    /**
     * Delay (ms) the scheduler should wait before the NEXT sweep, based on the outcome
     * of the most recent one: the short [ValidationProperties.retryIntervalMs] while the
     * last refresh FAILED (refreshError set — the report is stale), else the normal
     * [ValidationProperties.refreshIntervalMs].
     *
     * [ValidationRefreshScheduler] owns the immediate first sweep and recomputes this
     * after every run, so a FAILED startup sweep (the QA migration-collision case) is
     * retried after [ValidationProperties.retryIntervalMs] rather than the full interval.
     */
    fun nextDelayMillis(): Long {
        // Read the report ONCE: it is an immutable snapshot carrying both the failure and the
        // skip state, so this can never observe an inconsistent in-between (refreshError and
        // the skip flag are now updated together in a single report assignment).
        val snapshot = report
        // Short retry cadence while the last refresh FAILED (refreshError set) OR was a
        // migration SKIP — the latter is the cutover case: a skip clears refreshError, so
        // without the skip flag the cadence would fall back to the long interval and leave the
        // report empty for up to refreshIntervalMs (4h) after CRS finishes migrating. Otherwise
        // (clean state or a successful sweep) use the long interval. (The scheduler owns the
        // immediate first sweep, so the pre-first-sweep clean state maps to the normal interval.)
        return if (snapshot.refreshError != null || snapshot.lastRunWasSkip) {
            properties.retryIntervalMs
        } else {
            properties.refreshIntervalMs
        }
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
        val startedAt = Instant.now()
        try {
            if (skipSweepWhileMigrating()) {
                return
            }
            val fresh = sweep().block(Duration.ofSeconds(properties.sweepTimeoutSeconds))
            if (fresh != null) {
                report = fresh
                log.info("Validation sweep completed: {} component(s)", fresh.components.size)
                emitSweepCompleted(startedAt, fresh)
            } else {
                retainStale("sweep produced no report")
                emitSweepFailedOnce(startedAt)
            }
        } catch (e: Exception) {
            handleSweepFailure(e)
            emitSweepFailedOnce(startedAt)
        } finally {
            refreshing.set(false)
        }
    }

    /**
     * Classify a sweep failure and retainStale with the right operator hint.
     *
     * Broad catch (in [refresh]) is intentional: .block() throws reactor's ReactiveException
     * wrapper or an IllegalStateException on the sweep-budget timeout — all must retain the
     * previous report rather than crash the scheduler thread. Each kind needs a DIFFERENT
     * operator hint, and a timeout must NOT masquerade as "unreachable" (connectivity is fine;
     * the sweep is just slow). The host-bearing detail stays in the SERVER log; the
     * client-facing refreshError is the sanitized category.
     */
    private fun handleSweepFailure(e: Exception) {
        when (classifyFailure(e)) {
            FailureKind.TIMEOUT -> {
                // Distinguish the whole-sweep .block(budget) overrun from a propagated
                // per-request timeout (in practice the un-isolated component-list fetch),
                // because the operator hint differs.
                val budgetExceeded =
                    generateSequence(e as Throwable?) { it.cause }
                        .take(MAX_CAUSE_CHAIN)
                        .any { it is IllegalStateException && it.message?.contains(BLOCKING_READ_TIMEOUT) == true }
                val detail =
                    if (budgetExceeded) {
                        "did not finish within its ${properties.sweepTimeoutSeconds}s budget; consider raising " +
                            "portal.validation.sweep-timeout-seconds or lowering portal.validation.concurrency"
                    } else {
                        "aborted: a request exceeded the ${properties.requestTimeoutSeconds}s " +
                            "per-request timeout (most likely the component-list fetch); consider " +
                            "raising portal.validation.request-timeout-seconds"
                    }
                log.warn(
                    "Validation sweep {} (components-registry at {}) — downstream slow or under load, " +
                        "or add components-registry capacity",
                    detail,
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
    }

    /** SYS-061: report a successful sweep (every run). finishedAt = report generatedAt. */
    private fun emitSweepCompleted(
        startedAt: Instant,
        fresh: ValidationReport,
    ) {
        lastSweepFailed = false
        val problems = fresh.components.sumOf { it.problems.size }
        serviceEventClient?.reportValidationSweep(
            status = "COMPLETED",
            startedAt = startedAt,
            finishedAt = fresh.generatedAt ?: Instant.now(),
            summary = "Validation sweep completed: ${fresh.components.size} component(s), $problems problem(s)",
            detail = mapOf("components" to fresh.components.size, "problems" to problems),
        )
    }

    /** SYS-061: report a FAILED sweep only on the success→fail transition (coalesce). */
    private fun emitSweepFailedOnce(startedAt: Instant) {
        if (lastSweepFailed) return
        lastSweepFailed = true
        serviceEventClient?.reportValidationSweep(
            status = "FAILED",
            startedAt = startedAt,
            finishedAt = report.lastAttemptAt ?: Instant.now(),
            summary = "Validation sweep failed",
            detail = mapOf("error" to (report.refreshError ?: "unknown")),
        )
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
        // One atomic assignment: clear the error AND mark the skip together.
        report = report.copy(lastAttemptAt = Instant.now(), refreshError = null, lastRunWasSkip = true)
        return true
    }

    private fun retainStale(reason: String) {
        // A real (failed) attempt — clear the skip flag so the cadence keys off refreshError.
        report = report.copy(lastAttemptAt = Instant.now(), refreshError = reason, lastRunWasSkip = false)
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
                    (c is IllegalStateException && c.message?.contains(BLOCKING_READ_TIMEOUT) == true)
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

        /**
         * Marker in the message of the `IllegalStateException` that `Mono.block(Duration)`
         * throws when the whole-sweep budget is exceeded. Its ABSENCE in a TIMEOUT chain
         * means the timeout instead came from a per-request `.timeout(requestTimeout)` that
         * propagated (in practice the un-isolated component-list fetch) — a different cause
         * needing a different operator hint, hence the two server-log messages.
         */
        private const val BLOCKING_READ_TIMEOUT = "Timeout on blocking read"

        /** Cap the inline cause-chain walk so a (pathological) cyclic chain can't loop forever. */
        private const val MAX_CAUSE_CHAIN = 20

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
