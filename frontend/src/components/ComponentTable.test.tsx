import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ComponentTable } from './ComponentTable'
import type { ComponentSummary, PortalLinks } from '../lib/types'

vi.mock('../hooks/useInfo', () => ({
  usePortalInfo: vi.fn(),
  useCrsInfo: vi.fn(),
}))

import { usePortalInfo } from '../hooks/useInfo'
const mockedUsePortalInfo = vi.mocked(usePortalInfo)

/**
 * Helper: get the body cell that lines up with a header by display name.
 * Robust to column reordering — relies on header text, not column index
 * literals. Assumes a single body row.
 */
function cellForColumn(headerText: string): HTMLElement {
  const headers = screen.getAllByRole('columnheader')
  const idx = headers.findIndex((h) => h.textContent?.trim().includes(headerText))
  expect(idx).toBeGreaterThanOrEqual(0) // header must exist for the assertion to be meaningful
  const rows = screen.getAllByRole('row')
  // rows[0] is header row; rows[1] is the first body row.
  expect(rows.length).toBeGreaterThanOrEqual(2)
  const cells = within(rows[1]!).getAllByRole('cell')
  return cells[idx]!
}

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

function mockLinks(links: Partial<PortalLinks> | null = null) {
  const resolved = links
    ? { jiraBaseUrl: null, gitBaseUrl: null, tcBaseUrl: null, dmsBaseUrl: null, ...links }
    : null
  mockedUsePortalInfo.mockReturnValue({
    data: resolved ? { name: 'portal', version: '1.0.0', links: resolved } : undefined,
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof usePortalInfo>)
}

function renderTable(data: ComponentSummary[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      <MemoryRouter>
        <ComponentTable data={data} isLoading={false} />
      </MemoryRouter>,
    ),
  )
}

describe('ComponentTable', () => {
  beforeEach(() => {
    mockLinks(null)
  })

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

  describe('SYS-040 — list view column scope', () => {
    it('does not render a System column', () => {
      renderTable([makeComponent({ system: ['CLASSIC'] })])
      expect(screen.queryByRole('columnheader', { name: 'System' })).toBeNull()
    })

    it('does not render a Product Type column', () => {
      renderTable([makeComponent({ productType: 'TYPE_A' })])
      expect(screen.queryByRole('columnheader', { name: 'Product Type' })).toBeNull()
    })

    it('renders a Build System column header', () => {
      renderTable([makeComponent()])
      expect(screen.getByRole('columnheader', { name: 'Build System' })).toBeDefined()
    })

    it('renders a Links column header', () => {
      renderTable([makeComponent()])
      expect(screen.getByRole('columnheader', { name: 'Links' })).toBeDefined()
    })

    it('renders Build System as a Badge when buildSystem is set', () => {
      renderTable([makeComponent({ buildSystem: 'GRADLE' })])
      expect(screen.getByText('GRADLE')).toBeDefined()
    })

    it('renders em-dash when buildSystem is null', () => {
      renderTable([makeComponent({ buildSystem: null })])
      // Header-driven cell lookup — robust to column reorder AND
      // specific to the Build System column (em-dashes elsewhere in the
      // row don't mask a regression in this cell).
      expect(cellForColumn('Build System').textContent).toContain('—')
    })
  })

  describe('Wave 2 — Labels column', () => {
    it('renders a Labels column header', () => {
      renderTable([makeComponent()])
      expect(screen.getByRole('columnheader', { name: 'Labels' })).toBeDefined()
    })

    it('renders em-dash when labels is undefined', () => {
      renderTable([makeComponent()])
      expect(cellForColumn('Labels').textContent).toContain('—')
    })

    it('renders em-dash when labels is an empty array', () => {
      renderTable([makeComponent({ labels: [] })])
      expect(cellForColumn('Labels').textContent).toContain('—')
    })

    it('renders a single label as a Badge chip', () => {
      renderTable([makeComponent({ labels: ['feature'] })])
      expect(screen.getByText('feature')).toBeDefined()
    })

    it('renders up to 3 labels without overflow badge', () => {
      renderTable([makeComponent({ labels: ['a', 'b', 'c'] })])
      expect(screen.getByText('a')).toBeDefined()
      expect(screen.getByText('b')).toBeDefined()
      expect(screen.getByText('c')).toBeDefined()
      expect(screen.queryByText(/^\+/)).toBeNull()
    })

    it('renders +N overflow badge when more than 3 labels are present', () => {
      renderTable([makeComponent({ labels: ['a', 'b', 'c', 'd'] })])
      expect(screen.getByText('a')).toBeDefined()
      expect(screen.getByText('b')).toBeDefined()
      expect(screen.getByText('c')).toBeDefined()
      expect(screen.getByText('+1')).toBeDefined()
      // 'd' is in the tooltip content — not rendered as a standalone chip
      expect(screen.queryByText('d')).toBeNull()
    })
  })

  describe('SYS-040 — Links column runtime-config rendering', () => {
    it('renders Jira icon when jiraBaseUrl is set and jiraProjectKey present', () => {
      mockLinks({ jiraBaseUrl: 'https://jira.example.com' })
      renderTable([makeComponent({ jiraProjectKey: 'PROJ' })])
      const link = screen.getByRole('link', { name: /Jira: PROJ/i })
      expect(link).toBeDefined()
      expect((link as HTMLAnchorElement).href).toBe('https://jira.example.com/browse/PROJ')
    })

    it('does NOT render Jira icon when jiraBaseUrl is null even if jiraProjectKey is present', () => {
      mockLinks(null)
      renderTable([makeComponent({ jiraProjectKey: 'PROJ' })])
      expect(screen.queryByRole('link', { name: /Jira/i })).toBeNull()
    })

    it('does NOT render Jira icon when jiraBaseUrl is set but jiraProjectKey is null', () => {
      mockLinks({ jiraBaseUrl: 'https://jira.example.com' })
      renderTable([makeComponent({ jiraProjectKey: null })])
      expect(screen.queryByRole('link', { name: /Jira/i })).toBeNull()
    })

    it('renders Git icon when gitBaseUrl and vcsPath present', () => {
      mockLinks({ gitBaseUrl: 'https://git.example.com' })
      renderTable([makeComponent({ vcsPath: 'org/repo' })])
      const link = screen.getByRole('link', { name: /Git: org\/repo/i })
      expect(link).toBeDefined()
      expect((link as HTMLAnchorElement).href).toBe('https://git.example.com/org/repo')
    })

    it('renders TeamCity icon based solely on tcBaseUrl (uses component name)', () => {
      mockLinks({ tcBaseUrl: 'https://tc.example.com' })
      renderTable([makeComponent({ name: 'alpha' })])
      const link = screen.getByRole('link', { name: /TeamCity: alpha/i })
      expect(link).toBeDefined()
      expect((link as HTMLAnchorElement).href).toBe('https://tc.example.com/alpha')
    })

    it('renders DMS icon based solely on dmsBaseUrl (uses component name)', () => {
      mockLinks({ dmsBaseUrl: 'https://dms.example.com' })
      renderTable([makeComponent({ name: 'alpha' })])
      const link = screen.getByRole('link', { name: /DMS: alpha/i })
      expect(link).toBeDefined()
    })

    it('renders em-dash when no links are configured', () => {
      mockLinks(null)
      renderTable([makeComponent()])
      // Header-driven cell lookup pinpoints the Links column.
      // Belt-and-suspenders: assert no anchor in the row either, in
      // case future content changes the cell text but leaves a stale link.
      expect(cellForColumn('Links').textContent).toContain('—')
      expect(screen.queryByRole('link', { name: /Jira|Git|TeamCity|DMS/i })).toBeNull()
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
