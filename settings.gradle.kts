rootProject.name = "components-management-portal"

pluginManagement {
    plugins {
        kotlin("jvm") version (extra["kotlin.version"] as String)
        id("org.springframework.boot") version (extra["spring-boot.version"] as String)
        id("com.github.node-gradle.node") version "7.1.0"
        id("com.bmuschko.docker-spring-boot-application") version "10.0.0"
        id("io.github.gradle-nexus.publish-plugin") version "2.0.0"
        id("org.octopusden.octopus-quality") version "2.4.1"
        id("dev.detekt") version "2.0.0-alpha.3"
        id("org.jlleitschuh.gradle.ktlint") version "14.2.0"
        id("org.jetbrains.kotlinx.kover") version "0.9.8"
    }
}

plugins {
    // Auto-provisions a JDK 25 toolchain (build.gradle.kts) when one isn't installed locally.
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
