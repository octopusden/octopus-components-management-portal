import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ComponentTable } from './ComponentTable'
import type { ComponentSummary, PortalLinks } from '../lib/types'

vi.mock('../hooks/useInfo', () => ({
  usePortalLinks: vi.fn(),
  useCrsInfo: vi.fn(),
}))

import { usePortalLinks } from '../hooks/useInfo'
const mockedUsePortalLinks = vi.mocked(usePortalLinks)

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
    system: null,
    productType: null,
    archived: false,
    updatedAt: null,
    labels: [],
    ...overrides,
  }
}

function mockLinks(links: Partial<PortalLinks> | null = null) {
  const resolved = links
    ? { jiraBaseUrl: null, gitBaseUrl: null, tcBaseUrl: null, dmsBaseUrl: null, ...links }
    : undefined
  mockedUsePortalLinks.mockReturnValue({
    data: resolved,
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof usePortalLinks>)
}

function renderTable(data: ComponentSummary[], onCopy?: (id: string) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      <MemoryRouter>
        <ComponentTable data={data} isLoading={false} onCopy={onCopy} />
      </MemoryRouter>,
    ),
  )
}

describe('ComponentTable', () => {
  beforeEach(() => {
    mockLinks(null)
  })

  it('renders the Component Key column header', () => {
    renderTable([makeComponent()])
    expect(screen.getByRole('button', { name: /component key/i })).toBeDefined()
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
      renderTable([makeComponent({ system: 'CLASSIC' })])
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

    it('renders em-dash when labels is an empty array', () => {
      // labels is required on the wire (`ComponentSummaryResponse.labels`);
      // server emits [] for the empty case, never omits the key. Renders
      // an em-dash placeholder so the column doesn't look broken.
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
      // 'd' is overflow — not rendered until the +N toggle is clicked.
      expect(screen.queryByText('d')).toBeNull()
    })

    it('renders the +N toggle as a real <button> with Show-all aria-label + aria-expanded=false', () => {
      renderTable([makeComponent({ labels: ['a', 'b', 'c', 'd', 'e'] })])
      const btn = screen.getByRole('button', { name: /show all 5 labels/i })
      expect(btn).toBeDefined()
      expect((btn as HTMLElement).tagName).toBe('BUTTON')
      expect(btn.textContent).toContain('+2')
      expect(btn.getAttribute('aria-expanded')).toBe('false')
    })

    it('clicking +N expands the cell inline to render every label as a chip', async () => {
      renderTable([makeComponent({ labels: ['a', 'b', 'c', 'd', 'e'] })])
      await userEvent.click(screen.getByRole('button', { name: /show all 5 labels/i }))
      // After expansion, all 5 labels render in-cell. d and e were
      // overflow before; they must now be in the DOM.
      expect(screen.getByText('a')).toBeDefined()
      expect(screen.getByText('b')).toBeDefined()
      expect(screen.getByText('c')).toBeDefined()
      expect(screen.getByText('d')).toBeDefined()
      expect(screen.getByText('e')).toBeDefined()
    })

    it('after expanding, the toggle reads "show less" with aria-expanded=true', async () => {
      renderTable([makeComponent({ labels: ['a', 'b', 'c', 'd', 'e'] })])
      await userEvent.click(screen.getByRole('button', { name: /show all 5 labels/i }))
      const collapse = screen.getByRole('button', { name: /show fewer labels/i })
      expect(collapse).toBeDefined()
      expect(collapse.textContent).toBe('show less')
      expect(collapse.getAttribute('aria-expanded')).toBe('true')
    })

    it('clicking "show less" collapses back to the first 3 labels and restores the +N toggle', async () => {
      renderTable([makeComponent({ labels: ['a', 'b', 'c', 'd', 'e'] })])
      await userEvent.click(screen.getByRole('button', { name: /show all 5 labels/i }))
      expect(screen.getByText('d')).toBeDefined()
      await userEvent.click(screen.getByRole('button', { name: /show fewer labels/i }))
      // d and e are overflow again — gone from the DOM.
      expect(screen.queryByText('d')).toBeNull()
      expect(screen.queryByText('e')).toBeNull()
      // The +N toggle is back with aria-expanded=false.
      const reopen = screen.getByRole('button', { name: /show all 5 labels/i })
      expect(reopen.getAttribute('aria-expanded')).toBe('false')
    })

    it('Enter on the focused +N button toggles expand/collapse (keyboard activation)', async () => {
      renderTable([makeComponent({ labels: ['a', 'b', 'c', 'd', 'e'] })])
      const btn = screen.getByRole('button', { name: /show all 5 labels/i })
      ;(btn as HTMLButtonElement).focus()
      await userEvent.keyboard('{Enter}')
      expect(screen.getByText('d')).toBeDefined()
      // The collapse toggle should still hold focus; press Enter again.
      await userEvent.keyboard('{Enter}')
      expect(screen.queryByText('d')).toBeNull()
    })

    it('renders no toggle when labels.length <= 3', () => {
      renderTable([makeComponent({ labels: ['a', 'b', 'c'] })])
      expect(screen.queryByRole('button', { name: /show all|show fewer/i })).toBeNull()
    })

    it('renders no toggle when labels is empty', () => {
      renderTable([makeComponent({ labels: [] })])
      expect(screen.queryByRole('button', { name: /show all|show fewer/i })).toBeNull()
      expect(cellForColumn('Labels').textContent).toContain('—')
    })

    it('expansion is per-row (expanding one row does not affect another)', async () => {
      renderTable([
        makeComponent({ id: 'r1', name: 'row-one', labels: ['a', 'b', 'c', 'd', 'e'] }),
        makeComponent({ id: 'r2', name: 'row-two', labels: ['p', 'q', 'r', 's', 't'] }),
      ])
      // Two +N buttons, one per row — sanity-check.
      const toggles = screen.getAllByRole('button', { name: /show all 5 labels/i })
      expect(toggles).toHaveLength(2)
      // Expand the first row only.
      await userEvent.click(toggles[0]!)
      // Row 1 fully rendered: d, e visible.
      expect(screen.getByText('d')).toBeDefined()
      expect(screen.getByText('e')).toBeDefined()
      // Row 2 still collapsed: s, t absent.
      expect(screen.queryByText('s')).toBeNull()
      expect(screen.queryByText('t')).toBeNull()
    })
  })

  describe('SYS-040 — Links column runtime-config rendering', () => {
    it('renders Jira icon when jiraBaseUrl is set and jiraProjectKey present', () => {
      mockLinks({ jiraBaseUrl: 'https://jira.example.com' })
      renderTable([makeComponent({ jiraProjectKey: 'PROJ' })])
      const link = screen.getByRole('link', { name: /Jira: PROJ/i })
      expect(link).toBeDefined()
      expect((link as HTMLAnchorElement).href).toBe('https://jira.example.com/browse/PROJ')
      expect(within(link).getByTestId('brand-icon-jira')).toBeDefined()
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

    it('renders Bitbucket icon + browser URL (vcsPath split on first slash)', () => {
      mockLinks({ gitBaseUrl: 'https://git.example.com' })
      renderTable([makeComponent({ vcsPath: 'CREG/components-registry' })])
      const link = screen.getByRole('link', { name: /Bitbucket: CREG\/components-registry/i })
      expect(link).toBeDefined()
      expect((link as HTMLAnchorElement).href).toBe(
        'https://git.example.com/projects/CREG/repos/components-registry',
      )
      // Pin the brand icon — without this assertion the visual mockup match
      // could regress to a generic glyph without a test failure.
      expect(within(link).getByTestId('brand-icon-bitbucket')).toBeDefined()
    })

    it('hides Git icon when vcsPath has no slash (cannot derive project key + repo)', () => {
      mockLinks({ gitBaseUrl: 'https://git.example.com' })
      renderTable([makeComponent({ vcsPath: 'standalone' })])
      expect(screen.queryByRole('link', { name: /Git:/i })).toBeNull()
    })

    it('renders TeamCity icon when teamcityProjectUrl is set (verbatim href, no templating)', () => {
      // Intentionally omit tcBaseUrl: the icon is gated only on the
      // per-component URL (CRS PR-2 contract). tcBaseUrl from /portal/links
      // must not affect rendering of this icon.
      mockLinks(null)
      renderTable([
        makeComponent({
          name: 'alpha',
          teamcityProjectUrl: 'https://teamcity.example.com/project/Alpha_Build',
        }),
      ])
      const link = screen.getByRole('link', { name: /TeamCity: alpha/i })
      expect(link).toBeDefined()
      // Render the URL verbatim — no /buildTypes/ or /favicon coercion.
      expect((link as HTMLAnchorElement).href).toBe(
        'https://teamcity.example.com/project/Alpha_Build',
      )
      // Pin the brand icon — visual mockup match guard.
      expect(within(link).getByTestId('brand-icon-teamcity')).toBeDefined()
    })

    it('renders TeamCity icon even when tcBaseUrl from /portal/links is null', () => {
      // Per CRS PR-2 the URL is self-sufficient — tcBaseUrl is only used as
      // a sanity flag for "TC integration is configured globally" and must
      // not gate per-component rendering.
      mockLinks({ tcBaseUrl: null })
      renderTable([
        makeComponent({
          name: 'beta',
          teamcityProjectUrl: 'https://teamcity.example.com/project/Beta_Build',
        }),
      ])
      expect(screen.getByRole('link', { name: /TeamCity: beta/i })).toBeDefined()
    })

    it('does NOT render TeamCity icon when teamcityProjectUrl is null', () => {
      mockLinks({ tcBaseUrl: 'https://teamcity.example.com' })
      renderTable([makeComponent({ name: 'gamma', teamcityProjectUrl: null })])
      expect(screen.queryByRole('link', { name: /TeamCity/i })).toBeNull()
    })

    it('does NOT render TeamCity icon when teamcityProjectUrl is undefined', () => {
      mockLinks({ tcBaseUrl: 'https://teamcity.example.com' })
      renderTable([makeComponent({ name: 'delta' })])
      expect(screen.queryByRole('link', { name: /TeamCity/i })).toBeNull()
    })

    it('renders DMS icon as ?component= query selector (not a path segment)', () => {
      mockLinks({ dmsBaseUrl: 'https://dms.example.com' })
      renderTable([makeComponent({ name: 'alpha' })])
      const link = screen.getByRole('link', { name: /DMS: alpha/i })
      expect(link).toBeDefined()
      expect((link as HTMLAnchorElement).href).toBe('https://dms.example.com/?component=alpha')
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

describe('ComponentTable — per-row Copy action', () => {
  beforeEach(() => {
    mockLinks(null)
  })

  it('renders a Copy button per row and reports the row id when onCopy is provided', async () => {
    const onCopy = vi.fn()
    renderTable(
      [
        makeComponent({ id: 'c1', name: 'alpha' }),
        makeComponent({ id: 'c2', name: 'beta' }),
      ],
      onCopy,
    )
    const alphaCopy = screen.getByRole('button', { name: 'Copy alpha' })
    expect(screen.getByRole('button', { name: 'Copy beta' })).toBeDefined()
    await userEvent.click(alphaCopy)
    expect(onCopy).toHaveBeenCalledWith('c1')
  })

  it('renders no Copy buttons or actions column when onCopy is omitted', () => {
    renderTable([makeComponent({ id: 'c1', name: 'alpha' })])
    expect(screen.queryByRole('button', { name: /^copy /i })).toBeNull()
  })
})
