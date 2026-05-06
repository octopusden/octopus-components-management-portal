rootProject.name = "components-management-portal"

pluginManagement {
    plugins {
        kotlin("jvm") version (extra["kotlin.version"] as String)
        id("org.springframework.boot") version (extra["spring-boot.version"] as String)
        id("com.github.node-gradle.node") version "7.0.2"
        id("com.bmuschko.docker-spring-boot-application") version "9.4.0"
        id("io.github.gradle-nexus.publish-plugin") version "1.1.0"
        id("org.octopusden.octopus-quality") version "2.3.4"
        id("io.gitlab.arturbosch.detekt") version "1.23.8"
        id("org.jlleitschuh.gradle.ktlint") version "14.0.1"
        id("org.jetbrains.kotlinx.kover") version "0.9.4"
    }
}
