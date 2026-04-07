package org.octopusden.octopus.components.portal.configuration

import org.springframework.context.annotation.Configuration
import org.springframework.web.reactive.config.ResourceHandlerRegistry
import org.springframework.web.reactive.config.WebFluxConfigurer

@Configuration
open class WebConfig : WebFluxConfigurer {
    override fun addResourceHandlers(registry: ResourceHandlerRegistry) {
        registry.addResourceHandler(
            "/assets/**",
            "/index.html",
            "/favicon.ico",
            "/vite.svg",
        ).addResourceLocations("classpath:/static/")
    }
}
