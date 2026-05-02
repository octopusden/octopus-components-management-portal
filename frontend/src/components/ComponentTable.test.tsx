import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ComponentTable } from './ComponentTable'
import type { ComponentSummary } from '../lib/types'

function makeComponent(overrides: Partial<ComponentSummary> = {}): ComponentSummary {
  return {
    id: 'comp-1',
    name: 'my-component',
    displayName: null,
    componentOwner: null,
    system: [],
    productType: null,
    archived: false,
    updatedAt: null,
    ...overrides,
  }
}

function renderTable(data: ComponentSummary[]) {
  return render(
    <MemoryRouter>
      <ComponentTable data={data} isLoading={false} />
    </MemoryRouter>,
  )
}

describe('ComponentTable', () => {
  it('renders the Name column header', () => {
    renderTable([makeComponent()])
    expect(screen.getByRole('button', { name: /name/i })).toBeDefined()
  })

  it('does not render a standalone Display Name column header', () => {
    renderTable([makeComponent({ displayName: 'My Display' })])
    // The old separate "Display Name" column header should no longer exist
    expect(screen.queryByRole('columnheader', { name: 'Display Name' })).toBeNull()
  })

  describe('stacked Name cell', () => {
    it('renders name as a link', () => {
      renderTable([makeComponent({ id: 'c1', name: 'alpha' })])
      const link = screen.getByRole('link', { name: 'alpha' })
      expect(link).toBeDefined()
      expect((link as HTMLAnchorElement).href).toContain('/components/c1')
    })

    it('renders displayName as a secondary line when both name and displayName are present', () => {
      renderTable([makeComponent({ name: 'alpha', displayName: 'Alpha Display' })])
      expect(screen.getByRole('link', { name: 'alpha' })).toBeDefined()
      expect(screen.getByText('Alpha Display')).toBeDefined()
    })

    it('renders only the name link when displayName is null', () => {
      const { container } = renderTable([makeComponent({ name: 'beta', displayName: null })])
      expect(screen.getByRole('link', { name: 'beta' })).toBeDefined()
      // The name cell should contain only the link, no secondary display-name span
      const nameCell = container.querySelector('tbody tr td:first-child')
      expect(nameCell?.querySelectorAll('span').length).toBe(0)
    })

    it('renders only the name link when displayName is empty string', () => {
      renderTable([makeComponent({ name: 'gamma', displayName: '' })])
      expect(screen.getByRole('link', { name: 'gamma' })).toBeDefined()
    })
  })

  describe('archived row dimming', () => {
    it('applies opacity-50 class to archived rows', () => {
      const { container } = renderTable([makeComponent({ archived: true })])
      // Find the tbody row
      const rows = Array.from(container.querySelectorAll('tbody tr'))
      expect(rows.length).toBe(1)
      expect(rows[0]!.className).toContain('opacity-50')
    })

    it('does not apply opacity-50 to active rows', () => {
      const { container } = renderTable([makeComponent({ archived: false })])
      const rows = Array.from(container.querySelectorAll('tbody tr'))
      expect(rows.length).toBe(1)
      expect(rows[0]!.className).not.toContain('opacity-50')
    })

    it('dims archived rows but not active rows in a mixed list', () => {
      const data = [
        makeComponent({ id: 'a1', name: 'active', archived: false }),
        makeComponent({ id: 'a2', name: 'archived', archived: true }),
      ]
      const { container } = renderTable(data)
      const rows = Array.from(container.querySelectorAll('tbody tr'))
      expect(rows.length).toBe(2)
      expect(rows[0]!.className).not.toContain('opacity-50')
      expect(rows[1]!.className).toContain('opacity-50')
    })
  })
})
