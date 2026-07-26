import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeedbackButton } from './FeedbackButton'
import { useUiOverlay } from '@/lib/uiOverlayStore'

beforeEach(() => {
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false, activeModal: null })
})

describe('FeedbackButton', () => {
  it('opens the feedback modal via the overlay coordinator', () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByRole('button', { name: /feedback|report a problem/i }))
    expect(useUiOverlay.getState().activeModal).toBe('feedback')
  })

  it('carries the spotlight target attribute', () => {
    render(<FeedbackButton />)
    expect(screen.getByRole('button', { name: /feedback|report a problem/i })).toHaveAttribute(
      'data-spotlight',
      'feedback',
    )
  })
})
