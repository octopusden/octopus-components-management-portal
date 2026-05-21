import com.github.gradle.node.npm.task.NpmTask
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.math.BigDecimal
import java.time.Duration

plugins {
    kotlin("jvm")
    id("org.springframework.boot")
    id("com.github.node-gradle.node")
    id("io.github.gradle-nexus.publish-plugin")
    id("com.bmuschko.docker-spring-boot-application")
    id("io.gitlab.arturbosch.detekt")
    id("org.jlleitschuh.gradle.ktlint")
    id("org.jetbrains.kotlinx.kover")
    id("org.octopusden.octopus-quality")
    signing
    idea
    `maven-publish`
    jacoco
}

octopusQuality {
    coverage {
        minimumLineCoverage.set(BigDecimal("0.00"))
        overallMinimum.set(BigDecimal("0.00"))
    }
}

kover {
    currentProject {
        instrumentation {
            // e2eTest spins up Testcontainers (Postgres + Keycloak + CRS) and requires
            // a private Docker registry — never runnable in a standard CI sandbox.
            // Excluding it prevents Kover from wiring e2eTest into the check lifecycle.
            disabledForTestTasks.add("e2eTest")
        }
    }
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

// TODO Stage B: remove this gate once we swap to dev.detekt 2.x — detekt 1.23.8 cannot
// parse Kotlin 2.3 PSI, so it crashes on every source file under the new compiler.
tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach { enabled = false }

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
    implementation("org.springframework.cloud:spring-cloud-starter-gateway-server-webflux")

    implementation(platform("org.springframework.boot:spring-boot-dependencies:${project.properties["spring-boot.version"]}"))
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-client")

    implementation("io.micrometer:micrometer-registry-prometheus")

    testImplementation(kotlin("test"))
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")

    // E2E driver only (JUnit @Tag("e2e")). The default `test` task excludes
    // the tag, so these jars are never pulled onto the unit-test classpath at
    // runtime — they're declared as testImplementation only because they share
    // the same source-set (src/test/kotlin) as the unit tests.
    testImplementation(platform("org.testcontainers:testcontainers-bom:${project.property("testcontainers.version")}"))
    testImplementation("org.testcontainers:testcontainers")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:postgresql")
    testImplementation("org.postgresql:postgresql")
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
    version.set("22.22.2")
    download.set(true)
}

val npmCi = tasks.register<NpmTask>("npmCi") {
    npmCommand.set(listOf("ci"))
}

val npmBuild = tasks.register<NpmTask>("npmBuild") {
    dependsOn(npmCi)
    npmCommand.set(listOf("run", "build"))
    environment.put("VITE_APP_BASE_URL", System.getenv().getOrDefault("VITE_APP_BASE_URL", "/"))
}

val npmLint = tasks.register<NpmTask>("npmLint") {
    dependsOn(npmCi)
    npmCommand.set(listOf("run", "lint"))
}

val npmTypecheck = tasks.register<NpmTask>("npmTypecheck") {
    dependsOn(npmCi)
    npmCommand.set(listOf("run", "typecheck"))
}

val npmTestCoverage = tasks.register<NpmTask>("npmTestCoverage") {
    dependsOn(npmCi)
    npmCommand.set(listOf("run", "test:coverage"))
}

tasks.named("check") {
    dependsOn(npmLint, npmTypecheck, npmTestCoverage)
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
    // Exclude the @Tag("e2e") class so the default test task — and therefore
    // `check` and `build` — never spin up the Testcontainers stack. JUnit
    // tag filtering only kicks in when a task opts into either includeTags
    // or excludeTags; without this line the e2e driver class would be
    // discovered and run by every `gradlew test` invocation.
    useJUnitPlatform {
        excludeTags("e2e")
    }
    finalizedBy(tasks.jacocoTestReport)
}

// Standalone task — NOT wired into `check` or `build`. Opt-in via
// `./gradlew e2eTest`. Spins up Postgres + Keycloak + CRS via
// Testcontainers, then (E-5) launches the portal bootJar subprocess
// and (E-7) shells out to Playwright.
val e2eTest = tasks.register<Test>("e2eTest") {
    description = "Runs the end-to-end Testcontainers + Playwright stack."
    group = "verification"
    // bootJar must exist on disk before the driver looks for it under
    // build/libs — the portal container bind-mounts it. Playwright runs
    // inside its own container (mcr.microsoft.com/playwright) and does
    // its own npm ci on the host's package.json, so we don't need any
    // host-side npm install here.
    val bootJarTask = tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar")
    dependsOn(bootJarTask)
    // Pass the exact bootJar path through to the driver — avoids the
    // brittle "first .jar in build/libs" fallback when the workspace
    // accumulates artefacts from previous builds (TC reuses workdir
    // across runs unless `clean` is forced). CommandLineArgumentProvider
    // defers Provider resolution to execution time so we don't hit
    // "Querying the mapped value before task has completed".
    jvmArgumentProviders.add(CommandLineArgumentProvider {
        listOf("-Dportal.bootJar=${bootJarTask.get().archiveFile.get().asFile.absolutePath}")
    })
    useJUnitPlatform {
        includeTags("e2e")
    }
    // Prevent Gradle from caching a green run — the stack is expensive but
    // idempotent, and a cached result hides infra rot (image disappears,
    // realm drifts) that the e2e gate exists to catch.
    outputs.upToDateWhen { false }
    // Re-use the unit-test source set / classpath so we don't have to
    // duplicate `testImplementation` declarations.
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    // Pass the realm-JSON path through so test classes don't depend on
    // the Gradle working directory.
    systemProperty(
        "e2e.realmJson",
        project.layout.projectDirectory.file("infra/dev/keycloak/portal-realm.json")
            .asFile.absolutePath,
    )
    systemProperty("crs.version", project.property("crs.version") as String)
    systemProperty("keycloak.version", project.property("keycloak.version") as String)
    systemProperty("postgres.version", project.property("postgres.version") as String)
    val e2eTestFilter = (project.findProperty("e2e.testFilter") as String?)?.takeIf { it.isNotBlank() }
    if (e2eTestFilter != null) systemProperty("e2e.testFilter", e2eTestFilter)
    // Pass the registry knobs through verbatim — the driver resolves
    // priority. We deliberately do NOT bake a default here so the
    // registry hostname stays out of source; if neither env nor -P sets
    // anything, the driver fails fast with a clear error message.
    val crsRegistry = (project.findProperty("crs.docker.registry") as String?)?.takeIf { it.isNotBlank() }
    if (crsRegistry != null) systemProperty("crs.docker.registry", crsRegistry)
    val dockerRegistry = (project.findProperty("docker.registry") as String?)?.takeIf { it.isNotBlank() }
    if (dockerRegistry != null) systemProperty("docker.registry", dockerRegistry)
    val ghcrRegistry = "octopusGithubDockerRegistry".getExt().takeIf { it.isNotBlank() }
    if (ghcrRegistry != null) systemProperty("octopus.github.docker.registry", ghcrRegistry)
    // Ryuk (Testcontainers' resource reaper) needs to bind-mount
    // /var/run/docker.sock into itself; Podman rootless on CI refuses
    // that, and on some macOS Docker setups Ryuk fails to come up at
    // all. CRS disables it the same way; we lean on JVM shutdown hooks
    // (PortalProcess) and explicit @AfterAll teardown to clean up.
    environment("TESTCONTAINERS_RYUK_DISABLED", "true")

    // Surface DOCKER_REGISTRY so the test JVM can pick a mirror for
    // Docker Hub / Quay images if one is configured (mitigates
    // anonymous Hub rate limits on shared runners). No-op when unset.
    val dockerRegistryMirror = System.getenv("DOCKER_REGISTRY")
        ?: (project.findProperty("docker.registry") as String?)
    if (!dockerRegistryMirror.isNullOrBlank()) {
        environment("DOCKER_REGISTRY", dockerRegistryMirror)
    }
}

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports {
        xml.required = true
        html.required = true
    }
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
