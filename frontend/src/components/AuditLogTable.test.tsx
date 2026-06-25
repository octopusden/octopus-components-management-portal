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
    // PR-3: target the SkeletonTable primitive's data-testid instead of
    // a fragile className selector — survives Tailwind class churn.
    expect(screen.getByTestId('skeleton-table')).toBeDefined()
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

  it('applies the secondary Badge variant for unknown action types', () => {
    render(<AuditLogTable data={[makeEntry({ action: 'CUSTOM_ACTION' })]} isLoading={false} />)
    // Badge is the closest [data-variant] ancestor of the action label.
    const badge = screen.getByText('CUSTOM_ACTION').closest('[data-variant]')
    expect(badge?.getAttribute('data-variant')).toBe('secondary')
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

  it('shows the component key (newValue.name) as the link text while routing by the entityId UUID', () => {
    render(
      <MemoryRouter>
        <AuditLogTable
          data={[
            makeEntry({
              entityType: 'Component',
              entityId: '9d2c9e21-84af-42d6-b342-353cc6a4718b',
              newValue: { name: 'payment-gateway', labels: ['x'] },
            }),
          ]}
          isLoading={false}
        />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'payment-gateway' })
    expect(link.getAttribute('href')).toBe('/components/9d2c9e21-84af-42d6-b342-353cc6a4718b')
    // The raw UUID is no longer surfaced as a column value.
    expect(screen.queryByText('9d2c9e21-84af-42d6-b342-353cc6a4718b')).toBeNull()
  })

  it('falls back to oldValue.name for DELETE rows (newValue is null)', () => {
    render(
      <MemoryRouter>
        <AuditLogTable
          data={[
            makeEntry({
              entityType: 'Component',
              entityId: 'uuid-del',
              action: 'DELETE',
              oldValue: { name: 'gamma' },
              newValue: null,
            }),
          ]}
          isLoading={false}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'gamma' }).getAttribute('href')).toBe('/components/uuid-del')
  })

  it('prefers the new name on RENAME rows', () => {
    render(
      <MemoryRouter>
        <AuditLogTable
          data={[
            makeEntry({
              entityType: 'Component',
              entityId: 'uuid-ren',
              action: 'RENAME',
              oldValue: { name: 'old-name' },
              newValue: { name: 'new-name' },
            }),
          ]}
          isLoading={false}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'new-name' })).toBeDefined()
    expect(screen.queryByRole('link', { name: 'old-name' })).toBeNull()
  })

  it('prefers the server-resolved componentKey over the value snapshot', () => {
    render(
      <MemoryRouter>
        <AuditLogTable
          data={[
            makeEntry({
              entityType: 'Component',
              entityId: 'uuid-srv',
              componentKey: 'billing-core',
              newValue: { name: 'stale-snapshot-name' },
            }),
          ]}
          isLoading={false}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'billing-core' }).getAttribute('href')).toBe('/components/uuid-srv')
  })

  it('uses the componentKey for field-override rows whose snapshot carries no name', () => {
    render(
      <MemoryRouter>
        <AuditLogTable
          data={[
            makeEntry({
              entityType: 'Component',
              entityId: 'uuid-fo',
              componentKey: 'payment-gateway',
              // Field-override snapshots carry only the override payload.
              oldValue: { 'fieldOverride[build.buildFilePath]': { versionRange: '[1.0,2.0)' } },
              newValue: {},
            }),
          ]}
          isLoading={false}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'payment-gateway' })).toBeDefined()
  })

  it('falls back to snapshot moduleName for git-history MIGRATED rows (no componentKey, no name)', () => {
    render(
      <MemoryRouter>
        <AuditLogTable
          data={[
            makeEntry({
              entityType: 'Component',
              entityId: 'uuid-mig',
              action: 'MIGRATED',
              oldValue: null,
              newValue: { moduleName: 'legacy-module', moduleConfigurations: [] },
            }),
          ]}
          isLoading={false}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'legacy-module' }).getAttribute('href')).toBe('/components/uuid-mig')
  })

  it('falls back to the entityId as link text when neither old nor new value carries a name', () => {
    render(
      <MemoryRouter>
        <AuditLogTable
          data={[
            makeEntry({ entityType: 'Component', entityId: 'comp-42', newValue: { labels: ['x'] } }),
          ]}
          isLoading={false}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'comp-42' }).getAttribute('href')).toBe('/components/comp-42')
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

  it('applies the success Badge variant for CREATE action', () => {
    render(<AuditLogTable data={[makeEntry({ action: 'CREATE' })]} isLoading={false} />)
    const badge = screen.getByText('CREATE').closest('[data-variant]')
    expect(badge?.getAttribute('data-variant')).toBe('success')
  })

  it('applies the warning Badge variant for UPDATE action', () => {
    render(<AuditLogTable data={[makeEntry({ action: 'UPDATE' })]} isLoading={false} />)
    const badge = screen.getByText('UPDATE').closest('[data-variant]')
    expect(badge?.getAttribute('data-variant')).toBe('warning')
  })

  it('applies the destructive Badge variant for DELETE action', () => {
    render(<AuditLogTable data={[makeEntry({ action: 'DELETE' })]} isLoading={false} />)
    const badge = screen.getByText('DELETE').closest('[data-variant]')
    expect(badge?.getAttribute('data-variant')).toBe('destructive')
  })

  it('applies the warning Badge variant for RENAME action', () => {
    render(<AuditLogTable data={[makeEntry({ action: 'RENAME' })]} isLoading={false} />)
    const badge = screen.getByText('RENAME').closest('[data-variant]')
    expect(badge?.getAttribute('data-variant')).toBe('warning')
  })

  it('applies the muted secondary Badge variant for MIGRATED action', () => {
    render(<AuditLogTable data={[makeEntry({ action: 'MIGRATED' })]} isLoading={false} />)
    const badge = screen.getByText('MIGRATED').closest('[data-variant]')
    expect(badge?.getAttribute('data-variant')).toBe('secondary')
  })
})
