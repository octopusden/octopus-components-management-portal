import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeedbackDialog } from './FeedbackDialog'
import { useUiOverlay } from '@/lib/uiOverlayStore'

vi.mock('@/hooks/useInfo', () => ({
  usePortalInfo: () => ({ data: { version: '1.1' } }),
}))
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))
vi.mock('@/hooks/useFeedback', () => ({
  useSubmitFeedback: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

beforeEach(() => {
  useUiOverlay.setState({ paletteOpen: false, shortcutsOpen: false, activeModal: 'feedback' })
})

describe('FeedbackDialog', () => {
  it('shows no error blocks before the user submits', () => {
    render(<FeedbackDialog />)
    // Regression: InlineError has no empty-guard, so it must only be mounted when there's
    // an actual message — otherwise empty red strips render under every field.
    expect(screen.queryByTestId('inline-error')).toBeNull()
  })

  it('renders the three feedback types', () => {
    render(<FeedbackDialog />)
    expect(screen.getByRole('option', { name: 'Report a problem' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Suggest an idea' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ask a question' })).toBeInTheDocument()
  })
})
