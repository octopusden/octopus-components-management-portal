package org.octopusden.octopus.components.portal.e2e

import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.Network
import org.testcontainers.containers.output.Slf4jLogConsumer
import org.testcontainers.images.builder.ImageFromDockerfile
import org.testcontainers.utility.MountableFile
import org.slf4j.LoggerFactory
import java.nio.file.Path
import java.time.Duration

/**
 * Playwright container on the same docker network as Keycloak / CRS /
 * portal. Headless Chromium runs inside the container, so the browser
 * resolves docker network aliases (`keycloak`, `portal`) just like the
 * Spring services do — no host networking, no `/etc/hosts` work, no
 * fixed host ports.
 *
 * Image is built once via [ImageFromDockerfile]: the Dockerfile bakes
 * `npm ci` against package.json + lock so warm runs skip dep download.
 * Spec files (e2e/, playwright.config.ts) are bind-mounted at runtime
 * so a spec edit doesn't trigger an image rebuild.
 */
object PlaywrightContainer {

    private val log = LoggerFactory.getLogger(PlaywrightContainer::class.java)

    fun create(
        frontendDir: Path,
        network: Network,
        baseUrl: String,
        keycloakUrl: String,
        adminUsername: String,
        adminPassword: String,
        viewerUsername: String,
        viewerPassword: String,
        testClientId: String,
        testClientSecret: String,
        testFilter: String? = null,
    ): GenericContainer<*> {
        check(frontendDir.toFile().isDirectory) { "frontend/ not found at $frontendDir" }
        val image = ImageFromDockerfile()
            .withFileFromPath("package.json", frontendDir.resolve("package.json"))
            .withFileFromPath("package-lock.json", frontendDir.resolve("package-lock.json"))
            .withFileFromString(
                "Dockerfile",
                """
                FROM mcr.microsoft.com/playwright:v1.60.0-jammy
                WORKDIR /work
                COPY package.json package-lock.json /work/
                # Pre-baked deps so the e2e gate doesn't pay 30s of npm ci on every run.
                # The base image already ships Chromium / playwright globally; a project-
                # local install is still required because @playwright/test resolves from
                # node_modules.
                RUN npm ci --no-audit --no-fund --silent
                # CMD is overridden by withCommand in the test driver.
                CMD ["npx", "playwright", "test"]
                """.trimIndent(),
            )

        // Pre-create writable output dirs on the host so Docker can bind
        // them as files-on-files; otherwise an autocreated container dir
        // would shadow nothing and the artefacts would be lost on exit.
        val testResultsDir = frontendDir.resolve("test-results")
        val playwrightReportDir = frontendDir.resolve("playwright-report")
        // playwright/.auth/<role>.json is written by globalSetup at
        // /work/playwright/.auth/<role>.json (cwd-relative inside the
        // container). Bind-mounting frontend/playwright back to the host
        // makes those storageState files survive container exit so a
        // debugging engineer can inspect what was captured.
        val playwrightStateDir = frontendDir.resolve("playwright")
        java.nio.file.Files.createDirectories(testResultsDir)
        java.nio.file.Files.createDirectories(playwrightReportDir)
        java.nio.file.Files.createDirectories(playwrightStateDir.resolve(".auth"))

        return GenericContainer(image)
            .withNetwork(network)
            .withWorkingDirectory("/work")
            // Spec files live on the host. Bind-mount read-write — the
            // `playwright/.auth/<role>.json` storageState files are
            // written by globalSetup and need to land on host disk so
            // a debugging engineer can inspect them post-mortem.
            .withFileSystemBind(
                frontendDir.resolve("e2e").toAbsolutePath().toString(),
                "/work/e2e",
                org.testcontainers.containers.BindMode.READ_WRITE,
            )
            // Bind output dirs back to the host so JUnit XML and the
            // HTML report end up where TeamCity collects them
            // (frontend/test-results and frontend/playwright-report).
            .withFileSystemBind(
                testResultsDir.toAbsolutePath().toString(),
                "/work/test-results",
                org.testcontainers.containers.BindMode.READ_WRITE,
            )
            .withFileSystemBind(
                playwrightReportDir.toAbsolutePath().toString(),
                "/work/playwright-report",
                org.testcontainers.containers.BindMode.READ_WRITE,
            )
            .withFileSystemBind(
                playwrightStateDir.toAbsolutePath().toString(),
                "/work/playwright",
                org.testcontainers.containers.BindMode.READ_WRITE,
            )
            .withCopyFileToContainer(
                MountableFile.forHostPath(
                    frontendDir.resolve("playwright.config.ts").toAbsolutePath().toString(),
                ),
                "/work/playwright.config.ts",
            )
            .withEnv(
                mapOf(
                    "BASE_URL" to baseUrl,
                    "KEYCLOAK_URL" to keycloakUrl,
                    "E2E_ADMIN_USERNAME" to adminUsername,
                    "E2E_ADMIN_PASSWORD" to adminPassword,
                    "E2E_VIEWER_USERNAME" to viewerUsername,
                    "E2E_VIEWER_PASSWORD" to viewerPassword,
                    "KEYCLOAK_TEST_CLIENT_ID" to testClientId,
                    "KEYCLOAK_TEST_CLIENT_SECRET" to testClientSecret,
                    "CI" to "true",
                ),
            )
            // We don't wait for a port; the container exits when playwright
            // finishes. Caller polls via getContainerInfo().getState() and
            // reads the exit code.
            .withStartupCheckStrategy(
                org.testcontainers.containers.startupcheck.OneShotStartupCheckStrategy()
                    .withTimeout(Duration.ofMinutes(10)),
            )
            .withCommand(*buildPlaywrightCommand(testFilter))
            .withLogConsumer(Slf4jLogConsumer(log))
    }
}

internal fun buildPlaywrightCommand(testFilter: String?): Array<String> {
    // testFilter is documented as a spec-path arg; reject `-`-prefixed values
    // so a typo can't silently switch playwright into option-mode (--grep,
    // --project, --pass-with-no-tests, …) and change suite semantics.
    require(testFilter == null || !testFilter.startsWith("-")) {
        "e2e.testFilter must be a spec path, not a Playwright option (got '$testFilter')"
    }
    return buildList {
        add("npx"); add("playwright"); add("test")
        if (!testFilter.isNullOrBlank()) add(testFilter)
    }.toTypedArray()
}
