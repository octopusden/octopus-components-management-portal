package org.octopusden.octopus.components.portal.onboarding

import org.eclipse.jgit.api.Git
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider
import org.octopusden.octopus.components.portal.configuration.OnboardingVideoProperties
import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.core.io.ByteArrayResource
import org.springframework.core.io.Resource
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.util.FileSystemUtils
import reactor.core.publisher.Mono
import reactor.core.scheduler.Schedulers
import reactor.util.retry.Retry
import java.nio.file.Files
import java.nio.file.Paths
import java.time.Duration
import java.util.concurrent.atomic.AtomicReference

/**
 * Loads the onboarding presentation video (and optional poster) from a small dedicated
 * git repo into memory at startup, then serves the bytes same-origin via
 * [org.octopusden.octopus.components.portal.controller.OnboardingVideoController].
 *
 * Mirrors CRS's `GitVcsServiceImpl`: JGit clone (+ optional username/password) into a
 * transient work dir, read the file(s), drop the clone. The video is ~11 MB, so holding
 * it in an [AtomicReference] costs nothing and gives HTTP Range support for free (Spring
 * serves a [Resource] with `206 Partial Content`).
 *
 * Lifecycle is fail-soft so a broken/unreachable repo never blocks boot:
 *  - [ApplicationReadyEvent] kicks off the clone on [Schedulers.boundedElastic] (JGit is
 *    blocking) with a short bounded retry. Boot does not wait for it.
 *  - Status is a 4-state machine consumed by `/portal/config`:
 *      DISABLED — off (`enabled=false` or blank root); terminal by config.
 *      LOADING  — configured, load in progress / retries not yet exhausted.
 *      READY    — bytes in memory; terminal success.
 *      FAILED   — retries exhausted; terminal until the scheduled re-attempt.
 *  - While FAILED, [scheduledRetry] re-attempts on a long interval so a repo that comes
 *    back online recovers WITHOUT a portal restart — and without the SPA polling as a
 *    backend retry mechanism.
 */
@Service
class OnboardingVideoService(
    private val props: OnboardingVideoProperties,
) {
    enum class Status { DISABLED, LOADING, READY, FAILED }

    private val status = AtomicReference(if (isConfigured()) Status.LOADING else Status.DISABLED)
    private val videoRef = AtomicReference<ByteArrayResource?>(null)
    private val posterRef = AtomicReference<ByteArrayResource?>(null)

    @Volatile
    private var posterContentTypeValue: String? = null

    fun status(): Status = status.get()

    fun videoResource(): Resource? = videoRef.get().takeIf { status.get() == Status.READY }

    fun videoContentType(): String = contentTypeFor(props.path, VIDEO_TYPES, "video/mp4")

    fun posterResource(): Resource? = posterRef.get().takeIf { status.get() == Status.READY }

    fun posterContentType(): String? = posterContentTypeValue

    fun hasPoster(): Boolean = status.get() == Status.READY && posterRef.get() != null

    private fun isConfigured(): Boolean = props.enabled && props.vcs.root.isNotBlank()

    /** Kicks off the initial load without blocking boot. */
    @EventListener(ApplicationReadyEvent::class)
    fun onApplicationReady() {
        if (!isConfigured()) {
            log.info("Onboarding video disabled (enabled={}, root blank={})", props.enabled, props.vcs.root.isBlank())
            return
        }
        log.info("Onboarding video: loading from {} (async, non-fatal)", props.vcs.root)
        Mono.fromRunnable<Void> { load() }
            .subscribeOn(Schedulers.boundedElastic())
            .retryWhen(Retry.backoff(MAX_RETRIES, Duration.ofSeconds(RETRY_BACKOFF_SECONDS)))
            .doOnError { e ->
                status.set(Status.FAILED)
                log.warn("Onboarding video: load failed after retries (status=FAILED until next scheduled attempt)", e)
            }
            .onErrorComplete()
            .subscribe()
    }

    /**
     * Server-side recovery while FAILED. Runs on a long interval (not the SPA) so a repo
     * that recovers is picked up without a restart. No-op unless currently FAILED.
     */
    @Scheduled(
        fixedDelayString = "\${portal.onboarding-video.retry-interval-ms:1800000}",
        initialDelayString = "\${portal.onboarding-video.retry-interval-ms:1800000}",
    )
    fun scheduledRetry() {
        if (status.get() == Status.FAILED) {
            log.info("Onboarding video: scheduled re-attempt (previous load FAILED)")
            tryLoadSafely()
        }
    }

    /**
     * Single load attempt with its own status handling: LOADING → READY on success,
     * → FAILED on any error (never throws). Returns true on success. Used by the scheduled
     * retry and directly by tests.
     */
    fun tryLoadSafely(): Boolean {
        if (!isConfigured()) {
            status.set(Status.DISABLED)
            return false
        }
        status.set(Status.LOADING)
        return try {
            load()
            true
        } catch (e: Exception) {
            status.set(Status.FAILED)
            log.warn("Onboarding video: load attempt failed", e)
            false
        }
    }

    /**
     * Clones into a UNIQUE temp dir per attempt and always deletes it in `finally`, so a
     * clone/read that fails midway can never leave a partial dir that breaks the next retry.
     * Sets the in-memory refs and flips status to READY on success; throws otherwise.
     */
    private fun load() {
        val parent = Paths.get(props.workDir)
        Files.createDirectories(parent)
        val attemptDir = Files.createTempDirectory(parent, "clone-")
        try {
            val clone = Git.cloneRepository()
                .setURI(props.vcs.root)
                .setDirectory(attemptDir.toFile())
                .setDepth(1)
            props.vcs.branch.takeIf { it.isNotBlank() }?.let { clone.setBranch(it) }
            props.vcs.username?.takeIf { it.isNotBlank() }?.let {
                clone.setCredentialsProvider(UsernamePasswordCredentialsProvider(it, props.vcs.password))
            }
            clone.call().use { /* close the Git handle; we only need the working tree files */ }

            val videoBytes = Files.readAllBytes(attemptDir.resolve(props.path))
            val poster = props.posterPath.takeIf { it.isNotBlank() }?.let {
                ByteArrayResource(Files.readAllBytes(attemptDir.resolve(it)))
            }
            videoRef.set(ByteArrayResource(videoBytes))
            posterRef.set(poster)
            posterContentTypeValue = props.posterPath.takeIf { it.isNotBlank() }
                ?.let { contentTypeFor(it, IMAGE_TYPES, "application/octet-stream") }
            status.set(Status.READY)
            log.info(
                "Onboarding video: loaded {} bytes{} into memory",
                videoBytes.size,
                if (poster != null) " (+poster ${poster.byteArray.size} bytes)" else "",
            )
        } finally {
            FileSystemUtils.deleteRecursively(attemptDir)
        }
    }

    private fun contentTypeFor(path: String, table: Map<String, String>, fallback: String): String {
        val ext = path.substringAfterLast('.', "").lowercase()
        return table[ext] ?: fallback
    }

    companion object {
        private val log = LoggerFactory.getLogger(OnboardingVideoService::class.java)
        private const val MAX_RETRIES = 3L
        private const val RETRY_BACKOFF_SECONDS = 5L
        private val VIDEO_TYPES = mapOf("mp4" to "video/mp4", "webm" to "video/webm", "mov" to "video/quicktime")
        private val IMAGE_TYPES = mapOf(
            "png" to "image/png",
            "jpg" to "image/jpeg",
            "jpeg" to "image/jpeg",
            "webp" to "image/webp",
            "gif" to "image/gif",
        )
    }
}
