package org.octopusden.octopus.components.portal.configuration

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Config for the onboarding presentation video (see OnboardingVideoService).
 *
 * The video (and optional poster) lives in a small dedicated git repo (Bitbucket),
 * NOT in the portal jar. At startup the portal clones it once and holds the bytes in
 * memory, then serves them same-origin so the browser needs no cross-origin access or
 * credentials. This mirrors how CRS loads the components-registry DSL repo
 * (`components-registry.vcs.*` + JGit) — same config shape on purpose.
 *
 * A blank [vcs] root (or `enabled=false`) turns the whole feature off: nothing is cloned
 * and the SPA hides the button/coachmark. Per-env values come from service-config; the
 * VCS credentials are secrets (Vault → env). Local/dev/PR-CI leave root blank → off, so
 * tests never touch the network.
 */
@ConfigurationProperties(prefix = "portal.onboarding-video")
class OnboardingVideoProperties {
    var enabled: Boolean = true

    var vcs: VcsSettings = VcsSettings()

    /** Parent directory for the transient clone; a unique temp dir is created under it per attempt. */
    var workDir: String = "/tmp/portal-onboarding-video"

    /** Path of the video file within the repo (e.g. `intro.mp4`). */
    var path: String = "intro.mp4"

    /** Optional path of a poster image within the repo. Blank → no poster (player uses the first frame). */
    var posterPath: String = ""

    /** Milliseconds between server-side re-attempts while the status is FAILED. Default 30 min. */
    var retryIntervalMs: Long = 1_800_000

    /** Max attempts for the initial startup load's bounded retry (Reactor backoff). */
    var retryMaxAttempts: Long = 3

    /** Base backoff between initial-load retry attempts, in milliseconds. */
    var retryBackoffMs: Long = 5_000

    /**
     * JGit transport timeout (seconds) per clone. Bounds a hung git connection so the load
     * actually fails (→ retry → FAILED) instead of leaving the status stuck at LOADING forever.
     */
    var cloneTimeoutSeconds: Int = 60

    /**
     * Hard cap (bytes) on the video/poster file read into memory. A bad/oversized commit is
     * rejected before allocation so it can't exhaust the heap. Default 50 MiB.
     */
    var maxBytes: Long = 52_428_800

    class VcsSettings {
        /** Git repo URL. Blank → feature disabled. */
        var root: String = ""
        var username: String? = null
        var password: String = ""

        /** Branch to check out. Blank → clone the remote's default branch (HEAD). */
        var branch: String = ""
    }
}
