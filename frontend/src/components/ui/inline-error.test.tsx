import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InlineError } from './inline-error'

describe('InlineError', () => {
  it('renders the message inside a [data-testid="inline-error"] wrapper', () => {
    render(<InlineError message="Failed to load" />)
    const root = screen.getByTestId('inline-error')
    expect(root.textContent).toContain('Failed to load')
  })

  it('applies the page-level destructive block classes', () => {
    render(<InlineError message="x" />)
    const root = screen.getByTestId('inline-error')
    expect(root.className).toContain('border-destructive/50')
    expect(root.className).toContain('bg-destructive/10')
    expect(root.className).toContain('text-destructive')
  })

  it('exposes role="alert" for assistive tech', () => {
    render(<InlineError message="x" />)
    expect(screen.getByRole('alert').textContent).toContain('x')
  })

  it('forwards extra className', () => {
    render(<InlineError message="x" className="mt-4" />)
    expect(screen.getByTestId('inline-error').className).toContain('mt-4')
  })
})
