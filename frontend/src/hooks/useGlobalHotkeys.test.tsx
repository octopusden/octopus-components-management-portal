import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useGlobalHotkeys } from './useGlobalHotkeys'
import { useUiOverlay } from '@/lib/uiOverlayStore'

function Harness() {
  useGlobalHotkeys()
  return (
    <div>
      <input data-testid="text" type="text" />
      <input data-testid="checkbox" type="checkbox" />
      <button data-testid="btn">b</button>
    </div>
  )
}

beforeEach(() => {
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false })
})

describe('useGlobalHotkeys', () => {
  it('toggles the palette on Ctrl+K', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(useUiOverlay.getState().paletteOpen).toBe(true)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(useUiOverlay.getState().paletteOpen).toBe(false)
  })

  it('toggles the palette on Meta+K (mac)', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(useUiOverlay.getState().paletteOpen).toBe(true)
  })

  it('⌘K works even while focus is in a text input (it carries a modifier)', () => {
    const { getByTestId } = render(<Harness />)
    const input = getByTestId('text')
    input.focus()
    fireEvent.keyDown(input, { key: 'k', metaKey: true })
    expect(useUiOverlay.getState().paletteOpen).toBe(true)
  })

  it('"?" opens the shortcuts panel when not typing in a field', () => {
    const { getByTestId } = render(<Harness />)
    fireEvent.keyDown(getByTestId('btn'), { key: '?' })
    expect(useUiOverlay.getState().shortcutsOpen).toBe(true)
  })

  it('"?" does NOT open the shortcuts panel while typing in a text input', () => {
    const { getByTestId } = render(<Harness />)
    fireEvent.keyDown(getByTestId('text'), { key: '?' })
    expect(useUiOverlay.getState().shortcutsOpen).toBe(false)
  })

  it('"?" still fires from a checkbox (not text entry)', () => {
    const { getByTestId } = render(<Harness />)
    fireEvent.keyDown(getByTestId('checkbox'), { key: '?' })
    expect(useUiOverlay.getState().shortcutsOpen).toBe(true)
  })
})
