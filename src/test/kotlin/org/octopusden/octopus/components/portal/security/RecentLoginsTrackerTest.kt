package org.octopusden.octopus.components.portal.security

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Unit tests for [RecentLoginsTracker] — a plain in-memory ring buffer, no Spring
 * context. A fixed [Clock] makes the recorded timestamps deterministic.
 */
class RecentLoginsTrackerTest {
    private val fixedInstant = Instant.parse("2026-06-27T10:00:00Z")
    private val clock = Clock.fixed(fixedInstant, ZoneOffset.UTC)

    @Test
    fun `records a login and returns it in the snapshot`() {
        val tracker = RecentLoginsTracker(capacity = 10, clock = clock)
        tracker.record("alice")

        val snapshot = tracker.snapshot()
        assertEquals(1, snapshot.size)
        assertEquals("alice", snapshot[0].username)
        assertEquals(fixedInstant, snapshot[0].loginAt)
    }

    @Test
    fun `snapshot is newest-first`() {
        val tracker = RecentLoginsTracker(capacity = 10, clock = clock)
        tracker.record("alice")
        tracker.record("bob")
        tracker.record("carol")

        assertEquals(listOf("carol", "bob", "alice"), tracker.snapshot().map { it.username })
    }

    @Test
    fun `bounded capacity drops the oldest entries`() {
        val tracker = RecentLoginsTracker(capacity = 3, clock = clock)
        listOf("a", "b", "c", "d", "e").forEach(tracker::record)

        // Only the 3 most-recent survive, newest-first.
        assertEquals(listOf("e", "d", "c"), tracker.snapshot().map { it.username })
    }

    @Test
    fun `recording the same user again collapses to one row at the front`() {
        val tracker = RecentLoginsTracker(capacity = 10, clock = clock)
        tracker.record("alice")
        tracker.record("bob")
        tracker.record("alice")

        // alice is deduped and moved to the front — no duplicate row.
        assertEquals(listOf("alice", "bob"), tracker.snapshot().map { it.username })
    }

    @Test
    fun `snapshot is an immutable copy decoupled from later records`() {
        val tracker = RecentLoginsTracker(capacity = 10, clock = clock)
        tracker.record("alice")
        val snapshot = tracker.snapshot()
        tracker.record("bob")

        // The earlier snapshot must not reflect the later record.
        assertEquals(listOf("alice"), snapshot.map { it.username })
    }

    @Test
    fun `concurrent records never exceed capacity and do not throw`() {
        val capacity = 10
        val tracker = RecentLoginsTracker(capacity = capacity, clock = clock)
        val threads = 16
        val perThread = 100
        val pool = Executors.newFixedThreadPool(threads)
        val start = CountDownLatch(1)
        repeat(threads) { t ->
            pool.submit {
                start.await()
                repeat(perThread) { i -> tracker.record("user-$t-$i") }
            }
        }
        start.countDown()
        pool.shutdown()
        assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS))

        assertEquals(capacity, tracker.snapshot().size)
    }
}
