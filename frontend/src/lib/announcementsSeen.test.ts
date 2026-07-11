import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnnouncementsSeen } from './announcementsSeen'

const mockUser = vi.fn()
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUser(),
}))

beforeEach(() => {
  localStorage.clear()
  mockUser.mockReturnValue({ data: { username: 'alice' } })
})

describe('useAnnouncementsSeen', () => {
  it('is ready with empty sets for a first-time user', () => {
    const { result } = renderHook(() => useAnnouncementsSeen())
    expect(result.current.ready).toBe(true)
    expect(result.current.seenAnnouncements).toEqual([])
    expect(result.current.seenSpotlights).toEqual([])
  })

  it('marks announcements seen (union merge, persisted per user)', () => {
    const { result } = renderHook(() => useAnnouncementsSeen())
    act(() => result.current.markAnnouncementsSeen(['a']))
    act(() => result.current.markAnnouncementsSeen(['a', 'b']))
    expect(result.current.seenAnnouncements.sort()).toEqual(['a', 'b'])
    expect(JSON.parse(localStorage.getItem('octopus.portal.seenAnnouncements.alice')!).sort()).toEqual(['a', 'b'])
  })

  it('marks spotlight seen independently', () => {
    const { result } = renderHook(() => useAnnouncementsSeen())
    act(() => result.current.markSpotlightSeen('a'))
    expect(result.current.seenSpotlights).toEqual(['a'])
    expect(result.current.seenAnnouncements).toEqual([])
  })

  it('is not ready (fail-closed) until the user resolves', () => {
    mockUser.mockReturnValue({ data: undefined })
    const { result } = renderHook(() => useAnnouncementsSeen())
    expect(result.current.ready).toBe(false)
  })
})
