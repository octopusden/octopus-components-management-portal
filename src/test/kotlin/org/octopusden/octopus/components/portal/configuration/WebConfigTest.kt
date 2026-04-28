package org.octopusden.octopus.components.portal.configuration

import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.mock.http.server.reactive.MockServerHttpRequest
import org.springframework.mock.web.server.MockServerWebExchange
import org.springframework.web.reactive.function.server.HandlerStrategies
import org.springframework.web.reactive.function.server.ServerRequest

// Unit-level guard for WebConfig.staticResourceRouter. The spaRouter inside
// is a GET-with-wildcards route that returns index.html, minus a hand-curated
// list of negate predicates for paths owned by Gateway / Spring Security.
// RouterFunction mapping has higher precedence than @RequestMapping in
// WebFlux, so any path NOT excluded here gets index.html before the
// controller is reached.
//
// /portal/<wildcard> must be excluded so PortalInfoController is reachable.
// This test runs the router directly with a synthetic request and asserts
// the router returns Mono.empty (no match) for /portal/info. Without the
// exclusion the spaRouter swallows the request and the test fails with a
// non-empty result, pointing straight at the missing negate() predicate.
class WebConfigTest {
    private val routerFunction = WebConfig().staticResourceRouter()
    private val strategies = HandlerStrategies.empty().codecs { it.registerDefaults(true) }.build()

    @Test
    fun `staticResourceRouter does not match GET portal info (controller takes over)`() {
        val request = serverRequestForGet("/portal/info")

        val handler = routerFunction.route(request).block()

        assertNull(
            handler,
            "WebConfig.spaRouter must exclude /portal/** so PortalInfoController can serve " +
                "/portal/info. Add `.and(GET(\"/portal/**\").negate())` to the spaRouter " +
                "predicate chain.",
        )
    }

    private fun serverRequestForGet(path: String): ServerRequest {
        val httpRequest = MockServerHttpRequest.get(path).build()
        val exchange = MockServerWebExchange.from(httpRequest)
        return ServerRequest.create(exchange, strategies.messageReaders())
    }
}
