export function formatVersionRange(range: string): string {
  if (range === '(,)') return 'All versions'
  return range
}

// One segment of a Maven version range: `[X,Y)` and variants. Body chars must
// not include another bracket/paren or comma (those are structural). Trailing
// whitespace is stripped by callers via normalize() before this matches.
const SEGMENT_RE_SRC = '[[(][^()\\[\\],]*,[^()\\[\\],]*[\\])]'
const FULL_RANGE_RE = new RegExp(`^${SEGMENT_RE_SRC}(,${SEGMENT_RE_SRC})*$`)
const SEGMENT_GLOBAL = new RegExp(SEGMENT_RE_SRC, 'g')

function normalize(range: string): string {
  return range.trim().replace(/\s+/g, '')
}

export function isValidVersionRange(range: string): boolean {
  if (!range) return false
  const compact = normalize(range)
  if (compact.length < 3) return false
  return FULL_RANGE_RE.test(compact)
}

/**
 * Returns true when `range` is allowed as a field-override range under D5:
 * syntactically valid AND every segment has a non-empty upper bound (no
 * `,)` suffix in any segment).
 *
 * Universal (`(,)`, `(,0),[0,)`) and any open-upward segment are rejected —
 * they belong to BASE, not overrides. Composite ranges are walked per
 * segment so a non-terminal open-upward segment is also rejected.
 *
 * Allowed: closed (`[X,Y)`, `[X,Y]`, `(X,Y)`, `(X,Y]`) and
 * historical-left-unbounded (`(,X)`, `(,X]`), plus composites whose every
 * segment satisfies the same rule.
 */
export function isClosedVersionRange(range: string): boolean {
  if (!isValidVersionRange(range)) return false
  const compact = normalize(range)
  const segments = compact.match(SEGMENT_GLOBAL) ?? []
  if (segments.length === 0) return false
  for (const seg of segments) {
    if (seg.endsWith(',)')) return false
  }
  return true
}

// ─── Overlap detection (simple-segment best-effort) ──────────────────────────
//
// Maven version-range intersection is non-trivial for arbitrary inputs
// (qualifiers, snapshots, composites). The releng Kotlin/Java library exposes
// `VersionRange.isIntersect()`; we don't have a port. To give the user
// early-feedback before save, we parse simple single-segment ranges with
// dot-numeric bounds and compute partial-overlap directly. Anything we can't
// parse confidently (composites, unparseable bounds, qualifiers) returns
// 'unknown'; the UI then suppresses the inline error and defers to the
// CRS-side overlap check (R3 / P-Overlap) — which uses the full releng API.
//
// Per schema-spec.md §3.5 only PARTIAL overlap is forbidden — strict
// containment is explicitly allowed, equal ranges are blocked by the DB
// UNIQUE constraint. rangesOverlap returns `true` only when the two ranges
// intersect AND neither strictly contains the other.

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
  const compact = normalize(range)
  if (compact === '') return null
  // Reject composites — must be a single segment.
  if (/[\])][\s]*,[\s]*[[(]/.test(compact)) return null
  const m = /^([[(])([^,]*),([^,]*)([\])])$/.exec(compact)
  if (!m) return null
  const [, openBracket, loStr, hiStr, closeBracket] = m
  // Bracket body characters can't themselves contain extra brackets/parens.
  if (/[()[\]]/.test(loStr!) || /[()[\]]/.test(hiStr!)) return null
  const lo = loStr!.trim() === '' ? null : parseDotNumeric(loStr!)
  const hi = hiStr!.trim() === '' ? null : parseDotNumeric(hiStr!)
  if (loStr!.trim() !== '' && lo === null) return null
  if (hiStr!.trim() !== '' && hi === null) return null
  return { lo, loIncl: openBracket === '[', hi, hiIncl: closeBracket === ']' }
}

// Outer covers inner's left edge iff outer extends at least as far left
// as inner. Whitespace-irrelevant: callers normalize first.
function leftCoversLeft(outer: SimpleRange, inner: SimpleRange): boolean {
  if (outer.lo === null) return true
  if (inner.lo === null) return false
  const cmp = compareVersionArrays(outer.lo, inner.lo)
  if (cmp < 0) return true
  if (cmp > 0) return false
  // Equal endpoint: outer's inclusive bound covers inner's; outer's
  // exclusive bound covers inner's only if inner is also exclusive.
  return outer.loIncl || !inner.loIncl
}

function rightCoversRight(outer: SimpleRange, inner: SimpleRange): boolean {
  if (outer.hi === null) return true
  if (inner.hi === null) return false
  const cmp = compareVersionArrays(outer.hi, inner.hi)
  if (cmp > 0) return true
  if (cmp < 0) return false
  return outer.hiIncl || !inner.hiIncl
}

function containsRange(outer: SimpleRange, inner: SimpleRange): boolean {
  return leftCoversLeft(outer, inner) && rightCoversRight(outer, inner)
}

/**
 * Returns `true` when `a` and `b` PARTIALLY overlap (intersect AND neither
 * fully contains the other), `false` when disjoint or one strictly contains
 * the other, `'unknown'` when either side can't be parsed (composites,
 * non-numeric bounds). Caller treats `'unknown'` as "defer to server".
 *
 * Aligns with CRS schema-spec.md §3.5: equal ranges blocked by UNIQUE,
 * strict containment and disjoint allowed, partial overlap rejected.
 */
export function rangesOverlap(a: string, b: string): true | false | 'unknown' {
  const ra = parseSimpleSegment(a)
  const rb = parseSimpleSegment(b)
  if (!ra || !rb) return 'unknown'

  // Disjoint check.
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
  // They intersect. Distinguish three cases:
  //   - each contains the other → semantically EQUAL → flag as conflict
  //     (the DB UNIQUE constraint catches exact-string equality, but
  //     `[1.0,2.0)` vs `[1,2)` or `[1.0, 2.0)` slip past raw-string
  //     comparison; we want both Portal and CRS to reject duplicates
  //     consistently regardless of trailing-zero / whitespace differences).
  //   - exactly one contains the other → strict containment → allowed
  //     per schema-spec §3.5.
  //   - neither contains → partial overlap → rejected.
  const aContainsB = containsRange(ra, rb)
  const bContainsA = containsRange(rb, ra)
  if (aContainsB && bContainsA) return true
  if (aContainsB || bContainsA) return false
  return true
}
