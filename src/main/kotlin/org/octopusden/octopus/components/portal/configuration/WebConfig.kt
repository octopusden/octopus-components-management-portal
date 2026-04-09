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

        // SPA fallback: serve index.html for any client-side route (not API, not actuator, not assets).
        val spaRouter = route(
            GET("/**")
                .and(GET("/rest/**").negate())
                .and(GET("/actuator/**").negate())
        ) {
            ServerResponse.ok()
                .contentType(MediaType.TEXT_HTML)
                .bodyValue(ClassPathResource("static/index.html").contentAsByteArray)
        }

        return assetsRouter.and(assetsMissingRouter).and(spaRouter)
    }
}
