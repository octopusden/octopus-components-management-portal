package org.octopusden.octopus.components.portal.e2e

import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.Network
import org.testcontainers.containers.output.Slf4jLogConsumer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.utility.DockerImageName
import org.slf4j.LoggerFactory
import java.nio.file.Path
import java.time.Duration

/**
 * Portal as a Testcontainers container on the same docker network as
 * Keycloak / CRS. Browses Keycloak via the docker DNS alias `keycloak`
 * — no `/etc/hosts` entry required on the host or any agent. The bootJar
 * is bind-mounted into a stock JRE image, so the e2e gate doesn't need a
 * fresh `dockerBuildImage` run every time.
 */
object PortalContainer {

    private val log = LoggerFactory.getLogger(PortalContainer::class.java)

    const val NETWORK_ALIAS = "portal"
    const val INTERNAL_PORT = 18090
    const val MANAGEMENT_PORT = 18091

    fun create(
        bootJar: Path,
        network: Network,
        dockerRegistry: String,
        authServerUrl: String,
        authServerRealm: String,
        authServerClientId: String,
        authServerClientSecret: String,
        componentsRegistryServiceUrl: String,
    ): GenericContainer<*> {
        check(bootJar.toFile().isFile) { "bootJar not found at $bootJar — run :bootJar first" }

        return GenericContainer(DockerImageName.parse("$dockerRegistry/eclipse-temurin:25-jdk"))
            .withNetwork(network)
            .withNetworkAliases(NETWORK_ALIAS)
            .withExposedPorts(INTERNAL_PORT, MANAGEMENT_PORT)
            .withEnv(
                mapOf(
                    "AUTH_SERVER_URL" to authServerUrl,
                    "AUTH_SERVER_REALM" to authServerRealm,
                    "AUTH_SERVER_CLIENT_ID" to authServerClientId,
                    "AUTH_SERVER_CLIENT_SECRET" to authServerClientSecret,
                    "COMPONENTS_REGISTRY_SERVICE_URL" to componentsRegistryServiceUrl,
                    "SPRING_PROFILES_ACTIVE" to "e2e",
                    "SERVER_PORT" to INTERNAL_PORT.toString(),
                    "MANAGEMENT_SERVER_PORT" to MANAGEMENT_PORT.toString(),
                    // Defensive: bootstrap.yml refers to ${VAULT_TOKEN}; the
                    // CLI bootstrap-bypass below disables the bootstrap layer
                    // anyway, but a placeholder removes any chance of an
                    // early-binding NPE.
                    "VAULT_TOKEN" to "ignored-by-bootstrap-bypass",
                ),
            )
            .withFileSystemBind(
                bootJar.toAbsolutePath().toString(),
                "/app/app.jar",
                org.testcontainers.containers.BindMode.READ_ONLY,
            )
            .withCommand(
                "java",
                "-jar",
                "/app/app.jar",
                // Bootstrap bypass — same intent as src/test/resources/bootstrap.yml.
                "--spring.cloud.bootstrap.enabled=false",
                "--spring.cloud.config.enabled=false",
                "--spring.config.import=",
            )
            .waitingFor(
                Wait.forHttp("/actuator/health")
                    .forPort(MANAGEMENT_PORT)
                    .forStatusCode(200)
                    .withStartupTimeout(Duration.ofMinutes(3)),
            )
            .withLogConsumer(Slf4jLogConsumer(log))
    }
}
