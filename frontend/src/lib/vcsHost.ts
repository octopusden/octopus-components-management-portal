// VCS-host allowlist check: a component's VCS URL must point at the ecosystem's
// Bitbucket host (service-config `portal.external-links.git-base-url` =
// `${bitbucket.host}`, surfaced to the SPA via /portal/links → gitBaseUrl).
// vcs-facade.yml's canonical base is `ssh://git@bitbucket${domain.sub}.${domain.main}`.
// This is a friendly pre-flight check; the URL itself is otherwise free-form.

/**
 * Extract the lowercased host from an ssh:// or https:// URL, ignoring userinfo
 * and port. Returns null when the value can't be parsed as a URL with a host.
 */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url.trim()).hostname
    return host ? host.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * True when `vcsUrl`'s host equals the bitbucket host derived from `gitBaseUrl`.
 * Skips (returns true) when either side has no parseable host — gitBaseUrl may
 * be absent in a misconfigured/anonymous environment, and an unparseable vcsUrl
 * is already caught by the ssh:// format rule, so we don't double-report it.
 */
export function isVcsHostSupported(
  vcsUrl: string,
  gitBaseUrl: string | null | undefined,
): boolean {
  const allowed = hostOf(gitBaseUrl)
  if (!allowed) return true
  const actual = hostOf(vcsUrl)
  if (!actual) return true
  return actual === allowed
}
