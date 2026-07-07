package org.octopusden.octopus.components.portal.controller

import org.octopusden.octopus.components.portal.onboarding.OnboardingVideoService
import org.springframework.core.io.Resource
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

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
}
