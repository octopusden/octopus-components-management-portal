import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('renders the message inside a [data-testid="empty-state"] wrapper', () => {
    render(<EmptyState message="No components found" />)
    const root = screen.getByTestId('empty-state')
    expect(root).toBeDefined()
    expect(root.textContent).toContain('No components found')
  })

  it('uses py-12 vertical padding by default (matches prototype list page)', () => {
    render(<EmptyState message="x" />)
    const root = screen.getByTestId('empty-state')
    expect(root.className).toContain('py-12')
    expect(root.className).toContain('text-muted-foreground')
  })

  it('renders the optional icon before the message', () => {
    render(<EmptyState icon={<span data-testid="icon" />} message="x" />)
    expect(screen.getByTestId('icon')).toBeDefined()
  })

  it('forwards extra className to the wrapper', () => {
    render(<EmptyState message="x" className="extra-class" />)
    expect(screen.getByTestId('empty-state').className).toContain('extra-class')
  })
})
