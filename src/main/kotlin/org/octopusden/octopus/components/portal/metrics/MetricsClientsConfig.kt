package org.octopusden.octopus.components.portal.metrics

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * Wiring for the two [ServiceRuntimeMetricsClient] instances feeding the admin
 * System tab: one for CRS (components-registry-service) and one for RMS
 * (release-management-service). They differ only in base URL and whether the
 * caller's bearer token is relayed to the metrics endpoints:
 *  - CRS actuator metrics are authenticated() → relayToken = true.
 *  - RMS actuator metrics are anonymous       → relayToken = false.
 */
/*
 * proxyBeanMethods = false: the two @Bean methods never call one another, so no
 * CGLIB proxy is needed — which also sidesteps Kotlin's final-by-default classes
 * (a proxied @Configuration must be open).
 */
@Configuration(proxyBeanMethods = false)
class MetricsClientsConfig {
    @Bean
    fun crsRuntimeMetricsClient(
        @Value("\${portal.registry-health-base-url}") registryBaseUrl: String,
    ): ServiceRuntimeMetricsClient = ServiceRuntimeMetricsClient(registryBaseUrl, relayToken = true)

    @Bean
    fun rmsRuntimeMetricsClient(
        @Value("\${portal.release-management-health-base-url}") releaseManagementBaseUrl: String,
    ): ServiceRuntimeMetricsClient = ServiceRuntimeMetricsClient(releaseManagementBaseUrl, relayToken = false)
}
