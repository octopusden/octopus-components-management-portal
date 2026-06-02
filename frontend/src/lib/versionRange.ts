export function formatVersionRange(range: string): string {
  if (range === '(,)') return 'All versions'
  return range
}

export function isValidVersionRange(range: string): boolean {
  if (!range) return false
  // Basic validation: must start with ( or [ and end with ) or ]
  const trimmed = range.trim()
  if (trimmed.length < 3) return false
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if ((first !== '(' && first !== '[') || (last !== ')' && last !== ']')) return false
  // Must contain a comma
  if (!trimmed.includes(',')) return false
  return true
}

/**
 * Returns true when `range` is allowed as a field-override range under D5:
 * syntactically valid AND not open-upward in its trailing segment. Universal
 * forms (`(,)`, `(,0),[0,)`) and simple open-upward (`[X,)` / `(X,)`) end
 * with `,)` and are rejected — they belong to BASE, not overrides.
 *
 * Allowed: closed (`[X,Y)`, `[X,Y]`, `(X,Y)`, `(X,Y]`) and
 * historical-left-unbounded (`(,X)`, `(,X]`), plus composites whose trailing
 * segment satisfies the same rule.
 *
 * Known limitation: composites with open-upward in a non-terminal segment
 * (e.g. `[1.0,),[2.0,3.0]`) slip past this check because the string ends in
 * `]`. CRS-side validation (D5 enforcement on POST/PATCH, PR-A step 5) is
 * the authoritative backstop; a parser-backed Portal check is tracked as
 * P-Releng (R2) in the plan.
 */
export function isClosedVersionRange(range: string): boolean {
  if (!isValidVersionRange(range)) return false
  return !range.trim().endsWith(',)')
}

// ─── Overlap detection (simple-segment best-effort) ──────────────────────────
//
// Maven version-range intersection is non-trivial for arbitrary inputs
// (qualifiers, snapshots, composites). The releng Kotlin/Java library exposes
// `VersionRange.isIntersect()`; we don't have a port. To give the user
// early-feedback before save, we parse simple single-segment ranges with
// dot-numeric bounds and compute overlap directly. Anything we can't parse
// confidently (composites, unparseable bounds, qualifiers) returns 'unknown';
// the UI then suppresses the inline error and defers to the CRS-side
// P-Overlap check (which uses the full releng API).

interface SimpleRange {
  lo: number[] | null
  loIncl: boolean
  hi: number[] | null
  hiIncl: boolean
}

function compareVersionArrays(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av !== bv) return av - bv
  }
  return 0
}

function parseDotNumeric(s: string): number[] | null {
  const trimmed = s.trim()
  if (trimmed === '') return null
  if (!/^\d+(\.\d+)*$/.test(trimmed)) return null
  return trimmed.split('.').map((p) => Number.parseInt(p, 10))
}

function parseSimpleSegment(range: string): SimpleRange | null {
  const trimmed = range.trim()
  if (trimmed === '') return null
  // Composite ranges contain segment separators like `),(`, `],[` etc.
  if (/[\])][\s]*,[\s]*[[(]/.test(trimmed)) return null
  const m = /^([[(])([^,]*),([^,]*)([\])])$/.exec(trimmed)
  if (!m) return null
  const [, openBracket, loStr, hiStr, closeBracket] = m
  const lo = loStr!.trim() === '' ? null : parseDotNumeric(loStr!)
  const hi = hiStr!.trim() === '' ? null : parseDotNumeric(hiStr!)
  // If a bound was provided but not parseable as dot-numeric, bail out.
  if (loStr!.trim() !== '' && lo === null) return null
  if (hiStr!.trim() !== '' && hi === null) return null
  return { lo, loIncl: openBracket === '[', hi, hiIncl: closeBracket === ']' }
}

/**
 * Returns `true` when `a` and `b` overlap, `false` when they're disjoint,
 * `'unknown'` when either side can't be confidently parsed (composites,
 * non-numeric bounds). Caller should treat `'unknown'` as "defer to server".
 */
export function rangesOverlap(a: string, b: string): true | false | 'unknown' {
  const ra = parseSimpleSegment(a)
  const rb = parseSimpleSegment(b)
  if (!ra || !rb) return 'unknown'

  // Two intervals are disjoint when one ends before the other starts.
  // Compare ra.lo against rb.hi: if ra.lo > rb.hi → disjoint;
  //   if ra.lo == rb.hi and either end is exclusive → disjoint (touching).
  if (ra.lo !== null && rb.hi !== null) {
    const cmp = compareVersionArrays(ra.lo, rb.hi)
    if (cmp > 0) return false
    if (cmp === 0 && !(ra.loIncl && rb.hiIncl)) return false
  }
  if (rb.lo !== null && ra.hi !== null) {
    const cmp = compareVersionArrays(rb.lo, ra.hi)
    if (cmp > 0) return false
    if (cmp === 0 && !(rb.loIncl && ra.hiIncl)) return false
  }
  return true
}
