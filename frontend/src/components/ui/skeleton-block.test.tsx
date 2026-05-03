import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkeletonBlock } from './skeleton-block'

describe('SkeletonBlock', () => {
  it('renders with the muted-pulse class set + data-testid="skeleton-block"', () => {
    render(<SkeletonBlock />)
    const root = screen.getByTestId('skeleton-block')
    expect(root.className).toContain('bg-muted')
    expect(root.className).toContain('animate-pulse')
    expect(root.className).toContain('rounded')
  })

  it('uses h-4 / w-full as defaults', () => {
    render(<SkeletonBlock />)
    const root = screen.getByTestId('skeleton-block')
    expect(root.className).toContain('h-4')
    expect(root.className).toContain('w-full')
  })

  it('honours custom height + width Tailwind utilities', () => {
    render(<SkeletonBlock height="h-64" width="w-1/4" />)
    const root = screen.getByTestId('skeleton-block')
    expect(root.className).toContain('h-64')
    expect(root.className).toContain('w-1/4')
  })

  it('forwards arbitrary HTML props (e.g. style for dynamic widths)', () => {
    render(<SkeletonBlock width="" style={{ width: '73%' }} />)
    const root = screen.getByTestId('skeleton-block') as HTMLElement
    expect(root.style.width).toBe('73%')
  })
})
