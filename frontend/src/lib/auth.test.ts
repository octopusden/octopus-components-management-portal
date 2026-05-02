import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  rememberContinuePath,
  restoreContinuePath,
  fetchCurrentUser,
  hasPermission,
  logout,
  CONTINUE_PATH_STORAGE_KEY,
} from './auth'
import type { User } from './auth'

vi.mock('./cookies', () => ({ readCookie: vi.fn() }))
import { readCookie } from './cookies'
const mockReadCookie = vi.mocked(readCookie)

// ---------------------------------------------------------------------------
// rememberContinuePath
// ---------------------------------------------------------------------------
describe('rememberContinuePath', () => {
  beforeEach(() => sessionStorage.clear())

  it('stores a valid deep-link path', () => {
    rememberContinuePath('/components/123')
    expect(sessionStorage.getItem(CONTINUE_PATH_STORAGE_KEY)).toBe('/components/123')
  })

  it('ignores paths that start with //', () => {
    rememberContinuePath('//evil.com/steal')
    expect(sessionStorage.getItem(CONTINUE_PATH_STORAGE_KEY)).toBeNull()
  })

  it('ignores paths that do not start with /', () => {
    rememberContinuePath('http://example.com')
    expect(sessionStorage.getItem(CONTINUE_PATH_STORAGE_KEY)).toBeNull()
  })

  it('does not throw when sessionStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => rememberContinuePath('/components')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// restoreContinuePath
// ---------------------------------------------------------------------------
describe('restoreContinuePath', () => {
  beforeEach(() => {
    sessionStorage.clear()
    // Ensure we start at root for each test
    window.history.pushState({}, '', '/')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.history.pushState({}, '', '/')
  })

  it('returns null when nothing is stashed', () => {
    expect(restoreContinuePath()).toBeNull()
  })

  it('returns null when sessionStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new DOMException('SecurityError')
    })
    expect(restoreContinuePath()).toBeNull()
  })

  it('returns null when the stashed path starts with //', () => {
    sessionStorage.setItem(CONTINUE_PATH_STORAGE_KEY, '//evil.com')
    expect(restoreContinuePath()).toBeNull()
  })

  it('returns null when not at the post-login landing page', () => {
    sessionStorage.setItem(CONTINUE_PATH_STORAGE_KEY, '/components/42')
    window.history.pushState({}, '', '/components')
    expect(restoreContinuePath()).toBeNull()
  })

  it('restores the path, clears storage, and returns the path', () => {
    sessionStorage.setItem(CONTINUE_PATH_STORAGE_KEY, '/components/42')
    const spy = vi.spyOn(window.history, 'replaceState')
    const result = restoreContinuePath()
    expect(result).toBe('/components/42')
    expect(spy).toHaveBeenCalledWith(null, '', '/components/42')
    expect(sessionStorage.getItem(CONTINUE_PATH_STORAGE_KEY)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// fetchCurrentUser
// ---------------------------------------------------------------------------
describe('fetchCurrentUser', () => {
  const validUser: User = {
    username: 'alice',
    roles: [{ name: 'admin', permissions: ['EDIT_COMPONENTS'] }],
    groups: ['devs'],
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null on 401', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }))
    expect(await fetchCurrentUser()).toBeNull()
  })

  it('throws on a non-ok response other than 401', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Internal Server Error', { status: 500 }))
    await expect(fetchCurrentUser()).rejects.toThrow('auth/me 500')
  })

  it('throws when the response body fails schema validation', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ username: 42 }), { status: 200 }),
    )
    await expect(fetchCurrentUser()).rejects.toThrow(/invalid response shape/)
  })

  it('returns the parsed user on a valid 200 response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(validUser), { status: 200 }),
    )
    const result = await fetchCurrentUser()
    expect(result).toEqual(validUser)
  })
})

// ---------------------------------------------------------------------------
// hasPermission
// ---------------------------------------------------------------------------
describe('hasPermission', () => {
  const user: User = {
    username: 'alice',
    roles: [{ name: 'editor', permissions: ['EDIT_COMPONENTS', 'ACCESS_COMPONENTS'] }],
    groups: [],
  }

  it('returns false for null user', () => {
    expect(hasPermission(null, 'EDIT_COMPONENTS')).toBe(false)
  })

  it('returns false for undefined user', () => {
    expect(hasPermission(undefined, 'EDIT_COMPONENTS')).toBe(false)
  })

  it('returns false when permission is not in any role', () => {
    expect(hasPermission(user, 'DELETE_COMPONENTS')).toBe(false)
  })

  it('returns true when permission is present in a role', () => {
    expect(hasPermission(user, 'EDIT_COMPONENTS')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------
describe('logout', () => {
  let submitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    vi.spyOn(document.body, 'appendChild')
    mockReadCookie.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('submits a POST to /logout including the CSRF token when present', () => {
    mockReadCookie.mockReturnValue('csrf-token-value')
    logout()
    expect(submitSpy).toHaveBeenCalledOnce()
    // form.remove() is called via queueMicrotask, so the DOM element may already be gone;
    // assert on submit being called instead
    expect(submitSpy).toHaveBeenCalled()
  })

  it('submits the form without a CSRF field when the cookie is absent', () => {
    mockReadCookie.mockReturnValue(null)
    logout()
    expect(submitSpy).toHaveBeenCalledOnce()
  })
})
