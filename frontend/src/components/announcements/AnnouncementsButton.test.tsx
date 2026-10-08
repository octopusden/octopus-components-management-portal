import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnouncementsButton } from './AnnouncementsButton'
import { ANNOUNCEMENTS } from '@/announcements/announcements'
import { useAnnouncementsSeenStore } from '@/lib/announcementsSeen'
import { useUiOverlay } from '@/lib/uiOverlayStore'

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: { username: 'alice' } }),
}))

beforeEach(() => {
  localStorage.clear()
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false, activeModal: null })
  useAnnouncementsSeenStore.setState({ username: null, storageOk: false, seenAnnouncements: [], seenSpotlights: [] })
})

describe('AnnouncementsButton', () => {
  it('shows an unread dot while this user has unseen announcements', () => {
    render(<AnnouncementsButton />)
    expect(screen.getByRole('button', { name: "What's new (unread)" })).toBeDefined()
    expect(screen.getByTestId('whats-new-dot')).toBeDefined()
  })

  it('shows no dot once every announcement is seen', () => {
    localStorage.setItem('octopus.portal.seenAnnouncements.alice', JSON.stringify(ANNOUNCEMENTS.map((a) => a.id)))
    render(<AnnouncementsButton />)
    expect(screen.queryByTestId('whats-new-dot')).toBeNull()
    expect(screen.getByRole('button', { name: "What's new" })).toBeDefined()
  })

  it('opens the announcement modal', async () => {
    render(<AnnouncementsButton />)
    await userEvent.click(screen.getByRole('button', { name: /what's new/i }))
    expect(useUiOverlay.getState().activeModal).toBe('announcement')
  })
})
