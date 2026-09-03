import { describe, it, expect } from 'vitest'
import { hostOf, isVcsHostSupported, bitbucketBrowseUrl } from './vcsHost'

describe('hostOf', () => {
  it('extracts host from ssh URLs (ignoring user + port)', () => {
    expect(hostOf('ssh://git@bitbucket.example.com:7999/proj/repo.git')).toBe(
      'bitbucket.example.com',
    )
    expect(hostOf('ssh://bitbucket.example.com/proj/repo.git')).toBe(
      'bitbucket.example.com',
    )
  })
  it('extracts host from https URLs and lowercases', () => {
    expect(hostOf('https://Bitbucket.Example.com/')).toBe('bitbucket.example.com')
  })
  it('returns null for blank/unparseable', () => {
    expect(hostOf('')).toBeNull()
    expect(hostOf(undefined)).toBeNull()
    expect(hostOf('not a url')).toBeNull()
  })
})

describe('isVcsHostSupported', () => {
  const git = 'https://bitbucket.example.com'
  it('accepts a matching host (case/port/user-insensitive)', () => {
    expect(isVcsHostSupported('ssh://git@bitbucket.example.com:7999/p/r.git', git)).toBe(true)
  })
  it('rejects a different host', () => {
    expect(isVcsHostSupported('ssh://git@github.com/p/r.git', git)).toBe(false)
  })
  it('skips (true) when gitBaseUrl is absent/unparseable', () => {
    expect(isVcsHostSupported('ssh://git@anything/p/r.git', null)).toBe(true)
    expect(isVcsHostSupported('ssh://git@anything/p/r.git', '')).toBe(true)
  })
  it('skips (true) when the vcsUrl has no parseable host (format rule handles it)', () => {
    expect(isVcsHostSupported('not-a-url', git)).toBe(true)
  })
})

describe('bitbucketBrowseUrl', () => {
  const base = 'https://bitbucket.example.com'

  it('parses a full ssh clone URL', () => {
    const t = bitbucketBrowseUrl('ssh://git@bitbucket.example.com:7999/PROJ/repo.git', base)
    expect(t).not.toBeNull()
    expect(t!.url).toBe('https://bitbucket.example.com/projects/PROJ/repos/repo')
    expect(t!.projectKey).toBe('PROJ')
    expect(t!.repoName).toBe('repo')
  })

  it('parses a Bitbucket https clone URL with /scm/ prefix', () => {
    const t = bitbucketBrowseUrl('https://bitbucket.example.com/scm/PROJ/repo.git', base)
    expect(t!.url).toBe('https://bitbucket.example.com/projects/PROJ/repos/repo')
    expect(t!.projectKey).toBe('PROJ')
    expect(t!.repoName).toBe('repo')
  })

  it('parses a clone URL on a context path', () => {
    const t = bitbucketBrowseUrl('https://bb.example.com/bitbucket/scm/PROJ/repo.git', base)
    expect(t!.url).toBe('https://bitbucket.example.com/projects/PROJ/repos/repo')
    expect(t!.projectKey).toBe('PROJ')
    expect(t!.repoName).toBe('repo')
  })

  it('strips a trailing .git suffix only', () => {
    expect(bitbucketBrowseUrl('ssh://git@host/PROJ/repo', base)!.repoName).toBe('repo')
    expect(bitbucketBrowseUrl('ssh://git@host/PROJ/repo.git.git', base)!.repoName).toBe('repo.git')
  })

  it('falls back to slash split for legacy bare PROJ/repo values', () => {
    const t = bitbucketBrowseUrl('org/repo', base)
    expect(t!.url).toBe('https://bitbucket.example.com/projects/org/repos/repo')
    expect(t!.projectKey).toBe('org')
    expect(t!.repoName).toBe('repo')
  })

  it('returns null when fewer than two path segments exist', () => {
    expect(bitbucketBrowseUrl('ssh://git@host/PROJ', base)).toBeNull()
    expect(bitbucketBrowseUrl('standalone', base)).toBeNull()
  })

  it('returns null when inputs are missing', () => {
    expect(bitbucketBrowseUrl(null, base)).toBeNull()
    expect(bitbucketBrowseUrl(undefined, base)).toBeNull()
    expect(bitbucketBrowseUrl('ssh://git@host/PROJ/repo.git', null)).toBeNull()
    expect(bitbucketBrowseUrl('ssh://git@host/PROJ/repo.git', undefined)).toBeNull()
  })

  it('URL-encodes project key and repo name in the url', () => {
    const t = bitbucketBrowseUrl('ssh://git@host/proj%20key/repo%2Fname.git', base)
    expect(t!.url).toBe(
      'https://bitbucket.example.com/projects/proj%2520key/repos/repo%252Fname',
    )
    // The raw segments are still returned for display.
    expect(t!.projectKey).toBe('proj%20key')
    expect(t!.repoName).toBe('repo%2Fname')
  })
})
