import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { AuditDiffViewer } from './AuditDiffViewer'
import type { AuditLogEntry } from '../lib/types'

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 1,
    entityType: 'Component',
    entityId: 'c-1',
    action: 'UPDATE',
    changedBy: 'pgorbachev',
    changedAt: '2026-07-10T14:31:24Z',
    oldValue: null,
    newValue: null,
    changeDiff: null,
    correlationId: null,
    ...overrides,
  }
}

// One changed field (build.javaVersion) among several unchanged ones — mirrors
// the reported TransactionSwitchKernel edit.
const updateEntry = entry({
  oldValue: { 'build.buildSystem': 'MAVEN', 'build.javaVersion': '1.8', 'build.mavenVersion': '3.6.3', 'escrow.generation': 'AUTO' },
  newValue: { 'build.buildSystem': 'MAVEN', 'build.javaVersion': '17', 'build.mavenVersion': '3.6.3', 'escrow.generation': 'AUTO' },
  changeDiff: { 'build.javaVersion': { old: '1.8', new: '17' } },
})

describe('AuditDiffViewer', () => {
  it('renders a placeholder when there is no value data', () => {
    render(<AuditDiffViewer entry={entry()} />)
    expect(screen.getByText(/no value data recorded/i)).toBeDefined()
  })

  it('shows the changed field with both old and new values', () => {
    render(<AuditDiffViewer entry={updateEntry} />)
    expect(screen.getByText('build.javaVersion')).toBeDefined()
    expect(screen.getByText('1.8')).toBeDefined()
    expect(screen.getByText('17')).toBeDefined()
    expect(screen.getByText('1 changed field')).toBeDefined()
  })

  it('collapses unchanged fields by default behind expanders', () => {
    render(<AuditDiffViewer entry={updateEntry} />)
    // The changed field sits between unchanged ones, so the unchanged fields
    // split into two gaps: [build.buildSystem] before, [build.mavenVersion,
    // escrow.generation] after. All are hidden until expanded.
    expect(screen.queryByText('escrow.generation')).toBeNull()
    expect(screen.queryByText('build.mavenVersion')).toBeNull()
    expect(screen.queryByText('build.buildSystem')).toBeNull()
    expect(screen.getByRole('button', { name: /show 1 unchanged field$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /show 2 unchanged fields/i })).toBeDefined()
  })

  it('reveals a gap when its expander is clicked, and can re-collapse it', () => {
    render(<AuditDiffViewer entry={updateEntry} />)
    fireEvent.click(screen.getByRole('button', { name: /show 2 unchanged fields/i }))
    expect(screen.getByText('escrow.generation')).toBeDefined()
    expect(screen.getByText('build.mavenVersion')).toBeDefined()
    // The other gap stays collapsed (independent).
    expect(screen.queryByText('build.buildSystem')).toBeNull()
    // Re-collapse.
    fireEvent.click(screen.getByRole('button', { name: /hide 2 unchanged fields/i }))
    expect(screen.queryByText('escrow.generation')).toBeNull()
  })

  it('renders a single shared scroll container (aligned, synchronized old/new)', () => {
    const { container } = render(<AuditDiffViewer entry={updateEntry} />)
    // One table (unified) inside exactly one overflow-auto scroll region — not
    // two independently scrolling panels.
    expect(container.querySelectorAll('table')).toHaveLength(1)
    expect(container.querySelectorAll('.overflow-auto')).toHaveLength(1)
  })

  it('shows every field for a created record (no old value) with no expander', () => {
    render(
      <AuditDiffViewer
        entry={entry({ newValue: { a: '1', b: '2', c: '3' }, oldValue: null })}
      />,
    )
    expect(screen.getByText('Record created')).toBeDefined()
    for (const k of ['a', 'b', 'c']) expect(screen.getByText(k)).toBeDefined()
    expect(screen.queryByRole('button', { name: /unchanged fields/i })).toBeNull()
  })

  it('labels a deleted record and shows its fields', () => {
    render(
      <AuditDiffViewer
        entry={entry({ oldValue: { a: '1', b: '2' }, newValue: null })}
      />,
    )
    expect(screen.getByText('Record deleted')).toBeDefined()
    expect(screen.getByText('a')).toBeDefined()
  })

  it('falls back to value comparison when changeDiff is absent', () => {
    render(
      <AuditDiffViewer
        entry={entry({ oldValue: { x: 'a', y: 'same' }, newValue: { x: 'b', y: 'same' }, changeDiff: null })}
      />,
    )
    // x changed → visible; y unchanged → collapsed.
    expect(screen.getByText('x')).toBeDefined()
    expect(screen.queryByText('y')).toBeNull()
    const table = screen.getByRole('table')
    expect(within(table).getByText('a')).toBeDefined()
    expect(within(table).getByText('b')).toBeDefined()
  })
})
