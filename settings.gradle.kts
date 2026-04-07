rootProject.name = "components-management-portal"

pluginManagement {
    plugins {
        kotlin("jvm") version (extra["kotlin.version"] as String)
        id("org.springframework.boot") version (extra["spring-boot.version"] as String)
        id("com.github.node-gradle.node") version "7.0.2"
        id("com.bmuschko.docker-spring-boot-application") version "9.4.0"
        id("io.github.gradle-nexus.publish-plugin") version "1.1.0"
    }
}
