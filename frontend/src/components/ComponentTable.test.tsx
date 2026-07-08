import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ComponentTable } from './ComponentTable'
import { TooltipProvider } from './ui/tooltip'
import type { ComponentSummary, ComponentValidation, PortalLinks } from '../lib/types'

vi.mock('../hooks/useInfo', () => ({
  usePortalLinks: vi.fn(),
  useCrsInfo: vi.fn(),
}))

// The System list column is gated on the `component.system` field-config
// visibility. Mock only `useFieldConfig` (preserve the module's other exports)
// so we can drive the visibility flag without hitting the network. The default
// implementation returns `{ data: undefined }` → `visibilityFor` falls back to
// 'editable', so every existing test keeps the System column visible.
vi.mock('../hooks/useAdminConfig', async (importActual) => {
  const actual = await importActual<typeof import('../hooks/useAdminConfig')>()
  return { ...actual, useFieldConfig: vi.fn(() => ({ data: undefined })) }
})

import { usePortalLinks } from '../hooks/useInfo'
import { useFieldConfig } from '../hooks/useAdminConfig'
const mockedUsePortalLinks = vi.mocked(usePortalLinks)
const mockedUseFieldConfig = vi.mocked(useFieldConfig)

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
    // Equal to the name → no secondary line (displayName is nullable; when present it shows
    // only when distinct from the name).
    displayName: 'my-component',
    componentOwner: null,
    systems: [],
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
        {/* The Clone row action uses Tooltip, which needs a provider. */}
        <TooltipProvider>
          <ComponentTable data={data} isLoading={false} onCopy={onCopy} />
        </TooltipProvider>
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

    it('renders only the name link when displayName equals the name', () => {
      const { container } = renderTable([makeComponent({ name: 'beta', displayName: 'beta' })])
      expect(screen.getByRole('link', { name: 'beta' })).toBeDefined()
      // The name cell should contain only the link, no secondary display-name span
      const nameCell = container.querySelector('tbody tr td:first-child')
      expect(nameCell?.querySelectorAll('span').length).toBe(0)
    })

    it('renders only the name link when displayName is empty string', () => {
      renderTable([makeComponent({ name: 'gamma', displayName: '' })])
      expect(screen.getByRole('link', { name: 'gamma' })).toBeDefined()
    })

    it('renders only the name link when displayName is null (nullable contract)', () => {
      const { container } = renderTable([makeComponent({ name: 'delta', displayName: null })])
      expect(screen.getByRole('link', { name: 'delta' })).toBeDefined()
      const nameCell = container.querySelector('tbody tr td:first-child')
      expect(nameCell?.querySelectorAll('span').length).toBe(0)
    })
  })

  describe('SYS-040 — list view column scope', () => {
    // System membership is MULTI-value (component_systems junction) — the
    // System column is back and mirrors Labels: a ChipListCell fed the
    // component's `systems` array. See 'Wave 2 — System column' below for
    // the chip/overflow behavior.
    it('renders a System column', () => {
      renderTable([makeComponent({ systems: ['CLASSIC'] })])
      expect(screen.getByRole('columnheader', { name: 'System' })).toBeDefined()
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

  describe('System column (multi-value, mirrors Labels)', () => {
    it('renders em-dash when systems is an empty array', () => {
      renderTable([makeComponent({ systems: [] })])
      expect(cellForColumn('System').textContent).toContain('—')
    })

    it('renders a single system as a Badge chip', () => {
      renderTable([makeComponent({ systems: ['SYS1'] })])
      expect(screen.getByText('SYS1')).toBeDefined()
    })

    it('renders up to 3 systems without overflow badge', () => {
      renderTable([makeComponent({ systems: ['SYS1', 'SYS2', 'SYS3'] })])
      expect(screen.getByText('SYS1')).toBeDefined()
      expect(screen.getByText('SYS2')).toBeDefined()
      expect(screen.getByText('SYS3')).toBeDefined()
      expect(screen.queryByText(/^\+/)).toBeNull()
    })

    it('renders +N overflow badge when more than 3 systems are present', () => {
      renderTable([makeComponent({ systems: ['SYS1', 'SYS2', 'SYS3', 'SYS4'] })])
      expect(screen.getByText('SYS1')).toBeDefined()
      expect(screen.getByText('+1')).toBeDefined()
      // 'SYS4' is overflow — not rendered until the +N toggle is clicked.
      expect(screen.queryByText('SYS4')).toBeNull()
    })
  })

  describe('Release Manager column', () => {
    afterEach(() => {
      // Reset the shared module mock so a `hidden` set within a test cannot
      // leak into a later one (robust to reordering / .only / shuffle).
      mockedUseFieldConfig.mockReturnValue({ data: undefined } as unknown as ReturnType<
        typeof useFieldConfig
      >)
    })

    it('renders a Release Manager column header', () => {
      renderTable([makeComponent()])
      expect(screen.getByRole('columnheader', { name: 'Release Manager' })).toBeDefined()
    })

    it('places the Release Manager column immediately after Owner', () => {
      renderTable([makeComponent()])
      const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())
      const ownerIdx = headers.findIndex((h) => h === 'Owner')
      const rmIdx = headers.findIndex((h) => h === 'Release Manager')
      expect(ownerIdx).toBeGreaterThanOrEqual(0)
      expect(rmIdx).toBe(ownerIdx + 1)
    })

    it('renders em-dash when releaseManagers is empty', () => {
      renderTable([makeComponent({ releaseManagers: [] })])
      expect(cellForColumn('Release Manager').textContent).toContain('—')
    })

    it('renders em-dash when releaseManagers is absent (optional field)', () => {
      // makeComponent omits releaseManagers → getValue() is undefined.
      renderTable([makeComponent()])
      expect(cellForColumn('Release Manager').textContent).toContain('—')
    })

    it('renders a single release manager as a chip', () => {
      renderTable([makeComponent({ releaseManagers: ['jsmith'] })])
      expect(within(cellForColumn('Release Manager')).getByText('jsmith')).toBeDefined()
    })

    it('renders +N overflow badge when more than 3 release managers are present', () => {
      renderTable([makeComponent({ releaseManagers: ['a', 'b', 'c', 'd'] })])
      const cell = cellForColumn('Release Manager')
      expect(within(cell).getByText('a')).toBeDefined()
      expect(within(cell).getByText('+1')).toBeDefined()
      expect(within(cell).queryByText('d')).toBeNull()
    })

    it('hides the Release Manager column when component.releaseManager visibility is hidden', () => {
      // Same code-as-config gate as the System column — a hidden field-config
      // entry must remove the list column, not only the editor control.
      mockedUseFieldConfig.mockReturnValue({
        data: { component: { releaseManager: { visibility: 'hidden' } } },
      } as unknown as ReturnType<typeof useFieldConfig>)
      renderTable([makeComponent({ releaseManagers: ['jsmith'] })])
      expect(screen.queryByRole('columnheader', { name: 'Release Manager' })).toBeNull()
      expect(screen.queryByText('jsmith')).toBeNull()
    })
  })

  describe('System column visibility (field-config `component.system.visibility`)', () => {
    // The list table honours the field-config visibility flag: an installation
    // that sets `component.system.visibility: hidden` in service-config expects
    // the System column gone from the list, not just from the editor forms.
    afterEach(() => {
      // Reset to the default so a `hidden` set here does not leak into the
      // shared module mock used by every other test in the file.
      mockedUseFieldConfig.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useFieldConfig>)
    })

    it('hides the System column when component.system visibility is hidden', () => {
      mockedUseFieldConfig.mockReturnValue({
        data: { component: { system: { visibility: 'hidden' } } },
      } as unknown as ReturnType<typeof useFieldConfig>)
      renderTable([makeComponent({ systems: ['SYS1'] })])
      expect(screen.queryByRole('columnheader', { name: 'System' })).toBeNull()
      // The value chip must be gone too — not just the header.
      expect(screen.queryByText('SYS1')).toBeNull()
    })

    it('shows the System column when component.system visibility is editable', () => {
      mockedUseFieldConfig.mockReturnValue({
        data: { component: { system: { visibility: 'editable' } } },
      } as unknown as ReturnType<typeof useFieldConfig>)
      renderTable([makeComponent({ systems: ['SYS1'] })])
      expect(screen.getByRole('columnheader', { name: 'System' })).toBeDefined()
    })

    it('shows the System column when no field-config is present (defaults to editable)', () => {
      // Default mock → data undefined → visibilityFor falls back to 'editable'.
      renderTable([makeComponent({ systems: ['SYS1'] })])
      expect(screen.getByRole('columnheader', { name: 'System' })).toBeDefined()
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

  describe('Updated column — relative time', () => {
    it('renders a relative-time label with the absolute date in the title tooltip', () => {
      // A timestamp ~3 days in the past. RelativeTime renders "N days ago" with
      // the en-GB absolute date in the native title (one hover away).
      const then = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      renderTable([makeComponent({ updatedAt: then })])
      const cell = cellForColumn('Updated')
      expect(cell.textContent).toMatch(/days ago/i)
      // The absolute date lives in the title attribute of the inner span.
      const span = cell.querySelector('span[title]')
      expect(span).not.toBeNull()
      expect(span!.getAttribute('title')).toMatch(/\d{4}/) // year present in en-GB date
    })

    it('renders an em-dash for a null updatedAt', () => {
      renderTable([makeComponent({ updatedAt: null })])
      expect(cellForColumn('Updated').textContent).toContain('—')
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

function renderTableWithValidation(
  data: ComponentSummary[],
  validationByComponent: Map<string, ComponentValidation>,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      <MemoryRouter>
        <TooltipProvider>
          <ComponentTable
            data={data}
            isLoading={false}
            validationByComponent={validationByComponent}
          />
        </TooltipProvider>
      </MemoryRouter>,
    ),
  )
}

function validationWithProblems(component: string): ComponentValidation {
  return {
    component,
    problems: [
      {
        type: 'UNREGISTERED_RELEASED_VERSIONS',
        severity: 'ERROR',
        message: '2 released version(s) not registered in components-registry',
        details: { versions: ['v1', 'v2'], missingCount: 2, releasedCount: 4 },
      },
    ],
    checkFailed: false,
    checkError: null,
  }
}

function validationCheckFailed(component: string): ComponentValidation {
  return {
    component,
    problems: [],
    checkFailed: true,
    checkError: 'RM returned 500',
  }
}

describe('ComponentTable — inline validation triangle', () => {
  beforeEach(() => {
    mockLinks(null)
  })

  it('does not render a separate Validation column header', () => {
    renderTableWithValidation([makeComponent({ name: 'alpha' })], new Map())
    expect(screen.queryByRole('columnheader', { name: 'Validation' })).toBeNull()
  })

  it('does not render a separate Validation column header even with problems present', () => {
    const map = new Map<string, ComponentValidation>([['alpha', validationWithProblems('alpha')]])
    renderTableWithValidation([makeComponent({ name: 'alpha' })], map)
    expect(screen.queryByRole('columnheader', { name: 'Validation' })).toBeNull()
  })

  it('renders a red triangle before the name for a component with problems (matched by key)', () => {
    const map = new Map<string, ComponentValidation>([['alpha', validationWithProblems('alpha')]])
    renderTableWithValidation([makeComponent({ name: 'alpha' })], map)
    // The triangle trigger is a button carrying the problem-count aria-label,
    // and it lives inside the Component Key cell, before the name link.
    const trigger = screen.getByRole('button', { name: /2 validation problems/i })
    expect(trigger).toBeDefined()
    const nameCell = cellForColumn('Component Key')
    expect(nameCell.contains(trigger)).toBe(true)
    expect(within(nameCell).getByRole('link', { name: 'alpha' })).toBeDefined()
  })

  it('clicking the triangle opens the full-list dialog showing the versions', async () => {
    const map = new Map<string, ComponentValidation>([['alpha', validationWithProblems('alpha')]])
    renderTableWithValidation([makeComponent({ name: 'alpha' })], map)
    await userEvent.click(screen.getByRole('button', { name: /2 validation problems/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Validation Problems')).toBeDefined()
    expect(within(dialog).getByText('v1')).toBeDefined()
    expect(within(dialog).getByText('v2')).toBeDefined()
    // The full-list copy affordance is present in the dialog.
    expect(within(dialog).getByRole('button', { name: /copy versions/i })).toBeDefined()
  })

  it('renders NO triangle for a check-failed component (a system failure is not a per-component problem)', () => {
    const map = new Map<string, ComponentValidation>([['alpha', validationCheckFailed('alpha')]])
    renderTableWithValidation([makeComponent({ name: 'alpha' })], map)
    // A failed check is an operational condition surfaced once at report level
    // (the list-page system banner), never as a per-row triangle — so a
    // transient backend outage cannot light up every row in the table.
    expect(screen.queryByRole('button', { name: /validation check failed/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /validation problem/i })).toBeNull()
    // The name link still renders normally.
    expect(within(cellForColumn('Component Key')).getByRole('link', { name: 'alpha' })).toBeDefined()
  })

  it('renders no triangle for a clean / unmatched component', () => {
    renderTableWithValidation([makeComponent({ name: 'clean-one' })], new Map())
    expect(screen.queryByRole('button', { name: /validation problem/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /validation check failed/i })).toBeNull()
  })

  it('renders no triangle for a non-admin (validation map not passed at all)', () => {
    // renderTable() omits validationByComponent entirely — the non-admin path.
    renderTable([makeComponent({ name: 'alpha' })])
    expect(screen.queryByRole('button', { name: /validation problem/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /validation check failed/i })).toBeNull()
  })
})

describe('ComponentTable — per-row Clone action', () => {
  beforeEach(() => {
    mockLinks(null)
  })

  it('renders a Clone button per row (icon + label) and reports the row id when onCopy is provided', async () => {
    const onCopy = vi.fn()
    renderTable(
      [
        makeComponent({ id: 'c1', name: 'alpha' }),
        makeComponent({ id: 'c2', name: 'beta' }),
      ],
      onCopy,
    )
    // The action is labelled "Clone" with a "Clone <key> into a new component"
    // accessible name (used as both aria-label and the tooltip text).
    const alphaClone = screen.getByRole('button', { name: 'Clone alpha into a new component' })
    expect(screen.getByRole('button', { name: 'Clone beta into a new component' })).toBeDefined()
    // The visible label reads "Clone" (not the old "Create similar" copy).
    expect(alphaClone.textContent).toContain('Clone')
    await userEvent.click(alphaClone)
    expect(onCopy).toHaveBeenCalledWith('c1')
  })

  it('exposes the Clone tooltip text on hover (Clone <key> into a new component)', async () => {
    const onCopy = vi.fn()
    renderTable([makeComponent({ id: 'c1', name: 'alpha' })], onCopy)
    await userEvent.hover(screen.getByRole('button', { name: 'Clone alpha into a new component' }))
    // Radix renders the tooltip content into a portal on hover; the text
    // "Clone alpha into a new component" appears (possibly more than once across
    // the a11y mirror + visible content).
    const tips = await screen.findAllByText('Clone alpha into a new component')
    expect(tips.length).toBeGreaterThan(0)
  })

  it('no longer uses the old "Create similar" label', () => {
    renderTable([makeComponent({ id: 'c1', name: 'alpha' })], vi.fn())
    expect(screen.queryByRole('button', { name: /create similar/i })).toBeNull()
  })

  it('renders no Clone buttons or actions column when onCopy is omitted', () => {
    renderTable([makeComponent({ id: 'c1', name: 'alpha' })])
    expect(screen.queryByRole('button', { name: /clone .* into a new component/i })).toBeNull()
  })
})
