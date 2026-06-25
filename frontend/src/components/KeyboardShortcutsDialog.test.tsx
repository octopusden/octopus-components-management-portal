import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog'
import { useUiOverlay } from '@/lib/uiOverlayStore'

beforeEach(() => {
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false })
})

describe('KeyboardShortcutsDialog', () => {
  it('is closed by default (nothing rendered)', () => {
    render(<KeyboardShortcutsDialog />)
    expect(screen.queryByText('Keyboard shortcuts')).not.toBeInTheDocument()
  })

  it('renders the shortcut rows when open', () => {
    useUiOverlay.setState({ shortcutsOpen: true })
    render(<KeyboardShortcutsDialog />)
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Open the command palette')).toBeInTheDocument()
    expect(screen.getByText('Show this shortcuts panel')).toBeInTheDocument()
    expect(screen.getByText('Move between results')).toBeInTheDocument()
    expect(screen.getByText('Activate the selected item')).toBeInTheDocument()
    expect(screen.getByText('Close the palette or this panel')).toBeInTheDocument()
  })

  it('closing the dialog clears the store flag', async () => {
    const user = userEvent.setup()
    useUiOverlay.setState({ shortcutsOpen: true })
    render(<KeyboardShortcutsDialog />)
    await user.keyboard('{Escape}')
    expect(useUiOverlay.getState().shortcutsOpen).toBe(false)
  })
})
