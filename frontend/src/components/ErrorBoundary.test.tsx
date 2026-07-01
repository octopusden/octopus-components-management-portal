import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('app shell blew up')
}

describe('ErrorBoundary', () => {
  it('renders its children unchanged when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>healthy content</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('healthy content')).toBeDefined()
  })

  it('renders a recovery fallback (not a blank screen) when a child throws', () => {
    // The boundary logs the caught error; silence the expected console noise.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeDefined()
    expect(screen.getByText(/app shell blew up/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /reload/i })).toBeDefined()
    spy.mockRestore()
  })
})
