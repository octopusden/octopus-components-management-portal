package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.mock.http.server.reactive.MockServerHttpRequest
import org.springframework.mock.web.server.MockServerWebExchange
import org.springframework.web.server.WebFilterChain
import reactor.core.publisher.Mono
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Unit-level guard for [SpaFallbackFilter]. The filter writes index.html for
 * unknown SPA paths and passes through everything else. Any path the portal
 * exposes as a real backend endpoint must therefore be on the pass-through
 * list — otherwise the filter writes index.html before the dispatcher even
 * sees the controller, and the test for that controller fails with a
 * confusing "expected JSON, got HTML" message far away from the actual fix.
 *
 * /portal/info is a backend endpoint (anonymous build-info for the footer);
 * the filter must not capture it. /admin is the inverse — a frontend SPA
 * route — and must keep getting index.html so deep-linking continues to work.
 */
class SpaFallbackFilterTest {
    private val filter = SpaFallbackFilter()

    @Test
    fun `GET portal info passes through to next filter (not intercepted)`() {
        val (passedThrough, exchange) = runFilter("/portal/info")

        assertTrue(
            passedThrough.get(),
            "SpaFallbackFilter must NOT intercept /portal/info — the request " +
                "needs to reach PortalInfoController. Add path.startsWith(\"/portal/\") " +
                "to the pass-through list in SpaFallbackFilter.",
        )
        assertNotEquals(
            MediaType.TEXT_HTML,
            exchange.response.headers.contentType,
            "Response content-type should not be set to text/html when the filter passes through.",
        )
    }

    @Test
    fun `GET admin still serves index html (regression — SPA route)`() {
        val (passedThrough, exchange) = runFilter("/admin")

        assertEquals(false, passedThrough.get(), "/admin is a SPA route — filter must serve index.html, not pass through.")
        assertEquals(
            MediaType.TEXT_HTML,
            exchange.response.headers.contentType,
            "Filter must respond with text/html for SPA routes.",
        )
    }

    private fun runFilter(path: String): Pair<AtomicBoolean, MockServerWebExchange> {
        val request = MockServerHttpRequest.get(path).build()
        val exchange = MockServerWebExchange.from(request)
        val chainCalled = AtomicBoolean(false)
        val chain = WebFilterChain {
            chainCalled.set(true)
            Mono.empty()
        }
        filter.filter(exchange, chain).block()
        return chainCalled to exchange
    }
}
