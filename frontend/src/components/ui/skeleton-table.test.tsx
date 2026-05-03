import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Table } from './table'
import { SkeletonTable } from './skeleton-table'

describe('SkeletonTable', () => {
  it('renders the requested rows × cols inside a [data-testid="skeleton-table"] tbody', () => {
    render(
      <Table>
        <SkeletonTable rows={3} cols={4} />
      </Table>,
    )
    const tbody = screen.getByTestId('skeleton-table')
    const cells = tbody.querySelectorAll('td')
    expect(cells.length).toBe(3 * 4)
  })

  it('renders a skeleton header row by default', () => {
    render(
      <Table>
        <SkeletonTable rows={1} cols={2} />
      </Table>,
    )
    // Each header cell holds a skeleton-block; we expect `cols` of them.
    const headerSkeletons = screen.getAllByTestId('skeleton-block')
    // 2 in header + 2 in single body row = 4 total.
    expect(headerSkeletons.length).toBe(4)
  })

  it('hides the header row when showHeader=false', () => {
    render(
      <Table>
        <SkeletonTable rows={1} cols={3} showHeader={false} />
      </Table>,
    )
    // No <thead>; only body skeletons remain.
    const tbody = screen.getByTestId('skeleton-table')
    expect(within(tbody).getAllByTestId('skeleton-block').length).toBe(3)
  })
})
