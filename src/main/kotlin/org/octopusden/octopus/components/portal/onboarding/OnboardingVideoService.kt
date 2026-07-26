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
import java.nio.file.Path
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
@Suppress("TooManyFunctions") // cohesive service: small state accessors + the load lifecycle
class OnboardingVideoService(
    private val props: OnboardingVideoProperties,
) {
    enum class Status { DISABLED, LOADING, READY, FAILED }

    private val status = AtomicReference(if (isConfigured()) Status.LOADING else Status.DISABLED)
    private val videoRef = AtomicReference<ByteArrayResource?>(null)
    private val posterRef = AtomicReference<ByteArrayResource?>(null)

    @Volatile
    private var posterContentTypeValue: String? = null

    /**
     * Deletes the throwaway per-attempt clone dir. A settable seam (default = real recursive
     * delete) so a test can deterministically simulate the JGit detached-auto-GC deletion race
     * that [deleteAttemptDirSafely] swallows — without depending on GC timing. `@Volatile`
     * mirrors [posterContentTypeValue]: set once, but load() may run on boundedElastic.
     */
    @Volatile
    internal var deleteAttemptDir: (Path) -> Unit = { FileSystemUtils.deleteRecursively(it) }

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
        log.info("Onboarding video: loading from {} (async, non-fatal)", sanitizeUrl(props.vcs.root))
        Mono.fromRunnable<Void> { load() }
            .subscribeOn(Schedulers.boundedElastic())
            .retryWhen(Retry.backoff(props.retryMaxAttempts, Duration.ofMillis(props.retryBackoffMs)))
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
    @Suppress("TooGenericExceptionCaught") // fail-soft: any load failure must flip to FAILED, never propagate
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
                // Bound a hung transport so the attempt fails (→ retry → FAILED) instead of
                // hanging in LOADING forever; the whole point of the FAILED state + scheduled retry.
                .setTimeout(props.cloneTimeoutSeconds)
            props.vcs.branch.takeIf { it.isNotBlank() }?.let { clone.setBranch(it) }
            props.vcs.username?.takeIf { it.isNotBlank() }?.let {
                clone.setCredentialsProvider(UsernamePasswordCredentialsProvider(it, props.vcs.password))
            }
            clone.call().use { /* close the Git handle; we only need the working tree files */ }

            val videoBytes = readMediaFile(attemptDir, props.path)
            val poster = props.posterPath.takeIf { it.isNotBlank() }?.let {
                ByteArrayResource(readMediaFile(attemptDir, it))
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
            deleteAttemptDirSafely(attemptDir)
        }
    }

    /**
     * Best-effort deletion of the throwaway per-attempt clone dir. By the time this runs the
     * video is already in memory (status READY), so a failure to delete a temp dir must NOT
     * fail an otherwise-successful load. JGit fires a *detached* auto-GC after the clone; that
     * background thread deletes `.git/gc.log.lock` and can race the recursive walk, throwing
     * NoSuchFileException (TC build 1.0.4-831). A leftover dir is harmless — it's unique per
     * attempt — so swallow-and-log rather than propagate.
     */
    @Suppress("TooGenericExceptionCaught") // best-effort cleanup must swallow ANY delete failure
    private fun deleteAttemptDirSafely(attemptDir: Path) {
        try {
            deleteAttemptDir(attemptDir)
        } catch (e: Exception) {
            log.warn("Onboarding video: failed to delete temp clone dir {} (ignored)", attemptDir, e)
        }
    }

    /**
     * Resolves a configured media path inside the clone and reads it into memory, with
     * defense-in-depth even though props.path/posterPath come from trusted service-config:
     *  - lexical `../` containment, then symlink-safe real-path containment (`toRealPath`
     *    resolves every symlink; a committed symlink pointing outside the clone therefore
     *    fails the check) so a repo commit can't make the portal read arbitrary host files;
     *  - a size cap checked BEFORE the read so an oversized commit can't exhaust the heap.
     */
    private fun readMediaFile(base: java.nio.file.Path, relative: String): ByteArray {
        val resolved = base.resolve(relative).normalize()
        require(resolved.startsWith(base)) { "configured path '$relative' escapes the repo working tree" }
        require(!Files.isSymbolicLink(resolved)) { "configured path '$relative' is a symlink" }
        val real = resolved.toRealPath()
        require(real.startsWith(base.toRealPath())) { "configured path '$relative' resolves outside the repo" }
        val size = Files.size(real)
        require(size <= props.maxBytes) { "media file '$relative' is $size bytes, exceeds max ${props.maxBytes}" }
        return Files.readAllBytes(real)
    }

    // Strips any user:password@ userinfo from a git URL so credentials embedded in the URL
    // can't leak into logs (our config uses a separate credentials provider, but be safe).
    private fun sanitizeUrl(url: String): String = Regex("(://)[^@/]*@").replace(url, "$1")

    private fun contentTypeFor(path: String, table: Map<String, String>, fallback: String): String {
        val ext = path.substringAfterLast('.', "").lowercase()
        return table[ext] ?: fallback
    }

    companion object {
        private val log = LoggerFactory.getLogger(OnboardingVideoService::class.java)
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
