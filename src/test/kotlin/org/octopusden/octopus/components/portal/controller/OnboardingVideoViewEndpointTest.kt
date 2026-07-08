package org.octopusden.octopus.components.portal.controller

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.octopusden.octopus.components.portal.configuration.OnboardingVideoProperties
import org.octopusden.octopus.components.portal.onboarding.OnboardingVideoService
import org.octopusden.octopus.components.portal.serviceevent.ServiceEventClient
import org.octopusden.octopus.components.portal.serviceevent.ServiceEventReportingProperties
import org.octopusden.octopus.components.portal.validation.ValidationProperties
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.ReactiveSecurityContextHolder

/**
 * Pure reactive unit test of the `POST /portal/media/onboarding-video/view` handler: it
 * resolves the authenticated principal's name and reports it as a video view, returning 202.
 * No Spring/MVC/CSRF scaffolding — the wire body itself is covered by ServiceEventClientTest.
 */
class OnboardingVideoViewEndpointTest {
    private val captured = mutableListOf<String>()

    private val capturingClient =
        object : ServiceEventClient(ValidationProperties(), ServiceEventReportingProperties()) {
            override fun reportVideoView(username: String) {
                captured += username
            }
        }

    private val controller =
        OnboardingVideoController(
            OnboardingVideoService(OnboardingVideoProperties()), // disabled (blank root) — unused here
            capturingClient,
        )

    @Test
    fun `records a view for the authenticated user and returns 202`() {
        val auth = UsernamePasswordAuthenticationToken("alice", "n/a", emptyList())
        val response =
            controller
                .recordView()
                .contextWrite(ReactiveSecurityContextHolder.withAuthentication(auth))
                .block()

        assertEquals(202, response?.statusCode?.value())
        assertEquals(listOf("alice"), captured)
    }

    @Test
    fun `still returns 202 and records nothing when there is no principal`() {
        val response = controller.recordView().block()

        assertEquals(202, response?.statusCode?.value())
        assertEquals(emptyList<String>(), captured)
    }
}
