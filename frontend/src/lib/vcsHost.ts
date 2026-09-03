// VCS-host helpers shared across the portal:
//
// 1. Allowlist check — a component's VCS URL must point at the ecosystem's
//    Bitbucket host (service-config `portal.external-links.git-base-url` =
//    `${bitbucket.host}`, surfaced to the SPA via /portal/links → gitBaseUrl).
//    vcs-facade.yml's canonical base is `ssh://git@bitbucket${domain.sub}.${domain.main}`.
//    This is a friendly pre-flight check; the URL itself is otherwise free-form.
// 2. Browse-URL derivation — turn a VcsEntry clone URL into the Bitbucket
//    Server /projects/<key>/repos/<repo> browser URL used for quick-links on
//    the component table and detail pages.

export interface BitbucketBrowseTarget {
  /** `${gitBaseUrl}/projects/PROJ/repos/repo` */
  url: string
  /** The project key extracted from the VCS path. */
  projectKey: string
  /** The repo slug extracted from the VCS path, `.git` suffix stripped. */
  repoName: string
}

/**
 * Build the Bitbucket Server browse URL for a VCS path.
 *
 * `vcsPath` is canonically a clone URL (ssh://git@host/PROJ/repo.git or
 * https://host/scm/PROJ/repo.git). Bitbucket's browse URL is
 * `${gitBaseUrl}/projects/PROJ/repos/repo`, so the key and slug are pulled
 * back out of the URL path.
 *
 * The last two path segments are used (not first + last) so that
 * context-path / `/scm/`-prefixed URLs also parse correctly. A trailing
 * `.git` suffix is stripped from the repo slug.
 *
 * Falls back to a plain slash split for legacy rows holding a bare
 * `PROJ/repo` — only rows created through CreateComponentPage are
 * guaranteed ssh:// (SSH_VCS_URL_REGEX); the edit form is free-form.
 *
 * Returns null when fewer than two path segments can be derived.
 */
export function bitbucketBrowseUrl(
  vcsPath: string | null | undefined,
  gitBaseUrl: string | null | undefined,
): BitbucketBrowseTarget | null {
  if (!vcsPath || !gitBaseUrl) return null
  let segments: string[]
  try {
    segments = new URL(vcsPath.trim()).pathname.split('/').filter(Boolean)
  } catch {
    segments = vcsPath.split('/').filter(Boolean)
  }
  if (segments.length < 2) return null
  const [projectKey, repo] = segments.slice(-2)
  const repoName = repo!.replace(/\.git$/, '')
  return {
    url: `${gitBaseUrl}/projects/${encodeURIComponent(projectKey!)}/repos/${encodeURIComponent(repoName)}`,
    projectKey: projectKey!,
    repoName,
  }
}

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
