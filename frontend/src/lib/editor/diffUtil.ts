import type { DiffEntry } from './combineRequest'

/** Structural deep-equality (JSON-shaped values only: scalars, arrays, plain
 *  objects). Sufficient for the editor's snapshot-vs-current dirty compare —
 *  all section state is JSON-serialisable form data. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (typeof a === 'object') {
    const ao = a as Record<string, unknown>
    const bo = b as Record<string, unknown>
    const ak = Object.keys(ao)
    const bk = Object.keys(bo)
    if (ak.length !== bk.length) return false
    return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]))
  }
  return false
}

/** Render a value for the diff dialog. Empty/blank → em-dash so a clear reads
 *  as "Foo → —" rather than "Foo → ". Arrays join with ", ". */
export function formatDiffValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.join(', ')
  if (typeof v === 'boolean') return v ? 'On' : 'Off'
  const s = String(v)
  return s.trim() === '' ? '—' : s
}

/**
 * Build a scalar diff row when `next !== prior`. Returns null when unchanged.
 * `clearedScalarNoop` marks an aspect-scalar clear (next blank, prior non-blank)
 * that CRS v4 PATCH silently ignores — passed through to the dialog warning.
 */
export function scalarDiff(
  label: string,
  prior: string,
  next: string,
  opts: { aspectScalar?: boolean } = {},
): DiffEntry | null {
  if (prior === next) return null
  const clearedScalarNoop = opts.aspectScalar === true && next.trim() === '' && prior.trim() !== ''
  return { label, oldValue: formatDiffValue(prior), newValue: formatDiffValue(next), clearedScalarNoop }
}

/** Boolean diff row (no no-op annotation — booleans always persist). */
export function boolDiff(label: string, prior: boolean, next: boolean): DiffEntry | null {
  if (prior === next) return null
  return { label, oldValue: formatDiffValue(prior), newValue: formatDiffValue(next) }
}

/** List/array diff row (REPLACE semantics — clears persist, so never flagged). */
export function listDiff(label: string, prior: unknown[], next: unknown[]): DiffEntry | null {
  if (deepEqual(prior, next)) return null
  return { label, oldValue: formatDiffValue(prior), newValue: formatDiffValue(next) }
}
