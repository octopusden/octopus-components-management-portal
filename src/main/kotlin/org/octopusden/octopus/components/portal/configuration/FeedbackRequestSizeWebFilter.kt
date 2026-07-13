package org.octopusden.octopus.components.portal.configuration

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.core.io.buffer.DataBuffer
import org.springframework.core.io.buffer.DataBufferUtils
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.server.reactive.ServerHttpRequestDecorator
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.server.ServerWebExchange
import org.springframework.web.server.WebFilter
import org.springframework.web.server.WebFilterChain
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import java.util.concurrent.atomic.AtomicLong

/**
 * SYS-062: PRIMARY body-size guard for the feedback submit endpoint. The gateway is the
 * internet-facing edge, so the hard limit belongs here (CRS carries a second-line guard
 * for direct access). Scoped to `POST /rest/api/4/feedback` only — every other proxied
 * route keeps the container defaults.
 *
 * Enforced two ways so a chunked upload (no `Content-Length`) cannot slip past:
 *  1. A declared `Content-Length` over the cap → reject `413` immediately.
 *  2. Otherwise the request body is decorated with a byte counter that errors with
 *     `413` the moment the cap is exceeded mid-stream.
 *
 * Ordered ahead of Spring Cloud Gateway's routing so the check runs before the body is
 * proxied downstream.
 */
// Run ahead of Spring Cloud Gateway's routing (and any body-caching filter) so the size
// guard wraps the body first. HIGHEST_PRECEDENCE + a small offset leaves room for anything
// that must genuinely precede it. File-level so the class-level @Order can resolve it.
private const val ORDER_OFFSET = 100
private const val FEEDBACK_SIZE_FILTER_ORDER = Ordered.HIGHEST_PRECEDENCE + ORDER_OFFSET

@Component
@Order(FEEDBACK_SIZE_FILTER_ORDER)
class FeedbackRequestSizeWebFilter(
    @Value("\${portal.feedback.max-request-bytes:12582912}")
    private val maxRequestBytes: Long,
) : WebFilter {
    override fun filter(
        exchange: ServerWebExchange,
        chain: WebFilterChain,
    ): Mono<Void> {
        val request = exchange.request
        val isFeedbackPost =
            request.method == HttpMethod.POST && request.uri.path.trimEnd('/').endsWith(FEEDBACK_PATH)
        return if (isFeedbackPost) enforceLimit(exchange, chain) else chain.filter(exchange)
    }

    private fun enforceLimit(
        exchange: ServerWebExchange,
        chain: WebFilterChain,
    ): Mono<Void> {
        val request = exchange.request
        val declared = request.headers.contentLength
        if (declared in 0..Long.MAX_VALUE && declared > maxRequestBytes) {
            LOG.warn("Rejected feedback submission: Content-Length {} exceeds cap {}", declared, maxRequestBytes)
            return Mono.error(tooLarge())
        }

        val counted = AtomicLong(0)
        val decorated =
            object : ServerHttpRequestDecorator(request) {
                override fun getBody(): Flux<DataBuffer> =
                    super.getBody().map { buffer ->
                        if (counted.addAndGet(buffer.readableByteCount().toLong()) > maxRequestBytes) {
                            DataBufferUtils.release(buffer)
                            LOG.warn("Rejected feedback submission: streamed body exceeds cap {}", maxRequestBytes)
                            throw tooLarge()
                        }
                        buffer
                    }
            }
        return chain.filter(exchange.mutate().request(decorated).build())
    }

    private fun tooLarge(): ResponseStatusException =
        ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Feedback payload too large")

    companion object {
        private val LOG = LoggerFactory.getLogger(FeedbackRequestSizeWebFilter::class.java)
        private const val FEEDBACK_PATH = "/rest/api/4/feedback"
    }
}
