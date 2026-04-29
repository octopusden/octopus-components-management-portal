package org.octopusden.octopus.components.portal.configuration

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.io.ClassPathResource
import org.springframework.http.MediaType
import org.springframework.web.reactive.function.server.RequestPredicates.GET
import org.springframework.web.reactive.function.server.RouterFunction
import org.springframework.web.reactive.function.server.RouterFunctions
import org.springframework.web.reactive.function.server.RouterFunctions.route
import org.springframework.web.reactive.function.server.ServerResponse

@Configuration
open class WebConfig {

    @Bean
    open fun staticResourceRouter(): RouterFunction<ServerResponse> {
        // Serve files from classpath:/static/assets/ — takes priority over Gateway handler.
        // RouterFunctions.resources() returns no-match (not 404) when the file doesn't exist,
        // so the assetsMissingRouter below handles the 404 case for unknown asset paths.
        val assetsRouter = RouterFunctions.resources("/assets/**", ClassPathResource("static/assets/"))

        // Return 404 for /assets/** paths where the file was not found above.
        val assetsMissingRouter = route(GET("/assets/**")) {
            ServerResponse.notFound().build()
        }

        // SPA fallback: serve index.html for any client-side route, but NOT for paths
        // owned by Spring Cloud Gateway / Spring Security. The RouterFunction wins over
        // the Gateway's RoutePredicateHandlerMapping, so any path that should be proxied
        // (/auth/** to the backend AuthController) or handled by the OIDC filter chain
        // (/oauth2/**, /login/**, /logout) must be excluded explicitly. Forgetting
        // /auth/** is the canonical mistake — the SPA's /auth/me call would silently get
        // index.html and useCurrentUser would fail validation in the SPA, leading to a
        // "auth check failed" banner without any backend trace.
        val spaRouter = route(
            GET("/**")
                .and(GET("/rest/**").negate())
                .and(GET("/auth/**").negate())
                .and(GET("/portal/**").negate())
                .and(GET("/oauth2/**").negate())
                .and(GET("/login/**").negate())
                .and(GET("/logout").negate())
                .and(GET("/actuator/**").negate())
        ) {
            ServerResponse.ok()
                .contentType(MediaType.TEXT_HTML)
                .bodyValue(ClassPathResource("static/index.html").contentAsByteArray)
        }

        return assetsRouter.and(assetsMissingRouter).and(spaRouter)
    }
}
