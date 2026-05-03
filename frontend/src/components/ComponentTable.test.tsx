import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
      // No GRADLE/MAVEN-style badge text when buildSystem is null. Assert
      // by what's NOT there + global em-dash presence; column-position
      // selectors would tie the test to current column order.
      expect(screen.queryByText(/^(GRADLE|MAVEN)$/)).toBeNull()
      expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })
  })

  describe('SYS-040 — Links column env-driven rendering', () => {
    const env = import.meta.env as Record<string, unknown>

    beforeEach(() => {
      delete env.VITE_JIRA_BASE_URL
      delete env.VITE_GIT_BASE_URL
      delete env.VITE_TC_BASE_URL
      delete env.VITE_DMS_BASE_URL
    })

    afterEach(() => {
      delete env.VITE_JIRA_BASE_URL
      delete env.VITE_GIT_BASE_URL
      delete env.VITE_TC_BASE_URL
      delete env.VITE_DMS_BASE_URL
    })

    it('renders Jira icon when VITE_JIRA_BASE_URL is set and jiraProjectKey present', () => {
      env.VITE_JIRA_BASE_URL = 'https://jira.example.com'
      renderTable([makeComponent({ jiraProjectKey: 'PROJ' })])
      const link = screen.getByRole('link', { name: /Jira: PROJ/i })
      expect(link).toBeDefined()
      expect((link as HTMLAnchorElement).href).toBe('https://jira.example.com/browse/PROJ')
    })

    it('does NOT render Jira icon when env is missing even if jiraProjectKey is present', () => {
      renderTable([makeComponent({ jiraProjectKey: 'PROJ' })])
      expect(screen.queryByRole('link', { name: /Jira/i })).toBeNull()
    })

    it('does NOT render Jira icon when env is set but jiraProjectKey is null', () => {
      env.VITE_JIRA_BASE_URL = 'https://jira.example.com'
      renderTable([makeComponent({ jiraProjectKey: null })])
      expect(screen.queryByRole('link', { name: /Jira/i })).toBeNull()
    })

    it('renders Git icon when VITE_GIT_BASE_URL and vcsPath present', () => {
      env.VITE_GIT_BASE_URL = 'https://git.example.com'
      renderTable([makeComponent({ vcsPath: 'org/repo' })])
      const link = screen.getByRole('link', { name: /Git: org\/repo/i })
      expect(link).toBeDefined()
      expect((link as HTMLAnchorElement).href).toBe('https://git.example.com/org/repo')
    })

    it('renders TeamCity icon based solely on env (uses component name)', () => {
      env.VITE_TC_BASE_URL = 'https://tc.example.com'
      renderTable([makeComponent({ name: 'alpha' })])
      const link = screen.getByRole('link', { name: /TeamCity: alpha/i })
      expect(link).toBeDefined()
      expect((link as HTMLAnchorElement).href).toBe('https://tc.example.com/alpha')
    })

    it('renders DMS icon based solely on env (uses component name)', () => {
      env.VITE_DMS_BASE_URL = 'https://dms.example.com'
      renderTable([makeComponent({ name: 'alpha' })])
      const link = screen.getByRole('link', { name: /DMS: alpha/i })
      expect(link).toBeDefined()
    })

    it('renders em-dash when no env vars are set', () => {
      renderTable([makeComponent()])
      // Without any link-base env var set, no link icon renders — assert
      // by absence of any Jira/Git/TC/DMS anchor instead of a positional
      // cell selector.
      expect(screen.queryByRole('link', { name: /Jira|Git|TeamCity|DMS/i })).toBeNull()
      expect(screen.getAllByText('—').length).toBeGreaterThan(0)
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
