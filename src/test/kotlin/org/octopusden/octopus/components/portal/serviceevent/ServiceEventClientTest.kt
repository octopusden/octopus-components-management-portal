package org.octopusden.octopus.components.portal.serviceevent

import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.octopusden.octopus.components.portal.validation.ValidationProperties
import java.net.InetSocketAddress
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * SYS-061: the portal reports events to CRS only when enabled + a token is configured
 * (fail-closed mirror of the CRS ingest gate), and sends the shared-secret header.
 */
class ServiceEventClientTest {
    private lateinit var server: HttpServer
    private val requests = mutableListOf<CapturedRequest>()
    private lateinit var latch: CountDownLatch

    data class CapturedRequest(val path: String, val token: String?, val body: String)

    @BeforeEach
    fun start() {
        latch = CountDownLatch(1)
        server = HttpServer.create(InetSocketAddress(0), 0)
        server.createContext("/") { ex ->
            val body = ex.requestBody.readBytes().decodeToString()
            requests += CapturedRequest(ex.requestURI.path, ex.requestHeaders.getFirst("X-Service-Event-Token"), body)
            ex.sendResponseHeaders(202, -1)
            ex.close()
            latch.countDown()
        }
        server.start()
    }

    @AfterEach
    fun stop() = server.stop(0)

    private fun client(
        token: String,
    ): ServiceEventClient {
        val validation = ValidationProperties().apply { registryBaseUrl = "http://localhost:${server.address.port}" }
        val props = ServiceEventReportingProperties().apply { this.token = token }
        return ServiceEventClient(validation, props)
    }

    @Test
    fun `reports startup with the shared-secret header when a token is configured`() {
        client(token = "secret").reportStartup("1.2.3")
        assertTrue(latch.await(3, TimeUnit.SECONDS), "expected a POST to CRS")
        val req = requests.single()
        assertEquals("/rest/api/4/admin/service-events", req.path)
        assertEquals("secret", req.token)
        assertTrue(req.body.contains("\"STARTUP\""))
        assertTrue(req.body.contains("\"portal\""))
        assertTrue(req.body.contains("1.2.3"))
    }

    @Test
    fun `reports an onboarding video view as a portal user-event`() {
        client(token = "secret").reportVideoView("alice")
        assertTrue(latch.await(3, TimeUnit.SECONDS), "expected a POST to CRS")
        val req = requests.single()
        assertEquals("/rest/api/4/admin/service-events", req.path)
        assertEquals("secret", req.token)
        assertTrue(req.body.contains("\"ONBOARDING_VIDEO_VIEW\""))
        assertTrue(req.body.contains("\"portal\""))
        assertTrue(req.body.contains("\"alice\""))
    }

    @Test
    fun `does not call CRS when token is blank (fail-closed = off)`() {
        client(token = "").reportStartup("1.2.3")
        assertFalse(latch.await(1, TimeUnit.SECONDS), "must not POST without a configured token")
        assertTrue(requests.isEmpty())
    }
}
