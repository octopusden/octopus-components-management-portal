package org.octopusden.octopus.components.portal.security

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant
import java.util.ArrayDeque

/**
 * Tracks the most-recent interactive logins for the admin "Recent logins" card on
 * the admin System tab. Fed by a [org.springframework.security.web.server.authentication.ServerAuthenticationSuccessHandler]
 * wired into `oauth2Login` (see `SecurityConfig`) — NOT by the servlet-only
 * `InteractiveAuthenticationSuccessEvent`, which this reactive WebFlux app does
 * not publish reliably.
 *
 * Deliberate limitations (documented so the UI footnote stays honest):
 * - **Per-pod.** Each replica only sees logins it served; with more than one
 *   replica the list is partial. True cross-pod session enumeration would need
 *   Spring Session + a shared store (e.g. Redis) — an explicit follow-up.
 * - **In-memory.** The buffer resets on restart; there is no persistence.
 * - **Privacy.** It surfaces usernames + login times to any authenticated caller
 *   of `/portal/metrics` (the endpoint is `authenticated()`-only; admin
 *   visibility is enforced in the SPA). Accepted by product.
 *
 * Thread-safe: all access to the [ArrayDeque] is guarded by the deque's monitor,
 * so concurrent login success handlers (and the controller's snapshot read) never
 * race.
 */
@Component
class RecentLoginsTracker(
    private val capacity: Int,
    private val clock: Clock,
) {
    // Explicit single-arg constructor for Spring: a Kotlin default-value param
    // (clock = systemUTC) is not reliably honoured by the container's constructor
    // resolution, so give it a concrete signature to autowire. Tests use the
    // two-arg primary constructor with a fixed Clock.
    @Autowired
    constructor(
        @Value("\${portal.recent-logins-capacity:10}") capacity: Int,
    ) : this(capacity, Clock.systemUTC())

    // Newest entries are pushed on the front; the back is evicted past capacity,
    // so iteration order is already newest-first.
    private val entries = ArrayDeque<RecentLogin>(capacity)

    /**
     * Record a login as the user's latest. One row per user: an existing entry for
     * the same username is removed and re-added at the front with the new time, so
     * the card reads as "most recent login per user" and a single sign-in that
     * fires the success handler more than once (the OIDC flow can) never shows as a
     * duplicate row.
     */
    fun record(username: String) {
        val entry = RecentLogin(username, clock.instant())
        synchronized(entries) {
            entries.removeIf { it.username == username }
            entries.addFirst(entry)
            while (entries.size > capacity) {
                entries.removeLast()
            }
        }
    }

    /** A point-in-time, newest-first copy, decoupled from later [record] calls. */
    fun snapshot(): List<RecentLogin> = synchronized(entries) { entries.toList() }
}

data class RecentLogin(
    val username: String,
    val loginAt: Instant,
)
