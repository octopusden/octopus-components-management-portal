package org.octopusden.octopus.components.portal.e2e

import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.Network
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.containers.output.Slf4jLogConsumer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.utility.DockerImageName
import org.slf4j.LoggerFactory
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.util.UUID

/**
 * Brings up the entire e2e stack — Postgres, Keycloak, CRS, portal,
 * Playwright — as Testcontainers on a shared docker network.
 *
 * Single canonical Keycloak URL inside the docker network:
 * `http://keycloak:8080`. JWT issuer matches what every party
 * (CRS, portal, headless browser) uses to reach Keycloak, because
 * docker DNS resolves the alias the same way for all of them. Nothing
 * on the host (browser, /etc/hosts, fixed ports) participates in the
 * trust boundary, so CI agents can be universal: just need Docker.
 *
 * Tagged "e2e" so the default `test` task ignores it. Only the `e2eTest`
 * Gradle task includes the tag.
 */
@Tag("e2e")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
open class E2ETestcontainersDriver {

    companion object {
        private val log = LoggerFactory.getLogger(E2ETestcontainersDriver::class.java)

        const val KEYCLOAK_NETWORK_ALIAS = "keycloak"
        const val KEYCLOAK_INTERNAL_PORT = 8080
        const val KEYCLOAK_REALM = "portal"
        // Client IDs and usernames are non-secret identifiers — no GG hits.
        const val KEYCLOAK_DIRECT_GRANT_CLIENT = "portal-e2e-direct"
        const val KEYCLOAK_BFF_CLIENT = "portal-bff"
        const val E2E_ADMIN_USERNAME = "e2e-admin"
        const val E2E_VIEWER_USERNAME = "e2e-viewer"

        // Per-run randomised secrets. Realm JSON ships placeholder tokens
        // (__PORTAL_BFF_SECRET__ etc.) which the driver substitutes at
        // startup before mounting the JSON into Keycloak. Keeps test
        // credentials out of source — both because they aren't secrets in
        // any prod sense and because secret scanners (GitGuardian) flag
        // any concrete value here as a finding.
        @JvmStatic
        protected val keycloakBffSecret: String = UUID.randomUUID().toString()
        @JvmStatic
        protected val keycloakDirectGrantSecret: String = UUID.randomUUID().toString()
        @JvmStatic
        protected val e2eAdminPassword: String = UUID.randomUUID().toString()
        @JvmStatic
        protected val e2eViewerPassword: String = UUID.randomUUID().toString()

        const val POSTGRES_DB = "components_registry"
        const val POSTGRES_USER = "crs"
        const val POSTGRES_PASSWORD = "crs"
        const val POSTGRES_NETWORK_ALIAS = "crs-postgres"

        const val CRS_INTERNAL_PORT = 4567
        const val CRS_NETWORK_ALIAS = "crs"

        // Single canonical URL used by every party inside the docker network.
        // Matches the JWT iss claim Keycloak emits because we set
        // KC_HOSTNAME=keycloak + KC_HOSTNAME_PORT=8080 below.
        val KEYCLOAK_INTERNAL_URL: String
            get() = "http://$KEYCLOAK_NETWORK_ALIAS:$KEYCLOAK_INTERNAL_PORT"

        @JvmStatic
        protected lateinit var network: Network

        @JvmStatic
        protected lateinit var postgres: PostgreSQLContainer<*>

        @JvmStatic
        protected lateinit var keycloak: GenericContainer<*>

        @JvmStatic
        protected lateinit var crs: GenericContainer<*>

        @JvmStatic
        protected lateinit var portal: GenericContainer<*>

        private fun fixturePath(name: String): Path {
            val url = E2ETestcontainersDriver::class.java.classLoader
                .getResource("e2e/crs-fixture/$name")
                ?: error("e2e/crs-fixture/$name not on test classpath")
            return Path.of(url.toURI())
        }

        private fun crsFixtureDir(): Path = fixturePath("Aggregator.groovy").parent

        /**
         * Image versions come from gradle.properties via system properties
         * (forwarded by the e2eTest task). A bump there is the single
         * source of truth — drift between the property and the driver
         * is the kind of thing reviewers shouldn't have to spot.
         *
         * Registry resolution: when `DOCKER_REGISTRY` (env or `docker.registry`
         * sysprop) is set to anything other than the canonical public default,
         * the value is used as the prefix for postgres and keycloak pulls
         * too — not just the CRS image and the portal Dockerfile base. This
         * matches what the TC build agent already passes through via
         * `-Pdocker.registry=...` / `DOCKER_REGISTRY=...` and lets a private
         * mirror serve the whole testcontainers stack instead of letting the
         * anonymous Docker Hub / quay.io rate limit gate every PR.
         */
        private fun postgresImageName(): DockerImageName {
            val version = firstNonBlank(
                System.getProperty("postgres.version"),
                System.getenv("POSTGRES_VERSION"),
            ) ?: error("postgres.version not set — pass -Ppostgres.version=... or env POSTGRES_VERSION")
            val name = imageWithRegistry(canonicalHubPath = "postgres", version = version)
            // `asCompatibleSubstituteFor("postgres")` keeps
            // PostgreSQLContainer's built-in checks happy when the resolved
            // image lives under a mirror prefix (otherwise testcontainers
            // refuses to recognise it as a postgres image).
            return DockerImageName.parse(name).asCompatibleSubstituteFor("postgres")
        }

        private fun keycloakImageName(): DockerImageName {
            val version = firstNonBlank(
                System.getProperty("keycloak.version"),
                System.getenv("KEYCLOAK_VERSION"),
            ) ?: error("keycloak.version not set — pass -Pkeycloak.version=... or env KEYCLOAK_VERSION")
            // Canonical Keycloak home is quay.io/keycloak/keycloak. When a
            // private mirror is configured it is expected to proxy the
            // upstream path; the keycloak sub-path is preserved so a single
            // mirror can serve both Docker Hub and quay.io content under one
            // hostname.
            val name = imageWithRegistry(
                canonicalHubPath = "keycloak/keycloak",
                canonicalUnmirroredImage = "quay.io/keycloak/keycloak",
                version = version,
            )
            return DockerImageName.parse(name)
        }

        /**
         * Build the fully-qualified image name based on the resolved
         * registry. When the registry is the public default (unset / blank
         * / `docker.io`), return the bare canonical image name so
         * testcontainers / docker-java picks its own default registry; for
         * non-default registries, prepend the mirror hostname.
         *
         * @param canonicalHubPath image path under Docker Hub (e.g. `postgres`,
         *   `keycloak/keycloak`). Used both as the mirrored suffix AND as the
         *   default bare Hub image name when `canonicalUnmirroredImage` is null.
         * @param canonicalUnmirroredImage canonical fully-qualified image name
         *   used when no mirror is configured (e.g. `quay.io/keycloak/keycloak`).
         *   Falls back to `canonicalHubPath` when null (the Docker Hub case).
         */
        private fun imageWithRegistry(
            canonicalHubPath: String,
            canonicalUnmirroredImage: String? = null,
            version: String,
        ): String {
            val registry = firstNonBlank(
                System.getenv("DOCKER_REGISTRY"),
                System.getProperty("docker.registry"),
            )
            val isPublicDefault = registry.isNullOrBlank() ||
                    registry == "docker.io" ||
                    registry == "registry-1.docker.io"
            return if (isPublicDefault) {
                "${canonicalUnmirroredImage ?: canonicalHubPath}:$version"
            } else {
                "$registry/$canonicalHubPath:$version"
            }
        }

        /**
         * Realm JSON lives outside src/test/resources. Resolve relative to
         * the project dir, with `-De2e.realmJson=...` override hook.
         */
        private fun realmJsonTemplatePath(): Path {
            System.getProperty("e2e.realmJson")?.let { return Path.of(it) }
            val candidate = Path.of("infra/dev/keycloak/portal-realm.json").toAbsolutePath()
            check(candidate.toFile().isFile) {
                "Cannot find $candidate. Set -De2e.realmJson=/abs/path or run from project root."
            }
            return candidate
        }

        /**
         * Read the realm JSON template, substitute per-run secrets, write
         * the materialised realm under build/tmp/. Source JSON stays free
         * of concrete credentials.
         *
         * We deliberately write under the project workdir, not the system
         * temp dir, because Docker Desktop / Colima only expose specific
         * paths to the VM — bind-mounting from /var/folders fails with
         * "Is a directory" when Docker autocreates an empty target.
         */
        private fun materialiseRealmJson(): Path {
            val template = Files.readString(realmJsonTemplatePath())
            val materialised = template
                .replace("__E2E_ADMIN_PASSWORD__", e2eAdminPassword)
                .replace("__E2E_VIEWER_PASSWORD__", e2eViewerPassword)
                .replace("__PORTAL_BFF_SECRET__", keycloakBffSecret)
                .replace("__PORTAL_E2E_DIRECT_SECRET__", keycloakDirectGrantSecret)
            check(!materialised.contains("__")) {
                "Realm JSON still contains __ placeholder tokens after substitution"
            }
            val tmpDir = Path.of("build/tmp/e2e").toAbsolutePath()
            Files.createDirectories(tmpDir)
            val out = tmpDir.resolve("portal-realm.json")
            Files.writeString(out, materialised)
            return out
        }

        /**
         * Treat blank values as missing so an empty entry in
         * gradle.properties (intentional, see crs.docker.registry there)
         * falls through to the next source.
         */
        private fun firstNonBlank(vararg sources: String?): String? =
            sources.firstOrNull { !it.isNullOrBlank() }?.takeIf { it.isNotBlank() }

        private fun crsImageName(): DockerImageName {
            val registry = firstNonBlank(
                System.getenv("CRS_DOCKER_REGISTRY"),
                System.getProperty("crs.docker.registry"),
                System.getenv("DOCKER_REGISTRY"),
                System.getProperty("docker.registry"),
                System.getProperty("octopus.github.docker.registry"),
                System.getenv("OCTOPUS_GITHUB_DOCKER_REGISTRY"),
            ) ?: error(
                "No registry resolved for the CRS image. Set CRS_DOCKER_REGISTRY (or DOCKER_REGISTRY) " +
                        "as an env var, or -Pcrs.docker.registry / -Pdocker.registry on the gradle command line."
            )
            val crsVersion = firstNonBlank(
                System.getProperty("crs.version"),
                System.getenv("CRS_VERSION"),
            ) ?: error("crs.version not set — pass -Pcrs.version=... or env CRS_VERSION")
            return DockerImageName.parse("$registry/octopusden/components-registry-service:$crsVersion")
        }

        /**
         * Registry that hosts the eclipse-temurin base image used by the
         * portal container. Falls back to docker.io because the public Hub
         * is the natural source for upstream OS / JRE images; internal
         * mirrors override via DOCKER_REGISTRY env.
         */
        private fun dockerRegistry(): String =
            firstNonBlank(
                System.getenv("DOCKER_REGISTRY"),
                System.getProperty("docker.registry"),
            ) ?: "docker.io"

        /**
         * Resolve the portal bootJar.
         *
         * Preferred: `-Dportal.bootJar=...` set by the Gradle e2eTest
         * task to the exact `bootJar.archiveFile` path. That binding is
         * the one the driver should always use in CI so we test the
         * artefact this commit just produced — never a stale jar from
         * a previous run sharing the workdir.
         *
         * Fallback (manual / IDE runs): scan `build/libs` for a single
         * runnable jar. Fail loudly if zero or more-than-one candidates
         * exist — silent `first()` selection over `listFiles()`'s
         * undefined order would let an old artefact slip through.
         */
        private fun locateBootJar(): Path {
            System.getProperty("portal.bootJar")?.let { return Path.of(it) }
            val libs = Path.of("build/libs").toAbsolutePath()
            check(libs.toFile().isDirectory) {
                "$libs does not exist — run :bootJar before :e2eTest, or pass -Dportal.bootJar=/abs/path"
            }
            val candidates = (libs.toFile().listFiles { f ->
                f.isFile && f.name.endsWith(".jar") &&
                        !f.name.endsWith("-plain.jar") &&
                        !f.name.endsWith("-sources.jar") &&
                        !f.name.endsWith("-javadoc.jar")
            } ?: emptyArray()).sortedBy { it.name }
            check(candidates.isNotEmpty()) {
                "No bootJar in $libs — run :bootJar first or pass -Dportal.bootJar=/abs/path"
            }
            check(candidates.size == 1) {
                "Ambiguous bootJar in $libs (${candidates.size} candidates: " +
                        candidates.joinToString { it.name } +
                        "). Run `gradle clean :bootJar` or pass -Dportal.bootJar=/abs/path."
            }
            return candidates.single().toPath()
        }

        @JvmStatic
        @BeforeAll
        fun startStack() {
            // JUnit5 skips @AfterAll when @BeforeAll fails part-way (and
            // Ryuk is disabled — see e2eTest task). Without explicit
            // cleanup, a partial start leaks containers + the docker
            // network onto the agent. Wrap and rethrow.
            try {
                doStartStack()
            } catch (t: Throwable) {
                runCatching { stopStack() }
                throw t
            }
        }

        private fun doStartStack() {
            network = Network.newNetwork()

            postgres = PostgreSQLContainer(postgresImageName())
                .withDatabaseName(POSTGRES_DB)
                .withUsername(POSTGRES_USER)
                .withPassword(POSTGRES_PASSWORD)
                .withNetwork(network)
                .withNetworkAliases(POSTGRES_NETWORK_ALIAS)
                .withLogConsumer(Slf4jLogConsumer(LoggerFactory.getLogger("crs-postgres")))
            postgres.start()

            keycloak = GenericContainer(keycloakImageName())
                .withExposedPorts(KEYCLOAK_INTERNAL_PORT)
                .withCommand("start-dev", "--import-realm")
                .withEnv(
                    mapOf(
                        "KEYCLOAK_ADMIN" to "admin",
                        "KEYCLOAK_ADMIN_PASSWORD" to "admin",
                        // Hostname must match the URL the JWT iss claim is built
                        // from. Inside the docker network the alias `keycloak`
                        // resolves identically for every party — issuer
                        // validation passes without any per-trust-boundary
                        // gymnastics.
                        "KC_HOSTNAME" to KEYCLOAK_NETWORK_ALIAS,
                        "KC_HOSTNAME_PORT" to KEYCLOAK_INTERNAL_PORT.toString(),
                        "KC_HOSTNAME_STRICT" to "false",
                        "KC_HOSTNAME_STRICT_BACKCHANNEL" to "false",
                        "KC_HTTP_ENABLED" to "true",
                        "KC_PROXY" to "edge",
                    ),
                )
                .withFileSystemBind(
                    materialiseRealmJson().toAbsolutePath().toString(),
                    "/opt/keycloak/data/import/portal-realm.json",
                    org.testcontainers.containers.BindMode.READ_ONLY,
                )
                .withNetwork(network)
                .withNetworkAliases(KEYCLOAK_NETWORK_ALIAS)
                .waitingFor(
                    Wait.forHttp("/realms/$KEYCLOAK_REALM/.well-known/openid-configuration")
                        .forPort(KEYCLOAK_INTERNAL_PORT)
                        .withStartupTimeout(Duration.ofMinutes(3)),
                )
                .withLogConsumer(Slf4jLogConsumer(LoggerFactory.getLogger("keycloak")))
            keycloak.start()

            crs = GenericContainer(crsImageName())
                .withExposedPorts(CRS_INTERNAL_PORT)
                .withEnv(
                    buildMap {
                        put("SPRING_PROFILES_ACTIVE", "dev-db-automigrate")
                        put("SPRING_CLOUD_CONFIG_ENABLED", "false")
                        put("SPRING_CLOUD_BOOTSTRAP_ENABLED", "false")
                        put("SPRING_CONFIG_IMPORT", "")
                        put("EUREKA_CLIENT_ENABLED", "false")
                        put("SERVER_PORT", CRS_INTERNAL_PORT.toString())
                        put("POSTGRES_HOST", POSTGRES_NETWORK_ALIAS)
                        put("POSTGRES_PORT", "5432")
                        put("POSTGRES_DB", POSTGRES_DB)
                        put("POSTGRES_USER", POSTGRES_USER)
                        put("POSTGRES_PASSWORD", POSTGRES_PASSWORD)
                        put("AUTH_SERVER_URL", KEYCLOAK_INTERNAL_URL)
                        put("AUTH_SERVER_REALM", KEYCLOAK_REALM)
                        put("COMPONENTS_REGISTRY_WORK_DIR", "/opt/crs-fixture")
                        put("COMPONENTS_REGISTRY_GROOVY_PATH", "/opt/crs-fixture")
                        put("COMPONENTS_REGISTRY_MAIN_GROOVY_FILE", "Aggregator.groovy")
                        put("COMPONENTS_REGISTRY_DEPENDENCY_MAPPING_FILE", "dependency_mapping.properties")
                        put("COMPONENTS_REGISTRY_COPYRIGHT_PATH", "/opt/crs-fixture/copyrights")
                        put("COMPONENTS_REGISTRY_SUPPORTEDGROUPIDS", "org.octopusden.octopus,io.bcomponent")
                        put("COMPONENTS_REGISTRY_SUPPORTEDSYSTEMS", "NONE,CLASSIC,ALFA")
                        put("COMPONENTS_REGISTRY_VERSION_NAME_SERVICE_BRANCH", "serviceCBranch")
                        put("COMPONENTS_REGISTRY_VERSION_NAME_SERVICE", "serviceC")
                        put("COMPONENTS_REGISTRY_VERSION_NAME_MINOR", "minorC")
                        put("COMPONENTS_REGISTRY_PRODUCT_TYPE_C", "PT_C")
                        put("COMPONENTS_REGISTRY_PRODUCT_TYPE_K", "PT_K")
                        put("COMPONENTS_REGISTRY_PRODUCT_TYPE_D", "PT_D")
                        put("COMPONENTS_REGISTRY_PRODUCT_TYPE_DDB", "PT_D_DB")
                        put("COMPONENTS_REGISTRY_VCS_ENABLED", "false")
                        put("COMPONENTS_REGISTRY_AUTO_MIGRATE", "true")
                    },
                )
                .withFileSystemBind(
                    crsFixtureDir().toAbsolutePath().toString(),
                    "/opt/crs-fixture",
                    org.testcontainers.containers.BindMode.READ_ONLY,
                )
                .withNetwork(network)
                .withNetworkAliases(CRS_NETWORK_ALIAS)
                .waitingFor(
                    Wait.forHttp("/actuator/health")
                        .forPort(CRS_INTERNAL_PORT)
                        .forStatusCode(200)
                        .withStartupTimeout(Duration.ofMinutes(5)),
                )
                .withLogConsumer(Slf4jLogConsumer(LoggerFactory.getLogger("crs")))
            crs.start()

            portal = PortalContainer.create(
                bootJar = locateBootJar(),
                network = network,
                dockerRegistry = dockerRegistry(),
                authServerUrl = KEYCLOAK_INTERNAL_URL,
                authServerRealm = KEYCLOAK_REALM,
                authServerClientId = KEYCLOAK_BFF_CLIENT,
                authServerClientSecret = keycloakBffSecret,
                componentsRegistryServiceUrl = "http://$CRS_NETWORK_ALIAS:$CRS_INTERNAL_PORT",
            )
            portal.start()

            log.info(
                "E2E stack up. postgres={}/{} keycloak={}:{} crs={}:{} portal={}:{}",
                postgres.containerInfo.id.take(12), POSTGRES_NETWORK_ALIAS,
                keycloak.host, keycloak.getMappedPort(KEYCLOAK_INTERNAL_PORT),
                crs.host, crs.getMappedPort(CRS_INTERNAL_PORT),
                portal.host, portal.getMappedPort(PortalContainer.INTERNAL_PORT),
            )
        }

        @JvmStatic
        @AfterAll
        fun stopStack() {
            runCatching { portal.stop() }
            runCatching { crs.stop() }
            runCatching { keycloak.stop() }
            runCatching { postgres.stop() }
            runCatching { network.close() }
        }
    }

    @Test
    fun `CRS serves at least one component`() {
        val host = crs.host
        val port = crs.getMappedPort(CRS_INTERNAL_PORT)
        val url = URI("http://$host:$port/rest/api/4/components?page=0&size=10").toURL()
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "GET"
            assertEquals(200, conn.responseCode, "CRS /rest/api/4/components should return 200")
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val match = Regex("\"numberOfElements\"\\s*:\\s*(\\d+)").find(body)
            val total = match?.groupValues?.get(1)?.toIntOrNull() ?: 0
            assertTrue(total > 0, "Expected ≥1 component, got: ${body.take(500)}")
        } finally {
            conn.disconnect()
        }
    }

    @Test
    fun `OIDC userinfo emits bare role names`() {
        // Sanity check that the realm fixture's protocol mappers and bare
        // role names reach the userinfo endpoint as designed. Uses the
        // host-mapped Keycloak port; the iss claim still says
        // "http://keycloak:8080" because that's what KC_HOSTNAME pins.
        val keycloakHost = keycloak.host
        val keycloakPort = keycloak.getMappedPort(KEYCLOAK_INTERNAL_PORT)
        val tokenUrl = URI(
            "http://$keycloakHost:$keycloakPort/realms/$KEYCLOAK_REALM/protocol/openid-connect/token"
        ).toURL()
        val form = listOf(
            "grant_type" to "password",
            "client_id" to KEYCLOAK_DIRECT_GRANT_CLIENT,
            "client_secret" to keycloakDirectGrantSecret,
            "username" to E2E_ADMIN_USERNAME,
            "password" to e2eAdminPassword,
            "scope" to "openid profile email",
        ).joinToString("&") { (k, v) ->
            URLEncoder.encode(k, StandardCharsets.UTF_8) + "=" + URLEncoder.encode(v, StandardCharsets.UTF_8)
        }
        val tokenConn = tokenUrl.openConnection() as HttpURLConnection
        val accessToken: String = try {
            tokenConn.requestMethod = "POST"
            tokenConn.doOutput = true
            tokenConn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            tokenConn.outputStream.use { it.write(form.toByteArray(StandardCharsets.UTF_8)) }
            assertEquals(200, tokenConn.responseCode, "Direct-grant token endpoint should return 200")
            val body = tokenConn.inputStream.bufferedReader().use { it.readText() }
            Regex("\"access_token\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.get(1)
                ?: error("No access_token in token response: ${body.take(200)}")
        } finally {
            tokenConn.disconnect()
        }

        val userinfoUrl = URI(
            "http://$keycloakHost:$keycloakPort/realms/$KEYCLOAK_REALM/protocol/openid-connect/userinfo"
        ).toURL()
        val userinfoConn = userinfoUrl.openConnection() as HttpURLConnection
        try {
            userinfoConn.requestMethod = "GET"
            userinfoConn.setRequestProperty("Authorization", "Bearer $accessToken")
            assertEquals(200, userinfoConn.responseCode, "Userinfo should return 200")
            val body = userinfoConn.inputStream.bufferedReader().use { it.readText() }
            assertTrue(
                body.contains("\"ADMIN\""),
                "Userinfo must contain bare role name ADMIN. Body was: $body",
            )
            assertTrue(
                !body.contains("\"ROLE_ADMIN\""),
                "Userinfo must NOT contain ROLE_-prefixed role names. Body was: $body",
            )
            assertTrue(
                body.contains("\"roles\""),
                "Userinfo must contain top-level `roles` claim. Body was: $body",
            )
        } finally {
            userinfoConn.disconnect()
        }
    }

    @Test
    fun `portal serves anonymous portal-info`() {
        // Reach the portal via its host-mapped port — the URL is
        // localhost:<random>, but inside the portal container it's still
        // serving on 18090 with the `e2e` profile.
        val host = portal.host
        val port = portal.getMappedPort(PortalContainer.INTERNAL_PORT)
        val url = URI("http://$host:$port/portal/info").toURL()
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "GET"
            conn.instanceFollowRedirects = false
            assertEquals(200, conn.responseCode, "/portal/info should be permitAll and return 200 anonymously")
        } finally {
            conn.disconnect()
        }
    }

    @Test
    fun `Playwright suite passes`() {
        val frontendDir = Path.of("frontend").toAbsolutePath()
        val playwright = PlaywrightContainer.create(
            frontendDir = frontendDir,
            network = network,
            // Inside the docker network — playwright reaches portal via
            // the alias, no host port indirection.
            baseUrl = "http://${PortalContainer.NETWORK_ALIAS}:${PortalContainer.INTERNAL_PORT}",
            keycloakUrl = KEYCLOAK_INTERNAL_URL,
            adminUsername = E2E_ADMIN_USERNAME,
            adminPassword = e2eAdminPassword,
            viewerUsername = E2E_VIEWER_USERNAME,
            viewerPassword = e2eViewerPassword,
            testClientId = KEYCLOAK_DIRECT_GRANT_CLIENT,
            testClientSecret = keycloakDirectGrantSecret,
            testFilter = System.getProperty("e2e.testFilter")?.takeIf { it.isNotBlank() },
        )
        try {
            playwright.start()
            // OneShotStartupCheckStrategy returns when the container exits.
            val exit = playwright.containerInfo.state.exitCodeLong ?: -1L
            assertEquals(0L, exit, "Playwright container must exit 0")
        } finally {
            runCatching { playwright.stop() }
        }
    }
}
