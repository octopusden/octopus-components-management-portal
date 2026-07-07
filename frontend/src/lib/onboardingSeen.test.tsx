import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  readSeen,
  shouldShowCoachmark,
  useOnboardingSeen,
  LATER_CAP,
  type OnboardingSeenState,
} from './onboardingSeen'

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
    expect(readSeen('alice')).toEqual({ status: 'pending', shownCount: 0 })
  })

  it('round-trips a persisted state', () => {
    localStorage.setItem(KEY, JSON.stringify({ status: 'later', shownCount: 2 }))
    expect(readSeen('alice')).toEqual({ status: 'later', shownCount: 2 })
  })

  it('falls back to pending on a malformed status', () => {
    localStorage.setItem(KEY, JSON.stringify({ status: 'bogus', shownCount: 1 }))
    expect(readSeen('alice')).toEqual({ status: 'pending', shownCount: 1 })
  })
})

describe('shouldShowCoachmark', () => {
  const cases: Array<[OnboardingSeenState | null, boolean]> = [
    [null, false], // storage unavailable / not hydrated → fail-closed
    [{ status: 'pending', shownCount: 0 }, true],
    [{ status: 'later', shownCount: LATER_CAP - 1 }, true],
    [{ status: 'later', shownCount: LATER_CAP }, false], // cap reached
    [{ status: 'done', shownCount: 0 }, false],
    [{ status: 'dismissed', shownCount: 0 }, false],
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

  it('markDone persists done and hides the coachmark', () => {
    const { result } = renderHook(() => useOnboardingSeen())
    act(() => result.current.markDone())
    expect(result.current.state?.status).toBe('done')
    expect(result.current.shouldShow).toBe(false)
    expect(JSON.parse(localStorage.getItem(KEY)!).status).toBe('done')
  })

  it('snoozeLater increments and caps to dismissed after LATER_CAP snoozes', () => {
    const { result } = renderHook(() => useOnboardingSeen())
    for (let i = 1; i < LATER_CAP; i++) {
      act(() => result.current.snoozeLater())
      expect(result.current.state).toEqual({ status: 'later', shownCount: i })
    }
    act(() => result.current.snoozeLater()) // hits the cap
    expect(result.current.state).toEqual({ status: 'dismissed', shownCount: LATER_CAP })
    expect(result.current.shouldShow).toBe(false)
  })

  it('dismissForever persists dismissed', () => {
    const { result } = renderHook(() => useOnboardingSeen())
    act(() => result.current.dismissForever())
    expect(result.current.state?.status).toBe('dismissed')
    expect(result.current.shouldShow).toBe(false)
  })
})
