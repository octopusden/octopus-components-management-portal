import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { readSeen, shouldShowCoachmark, useOnboardingSeen, type OnboardingSeenState } from './onboardingSeen'

const mockUser = vi.fn()
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUser(),
}))

const KEY = 'octopus.portal.onboardingVideoSeen.alice'

beforeEach(() => {
  localStorage.clear()
  mockUser.mockReturnValue({ data: { username: 'alice' } })
})

describe('readSeen', () => {
  it('returns a pending default for a first-time user', () => {
    expect(readSeen('alice')).toEqual({ status: 'pending' })
  })

  it('round-trips a persisted state', () => {
    localStorage.setItem(KEY, JSON.stringify({ status: 'done' }))
    expect(readSeen('alice')).toEqual({ status: 'done' })
  })

  it('falls back to pending on a malformed status', () => {
    localStorage.setItem(KEY, JSON.stringify({ status: 'bogus' }))
    expect(readSeen('alice')).toEqual({ status: 'pending' })
  })
})

describe('shouldShowCoachmark', () => {
  const cases: Array<[OnboardingSeenState | null, boolean]> = [
    [null, false], // storage unavailable / not hydrated → fail-closed
    [{ status: 'pending' }, true],
    [{ status: 'done' }, false],
    [{ status: 'dismissed' }, false],
  ]
  it.each(cases)('state %o → %s', (state, expected) => {
    expect(shouldShowCoachmark(state)).toBe(expected)
  })
})

describe('useOnboardingSeen', () => {
  it('fails closed while the user is not loaded', () => {
    mockUser.mockReturnValue({ data: undefined })
    const { result } = renderHook(() => useOnboardingSeen())
    expect(result.current.state).toBeNull()
    expect(result.current.shouldShow).toBe(false)
  })

  it('markDone persists done (never show again)', () => {
    const { result } = renderHook(() => useOnboardingSeen())
    act(() => result.current.markDone())
    expect(result.current.state?.status).toBe('done')
    expect(result.current.shouldShow).toBe(false)
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('done')
  })

  it('dismissForever persists dismissed (never show again)', () => {
    const { result } = renderHook(() => useOnboardingSeen())
    act(() => result.current.dismissForever())
    expect(result.current.state?.status).toBe('dismissed')
    expect(result.current.shouldShow).toBe(false)
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('dismissed')
  })
})
