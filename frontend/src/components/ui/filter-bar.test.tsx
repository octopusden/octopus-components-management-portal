import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FilterBar } from './filter-bar'

describe('FilterBar', () => {
  it('emits data-testid="filter-bar" + uses items-center by default', () => {
    render(
      <FilterBar>
        <button>filter</button>
      </FilterBar>,
    )
    const root = screen.getByTestId('filter-bar')
    expect(root.className).toContain('flex')
    expect(root.className).toContain('flex-wrap')
    expect(root.className).toContain('items-center')
    expect(root.className).not.toContain('items-end')
  })

  it('uses items-end when withLabels is true', () => {
    render(<FilterBar withLabels>x</FilterBar>)
    const root = screen.getByTestId('filter-bar')
    expect(root.className).toContain('items-end')
    expect(root.className).not.toContain('items-center')
  })

  it('does NOT add a border / card wrapper (matches both prototype filter rows)', () => {
    render(<FilterBar>x</FilterBar>)
    const root = screen.getByTestId('filter-bar')
    expect(root.className).not.toContain('border')
    expect(root.className).not.toContain('bg-card')
    expect(root.className).not.toContain('rounded-md')
  })

  it('forwards extra className', () => {
    render(<FilterBar className="extra">x</FilterBar>)
    expect(screen.getByTestId('filter-bar').className).toContain('extra')
  })
})
