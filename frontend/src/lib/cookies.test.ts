import { describe, it, expect, afterEach } from 'vitest'
import { readCookie } from './cookies'

describe('readCookie', () => {
  afterEach(() => {
    // Clear all cookies set during tests
    document.cookie.split(';').forEach((c) => {
      const key = c.trim().split('=')[0]
      document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
    })
  })

  it('returns null when document.cookie is empty', () => {
    expect(readCookie('XSRF-TOKEN')).toBeNull()
  })

  it('returns the cookie value when the cookie exists', () => {
    document.cookie = 'XSRF-TOKEN=abc123'
    expect(readCookie('XSRF-TOKEN')).toBe('abc123')
  })

  it('returns null for a cookie name that does not exist', () => {
    document.cookie = 'OTHER=xyz'
    expect(readCookie('XSRF-TOKEN')).toBeNull()
  })

  it('decodes URI-encoded cookie values', () => {
    document.cookie = 'SESSION=hello%20world'
    expect(readCookie('SESSION')).toBe('hello world')
  })
})
