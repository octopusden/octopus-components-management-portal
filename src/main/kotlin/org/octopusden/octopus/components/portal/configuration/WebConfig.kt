package org.octopusden.octopus.components.portal.configuration

import org.springframework.context.annotation.Configuration
import org.springframework.web.reactive.config.ResourceHandlerRegistry
import org.springframework.web.reactive.config.WebFluxConfigurer

@Configuration
open class WebConfig : WebFluxConfigurer {
    override fun addResourceHandlers(registry: ResourceHandlerRegistry) {
        // For path patterns ending in /**, Spring strips the literal prefix and
        // resolves the remainder against the resource location. So /assets/foo.js
        // matched by "/assets/**" becomes "foo.js" inside the location — meaning
        // the location itself must point at .../static/assets/, not .../static/.
        registry.addResourceHandler("/assets/**")
            .addResourceLocations("classpath:/static/assets/")
        registry.addResourceHandler("/index.html", "/favicon.ico", "/vite.svg")
            .addResourceLocations("classpath:/static/")
    }
}
