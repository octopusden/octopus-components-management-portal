import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './Pagination'

const defaultProps = {
  page: 0,
  totalPages: 5,
  totalElements: 100,
  size: 20,
  onPageChange: vi.fn(),
  onSizeChange: vi.fn(),
}

describe('Pagination', () => {
  it('shows the correct range label', () => {
    render(<Pagination {...defaultProps} />)
    expect(screen.getByText('Showing 1–20 of 100')).toBeDefined()
  })

  it('shows "No results" when totalElements is 0', () => {
    render(<Pagination {...defaultProps} totalElements={0} totalPages={0} />)
    expect(screen.getByText('No results')).toBeDefined()
  })

  it('shows correct page indicator', () => {
    render(<Pagination {...defaultProps} page={2} />)
    expect(screen.getByText('Page 3 of 5')).toBeDefined()
  })

  it('disables Previous button on first page', () => {
    render(<Pagination {...defaultProps} page={0} />)
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled()
  })

  it('disables Next button on last page', () => {
    render(<Pagination {...defaultProps} page={4} totalPages={5} />)
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled()
  })

  it('calls onPageChange with page - 1 when Previous is clicked', async () => {
    const onPageChange = vi.fn()
    render(<Pagination {...defaultProps} page={2} onPageChange={onPageChange} />)

    await userEvent.click(screen.getByRole('button', { name: /previous page/i }))

    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('calls onPageChange with page + 1 when Next is clicked', async () => {
    const onPageChange = vi.fn()
    render(<Pagination {...defaultProps} page={1} onPageChange={onPageChange} />)

    await userEvent.click(screen.getByRole('button', { name: /next page/i }))

    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('shows correct range for last partial page', () => {
    render(<Pagination {...defaultProps} page={4} totalPages={5} totalElements={93} size={20} />)
    // page 5: elements 81–93
    expect(screen.getByText('Showing 81–93 of 93')).toBeDefined()
  })
})
