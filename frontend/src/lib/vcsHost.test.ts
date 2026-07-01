import { describe, it, expect } from 'vitest'
import { hostOf, isVcsHostSupported } from './vcsHost'

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
