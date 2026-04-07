import com.github.gradle.node.npm.task.NpmTask
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.time.Duration

plugins {
    kotlin("jvm")
    id("org.springframework.boot")
    id("com.github.node-gradle.node")
    id("io.github.gradle-nexus.publish-plugin")
    id("com.bmuschko.docker-spring-boot-application")
    signing
    idea
    `maven-publish`
}

group = "org.octopusden.octopus.components.portal"

java {
    withJavadocJar()
    withSourcesJar()
    JavaVersion.VERSION_21.let {
        sourceCompatibility = it
        targetCompatibility = it
    }
}

kotlin {
    compilerOptions.jvmTarget = JvmTarget.JVM_21
}

idea.module {
    isDownloadJavadoc = true
    isDownloadSources = true
}

repositories {
    mavenCentral()
    maven {
        url = uri("https://repo.gradle.org/gradle/libs-releases")
    }
}

dependencies {
    implementation(platform("org.springframework.cloud:spring-cloud-dependencies:${project.property("spring-cloud.version")}"))
    implementation("org.springframework.cloud:spring-cloud-starter-bootstrap")
    implementation("org.springframework.cloud:spring-cloud-starter-config")
    implementation("org.springframework.cloud:spring-cloud-starter-gateway")

    implementation(platform("org.springframework.boot:spring-boot-dependencies:${project.properties["spring-boot.version"]}"))
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    implementation("io.micrometer:micrometer-registry-prometheus")

    testImplementation(kotlin("test"))
}

ext {
    System.getenv().let {
        set(
            "signingRequired",
            it.containsKey("ORG_GRADLE_PROJECT_signingKey") && it.containsKey("ORG_GRADLE_PROJECT_signingPassword")
        )
        set(
            "dockerRegistry",
            System.getenv().getOrDefault("DOCKER_REGISTRY", project.properties["docker.registry"])
        )
        set(
            "octopusGithubDockerRegistry",
            System.getenv()
                .getOrDefault("OCTOPUS_GITHUB_DOCKER_REGISTRY", project.properties["octopus.github.docker.registry"])
        )
    }
    val mandatoryProperties = mutableListOf("dockerRegistry", "octopusGithubDockerRegistry")
    val undefinedProperties = mandatoryProperties.filter { (project.ext[it] as String).isBlank() }
    if (undefinedProperties.isNotEmpty()) {
        throw IllegalArgumentException(
            "Start gradle build with" +
                    (if (undefinedProperties.contains("dockerRegistry")) " -Pdocker.registry=..." else "") +
                    (if (undefinedProperties.contains("octopusGithubDockerRegistry")) " -Poctopus.github.docker.registry=..." else "") +
                    " or set env variable(s):" +
                    (if (undefinedProperties.contains("dockerRegistry")) " DOCKER_REGISTRY" else "") +
                    (if (undefinedProperties.contains("octopusGithubDockerRegistry")) " OCTOPUS_GITHUB_DOCKER_REGISTRY" else "")
        )
    }
}

fun String.getExt() = project.ext[this] as String

springBoot {
    buildInfo()
}

node {
    nodeProjectDir.set(project.rootDir.resolve("frontend"))
    version.set("20.11.1")
    download.set(true)
    npmVersion.set("10.2.4")
}

val npmBuild = tasks.register<NpmTask>("npmBuild") {
    dependsOn("npmInstall")
    npmCommand.set(listOf("run", "build"))
}

val npmLint = tasks.register<NpmTask>("npmLint") {
    dependsOn("npmInstall")
    npmCommand.set(listOf("run", "lint"))
}

val npmTypecheck = tasks.register<NpmTask>("npmTypecheck") {
    dependsOn("npmInstall")
    npmCommand.set(listOf("run", "typecheck"))
}

val npmTestCoverage = tasks.register<NpmTask>("npmTestCoverage") {
    dependsOn("npmInstall")
    npmCommand.set(listOf("run", "test:coverage"))
}

tasks.register("qualityStatic") {
    dependsOn(npmLint, npmTypecheck)
}

tasks.register("qualityCoverage") {
    dependsOn(npmTestCoverage)
}

val copyFrontendDist = tasks.register<Sync>("copyFrontendDist") {
    dependsOn(npmBuild)
    from(project.rootDir.resolve("frontend/dist"))
    into(layout.buildDirectory.dir("resources/main/static"))
}

tasks.withType<ProcessResources> {
    dependsOn(copyFrontendDist)
}

tasks.getByName<Delete>("clean") {
    this.delete.add("$projectDir/frontend/node_modules")
}

tasks.test {
    useJUnitPlatform()
}

nexusPublishing {
    repositories {
        sonatype {
            nexusUrl.set(uri("https://ossrh-staging-api.central.sonatype.com/service/local/"))
            snapshotRepositoryUrl.set(uri("https://central.sonatype.com/repository/maven-snapshots/"))
            username.set(System.getenv("MAVEN_USERNAME"))
            password.set(System.getenv("MAVEN_PASSWORD"))
        }
    }
    transitionCheckOptions {
        maxRetries.set(60)
        delayBetween.set(Duration.ofSeconds(30))
    }
}

publishing {
    publications {
        create<MavenPublication>("bootJar") {
            artifact(tasks.getByName("bootJar"))
            from(components["java"])
            pom {
                name.set(project.name)
                description.set("Octopus module: ${project.name}")
                url.set("https://github.com/octopusden/octopus-components-management-portal.git")
                licenses {
                    license {
                        name.set("The Apache License, Version 2.0")
                        url.set("http://www.apache.org/licenses/LICENSE-2.0.txt")
                    }
                }
                scm {
                    url.set("https://github.com/octopusden/octopus-components-management-portal.git")
                    connection.set("scm:git://github.com/octopusden/octopus-components-management-portal.git")
                }
                developers {
                    developer {
                        id.set("octopus")
                        name.set("octopus")
                    }
                }
            }
        }
    }
}

signing {
    isRequired = project.ext["signingRequired"] as Boolean
    val signingKey: String? by project
    val signingPassword: String? by project
    useInMemoryPgpKeys(signingKey, signingPassword)
    sign(publishing.publications["bootJar"])
}

docker {
    springBootApplication {
        baseImage.set("${"dockerRegistry".getExt()}/eclipse-temurin:21-jdk")
        ports.set(listOf(8080))
        images.set(setOf("${"octopusGithubDockerRegistry".getExt()}/octopusden/${project.name}:${project.version}"))
    }
}
