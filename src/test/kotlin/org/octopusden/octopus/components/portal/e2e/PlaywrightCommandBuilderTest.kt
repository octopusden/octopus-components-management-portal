package org.octopusden.octopus.components.portal.e2e

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertContentEquals
import kotlin.test.assertTrue

class PlaywrightCommandBuilderTest {

    @Test
    fun `command stays the bare playwright invocation when filter is null`() {
        assertContentEquals(
            arrayOf("npx", "playwright", "test"),
            buildPlaywrightCommand(null),
        )
    }

    @Test
    fun `command stays the bare playwright invocation when filter is blank`() {
        assertContentEquals(
            arrayOf("npx", "playwright", "test"),
            buildPlaywrightCommand("   "),
        )
    }

    @Test
    fun `non-empty spec-path filter is appended as positional arg`() {
        assertContentEquals(
            arrayOf("npx", "playwright", "test", "e2e/visual/header.spec.ts"),
            buildPlaywrightCommand("e2e/visual/header.spec.ts"),
        )
    }

    @Test
    fun `option-style filter is rejected`() {
        val ex = assertThrows<IllegalArgumentException> { buildPlaywrightCommand("--grep=Login") }
        assertTrue(ex.message!!.contains("spec path"))
    }

    @Test
    fun `single-dash option-style filter is rejected`() {
        assertThrows<IllegalArgumentException> { buildPlaywrightCommand("-x") }
    }
}
