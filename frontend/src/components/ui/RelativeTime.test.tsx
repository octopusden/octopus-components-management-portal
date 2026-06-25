import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelativeTime } from './RelativeTime'

describe('RelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // Pin the clock so the relative buckets are deterministic — the component
  // calls formatRelativeTime() with no injected `now`, so it reads Date.now().
  function freezeNow(iso: string) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(iso))
  }

  it('renders "Today" with the absolute date in the title', () => {
    freezeNow('2026-06-25T12:00:00Z')
    render(<RelativeTime ts="2026-06-25T08:00:00Z" />)
    const span = screen.getByText('Today')
    expect(span).toBeInTheDocument()
    expect(span).toHaveAttribute('title', '25 Jun 2026')
  })

  it('renders "Yesterday"', () => {
    freezeNow('2026-06-25T12:00:00Z')
    render(<RelativeTime ts="2026-06-24T12:00:00Z" />)
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
  })

  it('renders "N days ago"', () => {
    freezeNow('2026-06-25T12:00:00Z')
    render(<RelativeTime ts="2026-06-22T12:00:00Z" />)
    expect(screen.getByText('3 days ago')).toBeInTheDocument()
  })

  it('renders "N weeks ago"', () => {
    freezeNow('2026-06-25T12:00:00Z')
    render(<RelativeTime ts="2026-06-04T12:00:00Z" />)
    expect(screen.getByText('3 weeks ago')).toBeInTheDocument()
  })

  it('renders "N months ago"', () => {
    freezeNow('2026-06-25T12:00:00Z')
    render(<RelativeTime ts="2026-03-25T12:00:00Z" />)
    expect(screen.getByText('3 months ago')).toBeInTheDocument()
  })

  it('renders the em-dash with an em-dash title for null', () => {
    render(<RelativeTime ts={null} />)
    const span = screen.getByText('—')
    expect(span).toHaveAttribute('title', '—')
  })
})
