import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBanner } from './status-banner'

describe('StatusBanner', () => {
  it('defaults to destructive variant + emits data-variant + data-testid="status-banner"', () => {
    render(<StatusBanner>Save failed</StatusBanner>)
    const root = screen.getByTestId('status-banner')
    expect(root.getAttribute('data-variant')).toBe('destructive')
    expect(root.textContent).toContain('Save failed')
    expect(root.className).toContain('border-destructive/40')
    expect(root.className).toContain('bg-destructive/10')
  })

  it('renders the warning variant with yellow tokens', () => {
    render(<StatusBanner variant="warning">Slow operation</StatusBanner>)
    const root = screen.getByTestId('status-banner')
    expect(root.getAttribute('data-variant')).toBe('warning')
    expect(root.className).toContain('bg-[color:var(--color-badge-yellow-bg)]')
  })

  it('renders the info variant with blue tokens', () => {
    render(<StatusBanner variant="info">FYI</StatusBanner>)
    expect(screen.getByTestId('status-banner').getAttribute('data-variant')).toBe('info')
  })

  it('allows callers to override data-testid (for backwards compatibility)', () => {
    render(
      <StatusBanner data-testid="history-stuck-banner" role="alert">
        Stuck
      </StatusBanner>,
    )
    // Caller-supplied data-testid shadows the default thanks to spread order.
    expect(screen.queryByTestId('status-banner')).toBeNull()
    expect(screen.getByTestId('history-stuck-banner').textContent).toContain('Stuck')
  })

  it('allows callers to override role', () => {
    render(
      <StatusBanner role="alert" data-testid="alert-banner">
        Critical
      </StatusBanner>,
    )
    expect(screen.getByRole('alert').textContent).toContain('Critical')
  })
})
