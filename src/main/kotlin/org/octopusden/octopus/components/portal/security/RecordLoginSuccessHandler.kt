package org.octopusden.octopus.components.portal.security

import org.springframework.security.core.Authentication
import org.springframework.security.web.server.WebFilterExchange
import org.springframework.security.web.server.authentication.ServerAuthenticationSuccessHandler
import reactor.core.publisher.Mono

/**
 * Reactive login-success hook that records the authenticated username into
 * [RecentLoginsTracker]. Wired into `oauth2Login` in `SecurityConfig` ahead of the
 * default redirect handler (via DelegatingServerAuthenticationSuccessHandler).
 *
 * The record runs INSIDE the returned `Mono<Void>` (via [Mono.fromRunnable]) so it
 * actually executes when the chain is subscribed — a fire-and-forget side-effect
 * outside the chain may never run. [Authentication.getName] is `preferred_username`
 * (the configured OIDC user-name-attribute).
 */
class RecordLoginSuccessHandler(
    private val tracker: RecentLoginsTracker,
) : ServerAuthenticationSuccessHandler {
    override fun onAuthenticationSuccess(
        webFilterExchange: WebFilterExchange,
        authentication: Authentication,
    ): Mono<Void> = Mono.fromRunnable { tracker.record(authentication.name) }
}
