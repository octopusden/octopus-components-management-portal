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

// One changed field (build.javaVersion) among unchanged ones, with two fields
// before and three after, so CONTEXT=1 keeps one context row on each side and
// collapses the rest into a 1-field gap (before) and a 2-field gap (after).
const updateEntry = entry({
  oldValue: { a1: 'x', a2: 'y', 'build.javaVersion': '1.8', b1: 'p', b2: 'q', b3: 'r' },
  newValue: { a1: 'x', a2: 'y', 'build.javaVersion': '17', b1: 'p', b2: 'q', b3: 'r' },
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

  it('keeps one context row on each side of a change and collapses the rest', () => {
    render(<AuditDiffViewer entry={updateEntry} />)
    // Context: a2 (one before) and b1 (one after) stay visible alongside the change.
    expect(screen.getByText('a2')).toBeDefined()
    expect(screen.getByText('b1')).toBeDefined()
    // Collapsed: a1 (1-field gap before), b2 + b3 (2-field gap after).
    expect(screen.queryByText('a1')).toBeNull()
    expect(screen.queryByText('b2')).toBeNull()
    expect(screen.queryByText('b3')).toBeNull()
    expect(screen.getByRole('button', { name: /show 1 unchanged field$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /show 2 unchanged fields/i })).toBeDefined()
  })

  it('reveals a gap when its expander is clicked, and can re-collapse it', () => {
    render(<AuditDiffViewer entry={updateEntry} />)
    fireEvent.click(screen.getByRole('button', { name: /show 2 unchanged fields/i }))
    expect(screen.getByText('b2')).toBeDefined()
    expect(screen.getByText('b3')).toBeDefined()
    // The other gap stays collapsed (independent).
    expect(screen.queryByText('a1')).toBeNull()
    // Re-collapse.
    fireEvent.click(screen.getByRole('button', { name: /hide 2 unchanged fields/i }))
    expect(screen.queryByText('b2')).toBeNull()
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
    // x is detected as changed (a → b) via the value-comparison fallback.
    expect(screen.getByText('x')).toBeDefined()
    expect(screen.getByText('1 changed field')).toBeDefined()
    const table = screen.getByRole('table')
    expect(within(table).getByText('a')).toBeDefined()
    expect(within(table).getByText('b')).toBeDefined()
  })

  it('treats a present-but-empty changeDiff as authoritative (nothing changed)', () => {
    render(
      // Values DIFFER, but the empty changeDiff says nothing changed — so this
      // also fails if the value-comparison fallback were wrongly used here.
      <AuditDiffViewer
        entry={entry({ oldValue: { a: '1', b: '2' }, newValue: { a: 'X', b: 'Y' }, changeDiff: {} })}
      />,
    )
    expect(screen.getByText('0 changed fields')).toBeDefined()
    // No field is highlighted/expanded; both collapse into one gap.
    expect(screen.getByRole('button', { name: /show 2 unchanged fields/i })).toBeDefined()
  })

  it('does not crash when changeDiff is undefined (missing field), falls back to values', () => {
    render(
      <AuditDiffViewer
        entry={entry({ oldValue: { x: 'a' }, newValue: { x: 'b' }, changeDiff: undefined as unknown as null })}
      />,
    )
    // undefined must not throw (Object.keys guard); fallback detects x changed.
    expect(screen.getByText('x')).toBeDefined()
    expect(screen.getByText('1 changed field')).toBeDefined()
  })

  it('fallback compares nested objects structurally, key-order independent', () => {
    render(
      <AuditDiffViewer
        entry={entry({
          // `same` differs only in key order; `filler` keeps it outside the
          // context window so it collapses (proving it's classified unchanged).
          oldValue: { cfg: { a: 1, b: 2 }, filler: 'z', same: { p: 1, q: 2 } },
          newValue: { cfg: { a: 1, b: 3 }, filler: 'z', same: { q: 2, p: 1 } },
          changeDiff: null,
        })}
      />,
    )
    // Only cfg changed (b: 2→3). If canonical were order-sensitive, `same` would
    // also count as changed → "2 changed fields".
    expect(screen.getByText('cfg')).toBeDefined()
    expect(screen.getByText('1 changed field')).toBeDefined()
    expect(screen.queryByText('same')).toBeNull()
  })

  it('fallback detects a type-only change (1 vs "1") that renders identically', () => {
    render(
      <AuditDiffViewer
        entry={entry({ oldValue: { n: 1 }, newValue: { n: '1' }, changeDiff: null })}
      />,
    )
    // Same displayed text ("1") but different underlying type → still a change.
    expect(screen.getByText('n')).toBeDefined()
    expect(screen.getByText('1 changed field')).toBeDefined()
  })

  it('fallback treats a removed field (present → absent) as changed', () => {
    render(
      <AuditDiffViewer
        entry={entry({ oldValue: { gone: 'v', keep: 'same' }, newValue: { keep: 'same' }, changeDiff: null })}
      />,
    )
    // `gone` present only in old → change detected (old 'v', new '—').
    expect(screen.getByText('gone')).toBeDefined()
    expect(screen.getByText('1 changed field')).toBeDefined()
    expect(screen.getByText('v')).toBeDefined()
  })
})
