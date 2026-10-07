import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HelpMenu } from './HelpMenu'
import { useOnboardingVideoStatus } from '@/hooks/useInfo'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'
import { useUiOverlay } from '@/lib/uiOverlayStore'

vi.mock('@/hooks/useInfo', () => ({ useOnboardingVideoStatus: vi.fn() }))
const mockStatus = vi.mocked(useOnboardingVideoStatus)

function videoStatus(status: string | undefined) {
  mockStatus.mockReturnValue({ data: status ? { onboardingVideoStatus: status } : undefined } as ReturnType<
    typeof useOnboardingVideoStatus
  >)
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Help and feedback' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false, activeModal: null })
  useOnboardingVideo.setState({ open: false })
})

describe('HelpMenu', () => {
  it('is an icon trigger that carries the feedback spotlight target', () => {
    videoStatus('ready')
    render(<HelpMenu />)
    expect(screen.getByRole('button', { name: 'Help and feedback' }).getAttribute('data-spotlight')).toBe('feedback')
  })

  it('opens the feedback dialog', async () => {
    videoStatus(undefined)
    render(<HelpMenu />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /send feedback/i }))
    expect(useUiOverlay.getState().activeModal).toBe('feedback')
  })

  it('opens the keyboard shortcuts panel', async () => {
    videoStatus(undefined)
    render(<HelpMenu />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /keyboard shortcuts/i }))
    expect(useUiOverlay.getState().shortcutsOpen).toBe(true)
  })

  it('offers the intro video only when it is ready', async () => {
    videoStatus('processing')
    const { unmount } = render(<HelpMenu />)
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /watch the intro/i })).toBeNull()
    unmount()

    videoStatus('ready')
    render(<HelpMenu />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /watch the intro/i }))
    expect(useOnboardingVideo.getState().open).toBe(true)
  })
})
