import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from './ui/tooltip'
import { ListPresetBar } from './ListPresetBar'
import type { ComponentProps } from 'react'

// Wrap in a TooltipProvider to match the App mount context (harmless even
// though ListPresetBar no longer renders tooltips of its own).
function renderBar(props: ComponentProps<typeof ListPresetBar>) {
  return render(
    <TooltipProvider delayDuration={0}>
      <ListPresetBar {...props} />
    </TooltipProvider>,
  )
}

describe('ListPresetBar', () => {
  const onSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the live presets for a non-admin (no "With problems")', () => {
    renderBar({ active: 'all', isAdmin: false, onSelect })
    expect(screen.getByRole('button', { name: 'All' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'My Components' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Archived' })).toBeDefined()
    // Admin-only preset hidden for non-admins.
    expect(screen.queryByRole('button', { name: 'With problems' })).toBeNull()
  })

  it('renders "With problems" for an admin', () => {
    renderBar({ active: 'all', isAdmin: true, onSelect })
    expect(screen.getByRole('button', { name: 'With problems' })).toBeDefined()
  })

  it('fires onSelect with the preset id when a live preset is clicked', async () => {
    renderBar({ active: 'all', isAdmin: false, onSelect })
    await userEvent.click(screen.getByRole('button', { name: 'My Components' }))
    expect(onSelect).toHaveBeenCalledWith('mine')
  })

  it('marks the active preset with aria-pressed=true and the rest false', () => {
    renderBar({ active: 'mine', isAdmin: false, onSelect })
    expect(screen.getByRole('button', { name: 'My Components' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('renders the personal RM / SC presets enabled (Phase 1b) for a non-admin', () => {
    renderBar({ active: 'all', isAdmin: false, onSelect })
    const rm = screen.getByRole('button', { name: 'I am Release Manager' }) as HTMLButtonElement
    const sc = screen.getByRole('button', {
      name: 'I am Security Champion',
    }) as HTMLButtonElement
    // No longer deferred — clickable, no "coming soon" affordance.
    expect(rm.disabled).toBe(false)
    expect(sc.disabled).toBe(false)
    expect(rm.getAttribute('title')).toBeNull()
    expect(sc.getAttribute('title')).toBeNull()
  })

  it('fires onSelect with the RM / SC preset id when clicked (Phase 1b)', async () => {
    renderBar({ active: 'all', isAdmin: false, onSelect })
    await userEvent.click(screen.getByRole('button', { name: 'I am Release Manager' }))
    expect(onSelect).toHaveBeenCalledWith('release-manager')
    await userEvent.click(screen.getByRole('button', { name: 'I am Security Champion' }))
    expect(onSelect).toHaveBeenCalledWith('security-champion')
  })

  it('shows no active highlight when active is null (custom filter)', () => {
    renderBar({ active: null, isAdmin: false, onSelect })
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false')
    expect(
      screen.getByRole('button', { name: 'My Components' }).getAttribute('aria-pressed'),
    ).toBe('false')
  })
})
