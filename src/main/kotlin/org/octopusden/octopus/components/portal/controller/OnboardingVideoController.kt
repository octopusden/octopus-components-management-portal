package org.octopusden.octopus.components.portal.controller

import org.octopusden.octopus.components.portal.onboarding.OnboardingVideoService
import org.octopusden.octopus.components.portal.serviceevent.ServiceEventClient
import org.springframework.core.io.Resource
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.ReactiveSecurityContextHolder
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import reactor.core.publisher.Mono

/**
 * Serves the onboarding video (and optional poster) from memory, same-origin, so the SPA
 * `<video>` element plays it without CORS or credentials. Authenticated: neither path is on
 * the SecurityConfig permitAll list, so both fall through to `anyExchange().authenticated()`.
 *
 * Returning a [Resource] lets Spring's `ResourceHttpMessageWriter` honour the `Range`
 * request header with `206 Partial Content`, so seeking/scrubbing works out of the box.
 * Anything but a loaded (READY) video → 404.
 */
@RestController
@RequestMapping("portal/media")
class OnboardingVideoController(
    private val onboardingVideoService: OnboardingVideoService,
    private val serviceEventClient: ServiceEventClient,
) {
    @GetMapping("/onboarding-video")
    fun video(): ResponseEntity<Resource> {
        val resource = onboardingVideoService.videoResource()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(onboardingVideoService.videoContentType()))
            .body(resource)
    }

    @GetMapping("/onboarding-video/poster")
    fun poster(): ResponseEntity<Resource> {
        val resource = onboardingVideoService.posterResource()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val contentType = onboardingVideoService.posterContentType()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(contentType))
            .body(resource)
    }

    /**
     * Records that the current user opened the intro video, as an ONBOARDING_VIDEO_VIEW
     * event in the shared CRS service-event journal (fire-and-forget via ServiceEventClient,
     * inert unless the service-events token is configured). The username is the authenticated
     * principal name (`preferred_username`). Always 202 — usage telemetry must never fail the
     * user-facing action, and a blank/anonymous principal is simply skipped.
     */
    @PostMapping("/onboarding-video/view")
    fun recordView(): Mono<ResponseEntity<Void>> =
        ReactiveSecurityContextHolder.getContext()
            .mapNotNull { it.authentication?.name }
            .doOnNext { username -> if (username.isNotBlank()) serviceEventClient.reportVideoView(username) }
            .then(Mono.fromCallable { ResponseEntity.accepted().build<Void>() })
}
