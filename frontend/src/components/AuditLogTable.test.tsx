import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { AuditLogTable } from './AuditLogTable'
import type { AuditLogEntry } from '../lib/types'

vi.mock('./AuditDiffViewer', () => ({
  AuditDiffViewer: () => <div data-testid="audit-diff-viewer" />,
}))

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 1,
    entityType: 'component',
    entityId: 'comp-1',
    action: 'UPDATE',
    changedBy: 'alice',
    changedAt: '2026-04-30T10:00:00Z',
    oldValue: null,
    newValue: null,
    changeDiff: null,
    correlationId: null,
    ...overrides,
  }
}

describe('AuditLogTable', () => {
  it('renders skeleton rows while loading', () => {
    render(<AuditLogTable data={[]} isLoading />)
    const cells = document.querySelectorAll('.animate-pulse')
    expect(cells.length).toBeGreaterThan(0)
  })

  it('shows empty state when data is empty and not loading', () => {
    render(<AuditLogTable data={[]} isLoading={false} />)
    expect(screen.getByText('No audit log entries found.')).toBeDefined()
  })

  it('renders a row for each entry', () => {
    const entries = [makeEntry({ id: 1, changedBy: 'alice' }), makeEntry({ id: 2, changedBy: 'bob' })]
    render(<AuditLogTable data={entries} isLoading={false} />)
    expect(screen.getByText('alice')).toBeDefined()
    expect(screen.getByText('bob')).toBeDefined()
  })

  it('shows "system" in italic when changedBy is null', () => {
    render(<AuditLogTable data={[makeEntry({ changedBy: null })]} isLoading={false} />)
    expect(screen.getByText('system')).toBeDefined()
  })

  it('expands row on click and shows AuditDiffViewer', async () => {
    render(<AuditLogTable data={[makeEntry()]} isLoading={false} />)
    expect(screen.queryByTestId('audit-diff-viewer')).toBeNull()
    await userEvent.click(screen.getAllByRole('row')[1]!)
    expect(screen.getByTestId('audit-diff-viewer')).toBeDefined()
  })

  it('collapses already-expanded row on second click', async () => {
    render(<AuditLogTable data={[makeEntry()]} isLoading={false} />)
    const row = screen.getAllByRole('row')[1]!
    await userEvent.click(row)
    expect(screen.getByTestId('audit-diff-viewer')).toBeDefined()
    await userEvent.click(row)
    expect(screen.queryByTestId('audit-diff-viewer')).toBeNull()
  })

  it('shows correlationId when expanded and present', async () => {
    render(
      <AuditLogTable
        data={[makeEntry({ correlationId: 'corr-xyz' })]}
        isLoading={false}
      />,
    )
    await userEvent.click(screen.getAllByRole('row')[1]!)
    expect(screen.getByText('corr-xyz')).toBeDefined()
  })

  it('does not show correlation line when correlationId is null', async () => {
    render(<AuditLogTable data={[makeEntry({ correlationId: null })]} isLoading={false} />)
    await userEvent.click(screen.getAllByRole('row')[1]!)
    expect(screen.queryByText(/Correlation ID/)).toBeNull()
  })

  it('shows diff summary for ≤3 changed fields', () => {
    render(
      <AuditLogTable
        data={[makeEntry({ changeDiff: { name: null, owner: null } })]}
        isLoading={false}
      />,
    )
    expect(screen.getByText('name, owner')).toBeDefined()
  })

  it('shows truncated summary with count for >3 changed fields', () => {
    render(
      <AuditLogTable
        data={[makeEntry({ changeDiff: { a: null, b: null, c: null, d: null, e: null } })]}
        isLoading={false}
      />,
    )
    expect(screen.getByText('a, b, c +2 more')).toBeDefined()
  })

  it('shows — when changeDiff is null', () => {
    render(<AuditLogTable data={[makeEntry({ changeDiff: null })]} isLoading={false} />)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('shows — when changeDiff is empty', () => {
    render(<AuditLogTable data={[makeEntry({ changeDiff: {} })]} isLoading={false} />)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('applies a muted badge class for unknown action types', () => {
    render(<AuditLogTable data={[makeEntry({ action: 'CUSTOM_ACTION' })]} isLoading={false} />)
    const badge = screen.getByText('CUSTOM_ACTION')
    expect(badge.className).toContain('bg-muted')
  })

  it('renders entityId as a link to /components/{id} when entityType is Component (PascalCase)', () => {
    render(
      <MemoryRouter>
        <AuditLogTable
          data={[makeEntry({ entityType: 'Component', entityId: 'comp-42' })]}
          isLoading={false}
        />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'comp-42' })
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toBe('/components/comp-42')
  })

  it('renders entityId as mono text (not a link) when entityType is not Component', () => {
    render(
      <MemoryRouter>
        <AuditLogTable
          data={[makeEntry({ entityType: 'FieldOverride', entityId: 'fo-99' })]}
          isLoading={false}
        />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: 'fo-99' })).toBeNull()
    expect(screen.getByText('fo-99')).toBeDefined()
  })

  it('does NOT render a link for lowercase "component" (case-sensitive check)', () => {
    render(
      <MemoryRouter>
        <AuditLogTable
          data={[makeEntry({ entityType: 'component', entityId: 'comp-1' })]}
          isLoading={false}
        />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: 'comp-1' })).toBeNull()
  })

  it('applies green badge class for CREATE action', () => {
    render(<AuditLogTable data={[makeEntry({ action: 'CREATE' })]} isLoading={false} />)
    const badge = screen.getByText('CREATE')
    expect(badge.className).toContain('bg-green-100')
  })

  it('applies yellow badge class for UPDATE action', () => {
    render(<AuditLogTable data={[makeEntry({ action: 'UPDATE' })]} isLoading={false} />)
    const badge = screen.getByText('UPDATE')
    expect(badge.className).toContain('bg-yellow-100')
  })

  it('applies red badge class for DELETE action', () => {
    render(<AuditLogTable data={[makeEntry({ action: 'DELETE' })]} isLoading={false} />)
    const badge = screen.getByText('DELETE')
    expect(badge.className).toContain('bg-red-100')
  })

  it('applies yellow badge class for RENAME action', () => {
    render(<AuditLogTable data={[makeEntry({ action: 'RENAME' })]} isLoading={false} />)
    const badge = screen.getByText('RENAME')
    expect(badge.className).toContain('bg-yellow-100')
  })
})
