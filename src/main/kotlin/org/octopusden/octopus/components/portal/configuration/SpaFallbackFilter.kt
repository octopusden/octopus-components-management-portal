package org.octopusden.octopus.components.portal.configuration

import org.springframework.core.io.ClassPathResource
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.server.ServerWebExchange
import org.springframework.web.server.WebFilter
import org.springframework.web.server.WebFilterChain
import reactor.core.publisher.Mono

/**
 * Serves index.html for non-API, non-asset paths so that the SPA can handle client-side routing.
 */
@Component
class SpaFallbackFilter : WebFilter {
    override fun filter(exchange: ServerWebExchange, chain: WebFilterChain): Mono<Void> {
        val path = exchange.request.uri.path
        val method = exchange.request.method

        if (method != HttpMethod.GET) {
            return chain.filter(exchange)
        }

        // Let API, actuator, auth-me, and Spring Security OIDC endpoints pass through.
        // Match exact prefixes with a trailing slash so future SPA routes like
        // /login-help, /logout-confirm, /oauth2-settings don't accidentally get
        // routed away from index.html.
        if (path.startsWith("/rest/") ||
            path.startsWith("/auth/") ||
            path.startsWith("/actuator/") ||
            path == "/login" || path.startsWith("/login/") ||
            path == "/oauth2" || path.startsWith("/oauth2/") ||
            path == "/logout" || path.startsWith("/logout/")
        ) {
            return chain.filter(exchange)
        }

        // Let static assets pass through
        if (path.startsWith("/assets/") ||
            path == "/favicon.ico" ||
            path == "/vite.svg" ||
            path == "/index.html" ||
            path.contains(".")
        ) {
            return chain.filter(exchange)
        }

        // For everything else, serve index.html
        val indexResource = ClassPathResource("/static/index.html")
        if (!indexResource.exists()) {
            return chain.filter(exchange)
        }

        val response = exchange.response
        response.headers.contentType = MediaType.TEXT_HTML
        return response.writeWith(
            Mono.fromSupplier {
                val bytes = indexResource.inputStream.readBytes()
                response.bufferFactory().wrap(bytes)
            }
        )
    }
}
