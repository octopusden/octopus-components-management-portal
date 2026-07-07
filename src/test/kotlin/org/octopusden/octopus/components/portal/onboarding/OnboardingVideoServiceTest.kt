package org.octopusden.octopus.components.portal.onboarding

import org.eclipse.jgit.api.Git
import org.eclipse.jgit.lib.PersonIdent
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.octopusden.octopus.components.portal.configuration.OnboardingVideoProperties
import java.nio.file.Files
import java.nio.file.Path
import kotlin.streams.toList

/**
 * Network-free: every test builds a throwaway local git repo via JGit and points the
 * service's `vcs.root` at its file:// URI. No Spring context — the service is exercised
 * directly for fast, deterministic status-machine coverage.
 */
class OnboardingVideoServiceTest {

    private val videoBytes = byteArrayOf(0, 1, 2, 3, 4, 5, 6, 7, 8, 9)
    private val posterBytes = byteArrayOf(10, 20, 30, 40)

    private fun makeRepo(dir: Path, withPoster: Boolean = false) {
        Git.init().setDirectory(dir.toFile()).call().use { git ->
            Files.write(dir.resolve("intro.mp4"), videoBytes)
            git.add().addFilepattern("intro.mp4").call()
            if (withPoster) {
                Files.write(dir.resolve("poster.jpg"), posterBytes)
                git.add().addFilepattern("poster.jpg").call()
            }
            val who = PersonIdent("test", "test@example.com")
            git.commit().setMessage("fixture").setAuthor(who).setCommitter(who).call()
        }
    }

    private fun props(workDir: Path, root: String) = OnboardingVideoProperties().apply {
        this.workDir = workDir.toString()
        vcs.root = root
        retryIntervalMs = 60_000
        // Keep the async retry fast so the onApplicationReady() tests don't wait on backoff.
        retryMaxAttempts = 2
        retryBackoffMs = 1
    }

    /** Polls the service status until it matches [expected] or the timeout elapses. */
    private fun awaitStatus(service: OnboardingVideoService, expected: OnboardingVideoService.Status) {
        val deadline = System.currentTimeMillis() + 5_000
        while (System.currentTimeMillis() < deadline) {
            if (service.status() == expected) return
            Thread.sleep(25)
        }
        assertEquals(expected, service.status(), "status did not reach $expected within timeout")
    }

    /**
     * Waits until the async load's background `finally` cleanup has removed its `clone-*`
     * attempt dir from [workDir]. The status flips (READY/FAILED) BEFORE that cleanup runs on
     * the boundedElastic thread, so async tests must join on cleanup before returning —
     * otherwise it races JUnit's @TempDir teardown deleting the same tree.
     */
    private fun awaitCleanup(workDir: Path) {
        val deadline = System.currentTimeMillis() + 5_000
        while (System.currentTimeMillis() < deadline) {
            val remaining = Files.list(workDir).use { it.count() }
            if (remaining == 0L) return
            Thread.sleep(25)
        }
        val leftovers = Files.list(workDir).use { it.toList() }
        assertTrue(leftovers.isEmpty(), "async load left clone dirs behind: $leftovers")
    }

    @Test
    fun `blank root is DISABLED and never loads`(@TempDir tmp: Path) {
        val service = OnboardingVideoService(props(tmp, root = ""))
        assertEquals(OnboardingVideoService.Status.DISABLED, service.status())
        assertNull(service.videoResource())
        // onApplicationReady must be a no-op (does not block, stays DISABLED)
        service.onApplicationReady()
        assertEquals(OnboardingVideoService.Status.DISABLED, service.status())
    }

    @Test
    fun `enabled=false is DISABLED even with a root`(@TempDir tmp: Path) {
        val repo = Files.createDirectory(tmp.resolve("repo"))
        makeRepo(repo)
        val service = OnboardingVideoService(
            props(tmp, root = repo.toUri().toString()).apply { enabled = false },
        )
        assertEquals(OnboardingVideoService.Status.DISABLED, service.status())
    }

    @Test
    fun `successful clone reads the video into memory and becomes READY`(@TempDir tmp: Path) {
        val repo = Files.createDirectory(tmp.resolve("repo"))
        makeRepo(repo)
        val service = OnboardingVideoService(props(tmp, root = repo.toUri().toString()))

        assertTrue(service.tryLoadSafely())

        assertEquals(OnboardingVideoService.Status.READY, service.status())
        assertEquals("video/mp4", service.videoContentType())
        assertArrayEquals(videoBytes, service.videoResource()!!.inputStream.readBytes())
        assertFalse(service.hasPoster())
    }

    @Test
    fun `poster is loaded when poster-path is set`(@TempDir tmp: Path) {
        val repo = Files.createDirectory(tmp.resolve("repo"))
        makeRepo(repo, withPoster = true)
        val service = OnboardingVideoService(
            props(tmp, root = repo.toUri().toString()).apply { posterPath = "poster.jpg" },
        )

        assertTrue(service.tryLoadSafely())

        assertTrue(service.hasPoster())
        assertEquals("image/jpeg", service.posterContentType())
        assertArrayEquals(posterBytes, service.posterResource()!!.inputStream.readBytes())
    }

    @Test
    fun `unreachable root becomes FAILED without throwing`(@TempDir tmp: Path) {
        val service = OnboardingVideoService(props(tmp, root = tmp.resolve("does-not-exist").toUri().toString()))

        assertFalse(service.tryLoadSafely())

        assertEquals(OnboardingVideoService.Status.FAILED, service.status())
        assertNull(service.videoResource())
    }

    @Test
    fun `a failed attempt leaves no partial dir and a later attempt succeeds`(@TempDir tmp: Path) {
        val workDir = Files.createDirectory(tmp.resolve("work"))
        val repo = Files.createDirectory(tmp.resolve("repo"))
        makeRepo(repo)
        val p = props(workDir, root = tmp.resolve("nope").toUri().toString())
        val service = OnboardingVideoService(p)

        assertFalse(service.tryLoadSafely()) // FAILED

        // Fix the source; the retry must succeed and the work dir must not accumulate clones.
        p.vcs.root = repo.toUri().toString()
        assertTrue(service.tryLoadSafely())

        assertEquals(OnboardingVideoService.Status.READY, service.status())
        val leftovers = Files.list(workDir).use { it.toList() }
        assertTrue(leftovers.isEmpty(), "work dir should have no leftover clone dirs, found: $leftovers")
    }

    @Test
    fun `scheduled retry recovers a FAILED load once the source is reachable`(@TempDir tmp: Path) {
        val repo = Files.createDirectory(tmp.resolve("repo"))
        makeRepo(repo)
        val p = props(tmp, root = tmp.resolve("nope").toUri().toString())
        val service = OnboardingVideoService(p)

        assertFalse(service.tryLoadSafely()) // FAILED
        service.scheduledRetry() // still failing source → stays FAILED
        assertEquals(OnboardingVideoService.Status.FAILED, service.status())

        p.vcs.root = repo.toUri().toString()
        service.scheduledRetry() // source fixed → recovers

        assertEquals(OnboardingVideoService.Status.READY, service.status())
    }

    @Test
    fun `onApplicationReady loads asynchronously to READY`(@TempDir tmp: Path) {
        val repo = Files.createDirectory(tmp.resolve("repo"))
        makeRepo(repo)
        // Dedicated work dir + join on cleanup so the background finally-delete can't race
        // JUnit's @TempDir teardown of the same tree.
        val workDir = Files.createDirectory(tmp.resolve("work"))
        val service = OnboardingVideoService(props(workDir, root = repo.toUri().toString()))

        service.onApplicationReady() // returns immediately; load happens off-thread

        awaitStatus(service, OnboardingVideoService.Status.READY)
        assertArrayEquals(videoBytes, service.videoResource()!!.inputStream.readBytes())
        awaitCleanup(workDir)
    }

    @Test
    fun `onApplicationReady ends in FAILED after the async retries are exhausted`(@TempDir tmp: Path) {
        val workDir = Files.createDirectory(tmp.resolve("work"))
        val service = OnboardingVideoService(props(workDir, root = tmp.resolve("nope").toUri().toString()))

        service.onApplicationReady()

        awaitStatus(service, OnboardingVideoService.Status.FAILED)
        awaitCleanup(workDir)
    }

    @Test
    fun `a path escaping the repo is rejected (FAILED, nothing served)`(@TempDir tmp: Path) {
        val repo = Files.createDirectory(tmp.resolve("repo"))
        makeRepo(repo)
        val service = OnboardingVideoService(
            props(tmp, root = repo.toUri().toString()).apply { path = "../../etc/hosts" },
        )

        assertFalse(service.tryLoadSafely())

        assertEquals(OnboardingVideoService.Status.FAILED, service.status())
        assertNull(service.videoResource())
    }
}
