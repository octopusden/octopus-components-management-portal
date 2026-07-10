// The two-segment "all versions" base sentinel CRS stores for a base row /
// base ownership mapping (`(,0),[0,)`). Whitespace and trailing-zero variants
// (`(, 0), [0, )`, `(,0.0),[0.0,)`) mean the same thing and also read as base.
const BASE_SENTINEL_RE = /^\(,0(?:\.0+)*\),\[0(?:\.0+)*,\)$/

export function formatVersionRange(range: string): string {
  const compact = range.replace(/\s+/g, '')
  if (compact === '(,)' || BASE_SENTINEL_RE.test(compact)) return 'All versions'
  return range
}

// One segment of a Maven version range. Body chars must not include another
// bracket/paren or comma (those are structural). Trailing whitespace is
// stripped by callers via normalize() before this matches. A segment is EITHER
// the two-bound form `[X,Y)` (and variants) OR the exact-version "hard version"
// form `[X]` — no comma, square brackets only (`(X)`, `[X)`, `(X]` are invalid
// Maven), matching the CRS server + releng VersionRangeFactory (lo == hi, incl).
const TWO_BOUND_SEGMENT_RE_SRC = '[[(][^()\\[\\],]*,[^()\\[\\],]*[\\])]'
const EXACT_SEGMENT_RE_SRC = '\\[[^()\\[\\],]+]'
const SEGMENT_RE_SRC = `(?:${TWO_BOUND_SEGMENT_RE_SRC}|${EXACT_SEGMENT_RE_SRC})`
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
 * True when `range` is syntactically valid AND every segment has a non-empty upper bound (no
 * `,)` suffix) — i.e. a fully closed / historical-left-unbounded range with no open-upward segment.
 *
 * NOTE (ADR-018): this is **no longer the production field-override gate** — open-upper overrides
 * are now first-class, so the editors validate with [isAllowedOverrideRange]. This predicate is
 * retained as a general "is this range closed-above" utility (and its test coverage of the closed
 * vs open-upper distinction); it has no production call sites today.
 *
 * Allowed: closed (`[X,Y)`, `[X,Y]`, `(X,Y)`, `(X,Y]`) and historical-left-unbounded (`(,X)`,
 * `(,X]`), plus composites whose every segment satisfies the same rule. Rejected: universal
 * (`(,)`, `(,0),[0,)`) and any open-upward segment.
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

const ALL_VERSIONS_SENTINEL = '(,0),[0,)'

/**
 * Returns true when `range` is allowed as a per-attribute field-override range under the decoupled
 * version model (ADR-018). The former "D5" closed-only restriction is **relaxed**: open-upper
 * segments (`[X,)`, "from version X onward") are now first-class overrides — the CRS server accepts
 * them, and `resolve` applies them by containment.
 *
 * Still rejected: the all-versions shapes (`(,)` and the `(,0),[0,)` sentinel) — those denote the
 * BASE default / full coverage, not a sub-range override; an override spanning all versions is
 * indistinguishable from editing the base. Coverage itself is edited in the Supported-versions
 * block, not here.
 *
 * Allowed: closed (`[X,Y)`, `[X,Y]`, `(X,Y)`, `(X,Y]`), open-upper (`[X,)`, `(X,)`),
 * historical-left-unbounded (`(,X)`, `(,X]`), and composites whose segments satisfy the same rule.
 */
export function isAllowedOverrideRange(range: string): boolean {
  if (!isValidVersionRange(range)) return false
  const compact = normalize(range)
  if (compact === ALL_VERSIONS_SENTINEL) return false
  // Reject any universal `(,)` segment, including inside a composite like `(,),[1.0,2.0)`
  // (which is valid syntax but still spans all versions = the base default).
  const segments = compact.match(SEGMENT_GLOBAL) ?? []
  return !segments.some((s) => s === '(,)')
}

/**
 * True when `range` is a single dot-numeric segment whose bounds describe an
 * EMPTY interval — the lower bound is greater than the upper (an inverted range
 * like `[1.7.3076,1.7.3010]`), or the bounds are equal with an exclusive edge
 * (`[x,x)`, `(x,x]`, `(x,x)`) so no version can fall inside. `[x,x]` is the only
 * non-empty equal-bound case. Composites, open bounds, and unparseable/qualifier
 * bounds return `false` — we can't decide those client-side and defer to CRS.
 */
export function isEmptyVersionRange(range: string): boolean {
  const seg = parseSimpleSegment(range)
  if (!seg || seg.lo === null || seg.hi === null) return false
  const cmp = compareVersionArrays(seg.lo, seg.hi)
  if (cmp > 0) return true
  if (cmp === 0) return !(seg.loIncl && seg.hiIncl)
  return false
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
// Disjoint-only rule: two overrides on the same attribute must not intersect
// at all. Any intersection — partial overlap, strict containment, or exact
// equality — is a conflict, because a version inside the intersection matches
// both overrides and the resolved value would be ambiguous. rangesOverlap
// returns `true` for any of those three cases and `false` only when the ranges
// are disjoint. (This is stricter than the original schema-spec.md §3.5, which
// allowed strict containment; see classifyRangeConflict.)

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

export function parseSimpleSegment(range: string): SimpleRange | null {
  const compact = normalize(range)
  if (compact === '') return null
  // Reject composites — must be a single segment.
  if (/[\])][\s]*,[\s]*[[(]/.test(compact)) return null
  // Exact-version ("hard version") form `[X]`: no comma, square brackets only.
  // lo == hi, both inclusive — mirrors the CRS server + releng VersionRange.
  // A non-dot-numeric bound (qualifier) yields null lo/hi so callers defer to
  // the server, consistent with the two-bound qualifier handling below.
  const exact = /^\[([^,[\]()]+)]$/.exec(compact)
  if (exact) {
    const v = parseDotNumeric(exact[1]!)
    if (v === null) return null
    return { lo: v, loIncl: true, hi: v, hiIncl: true }
  }
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
 * The relationship between two version ranges, from the write-validation point
 * of view. Overrides on one attribute must be DISJOINT, so every intersecting
 * relationship is a conflict:
 *   - `'partial'`  — they intersect but neither contains the other → rejected.
 *   - `'contains'` — one strictly contains the other → rejected. A version in
 *                    the inner range matches both overrides, so the resolved
 *                    value is ambiguous. (Stricter than the original
 *                    schema-spec.md §3.5, which allowed containment.)
 *   - `'equal'`    — semantically the same range (modulo whitespace / trailing
 *                    zeros) → rejected as a duplicate (the DB UNIQUE constraint
 *                    only catches exact-string equality, so `[1.0,2.0)` vs
 *                    `[1,2)` / `[1.0, 2.0)` would otherwise slip through).
 *   - `'none'`     — disjoint → allowed (the only allowed relationship).
 *   - `'unknown'`  — either side can't be parsed (composites, non-numeric
 *                    bounds); caller defers to the CRS-side check.
 */
export type RangeConflict = 'partial' | 'contains' | 'equal' | 'none' | 'unknown'

/**
 * Classifies how `a` relates to `b` (see {@link RangeConflict}). This is the
 * refinement {@link rangesOverlap}'s boolean `true` collapses together —
 * `'partial'`, `'contains'`, and `'equal'` all block a write; `'partial'` and
 * `'contains'` share "Overlaps with…" copy, `'equal'` gets distinct copy.
 */
export function classifyRangeConflict(a: string, b: string): RangeConflict {
  const ra = parseSimpleSegment(a)
  const rb = parseSimpleSegment(b)
  if (!ra || !rb) return 'unknown'

  // Disjoint check.
  if (ra.lo !== null && rb.hi !== null) {
    const cmp = compareVersionArrays(ra.lo, rb.hi)
    if (cmp > 0) return 'none'
    if (cmp === 0 && !(ra.loIncl && rb.hiIncl)) return 'none'
  }
  if (rb.lo !== null && ra.hi !== null) {
    const cmp = compareVersionArrays(rb.lo, ra.hi)
    if (cmp > 0) return 'none'
    if (cmp === 0 && !(rb.loIncl && ra.hiIncl)) return 'none'
  }
  // They intersect. Each-contains-other → equal; exactly-one-contains →
  // strict containment; neither → partial overlap. All three are conflicts.
  const aContainsB = containsRange(ra, rb)
  const bContainsA = containsRange(rb, ra)
  if (aContainsB && bContainsA) return 'equal'
  if (aContainsB || bContainsA) return 'contains'
  return 'partial'
}

/**
 * Returns `true` when `a` and `b` intersect in any way (partial overlap,
 * strict containment, or semantic equality), `false` when disjoint,
 * `'unknown'` when either side can't be parsed. Thin wrapper over
 * {@link classifyRangeConflict} for call sites that only need the
 * block / allow / defer decision.
 */
export function rangesOverlap(a: string, b: string): true | false | 'unknown' {
  const kind = classifyRangeConflict(a, b)
  if (kind === 'unknown') return 'unknown'
  return kind === 'partial' || kind === 'contains' || kind === 'equal'
}

// ─── Ordering (simple-segment, numeric lower-bound aware) ────────────────────
//
// `localeCompare` orders range strings lexically, so `[10.0,)` sorts before
// `[2.0,)` ("1" < "2"). compareVersionRanges sorts by lower bound numerically,
// then upper bound, so consumers (e.g. ConfigurationsTab) list ranges in true
// version order. Anything we can't parse as a single dot-numeric segment falls
// back to localeCompare so the ordering stays total and deterministic.

// A null bound means "unbounded": unbounded-left sorts first, unbounded-right
// sorts last. At an equal value, an inclusive lower edge (`[`) starts at-or-
// before an exclusive one (`(`), and an exclusive upper edge (`)`) ends before
// an inclusive one (`]`).
function compareLowerEdge(a: SimpleRange, b: SimpleRange): number {
  if (a.lo === null && b.lo === null) return 0
  if (a.lo === null) return -1
  if (b.lo === null) return 1
  const cmp = compareVersionArrays(a.lo, b.lo)
  if (cmp !== 0) return cmp
  if (a.loIncl === b.loIncl) return 0
  return a.loIncl ? -1 : 1
}

function compareUpperEdge(a: SimpleRange, b: SimpleRange): number {
  if (a.hi === null && b.hi === null) return 0
  if (a.hi === null) return 1
  if (b.hi === null) return -1
  const cmp = compareVersionArrays(a.hi, b.hi)
  if (cmp !== 0) return cmp
  if (a.hiIncl === b.hiIncl) return 0
  return a.hiIncl ? 1 : -1
}

/**
 * Comparator for version-range strings, suitable for `Array.prototype.sort`.
 * Orders by lower bound (numeric, dot-segment aware) then upper bound, so
 * `[2.0,)` precedes `[10.0,)`. Ranges that aren't a single dot-numeric segment
 * (composites, qualifiers, garbage) fall back to `localeCompare`.
 */
export function compareVersionRanges(a: string, b: string): number {
  const ra = parseSimpleSegment(a)
  const rb = parseSimpleSegment(b)
  if (!ra || !rb) return a.localeCompare(b)
  const loCmp = compareLowerEdge(ra, rb)
  if (loCmp !== 0) return loCmp
  return compareUpperEdge(ra, rb)
}

// ─── Adjacency merge (display coalescing of contiguous per-range overrides) ──
//
// Two per-attribute overrides on adjacent, exactly-touching ranges that carry
// the SAME value read as one logical rule; the editor shows them as a single
// coalesced row spanning both (parity with the merged supported-versions view).
// `mergeAdjacentRanges` decides only the "exactly touching" geometry — value
// equality is the caller's concern.

const SINGLE_SEGMENT_RE = /^([[(])([^,]*),([^,]*)([\])])$/

/**
 * When `a` (the lower range) and `b` (the higher range) are single dot-numeric
 * segments that meet EXACTLY — `a`'s upper bound equals `b`'s lower bound with
 * exactly one side inclusive, so the shared version is covered once (not zero
 * times, not twice) — returns the union range `a.lower … b.upper`, preserving
 * the original bound tokens (e.g. `(,1.0.107)` + `[1.0.107,1.2.471)` →
 * `(,1.2.471)`). Returns null when they overlap (both bounds inclusive at the
 * join), leave a gap (both exclusive), are out of order / non-touching, or
 * either side isn't a single parseable segment. Callers pass ranges pre-sorted
 * so `a` is the lower one.
 */
export function mergeAdjacentRanges(a: string, b: string): string | null {
  const ra = parseSimpleSegment(a)
  const rb = parseSimpleSegment(b)
  if (!ra || !rb) return null
  // Both bounds at the join must exist and be equal as versions.
  if (ra.hi === null || rb.lo === null) return null
  if (compareVersionArrays(ra.hi, rb.lo) !== 0) return null
  // Exactly one side inclusive at the join (`)`+`[` or `]`+`(`). Two inclusive
  // bounds overlap at the shared version; two exclusive bounds skip it — neither
  // is a clean, coverage-preserving merge.
  if (ra.hiIncl === rb.loIncl) return null
  const ma = SINGLE_SEGMENT_RE.exec(normalize(a))
  const mb = SINGLE_SEGMENT_RE.exec(normalize(b))
  if (!ma || !mb) return null
  return `${ma[1]}${ma[2]},${mb[3]}${mb[4]}`
}

/**
 * The numeric-highest lower bound across a set of ranges, as a dot-string
 * (e.g. `1.5.1400`), or `null` when none has a usable lower bound. Used to seed
 * a sensible default version (the "current"/latest configured version) for the
 * As-Code resolve box and similar.
 *
 * Entries are IGNORED when they have no lower bound to offer: `null`/`undefined`
 * /blank, the universal `(,)` and the base sentinel `(,0),[0,)` (both composites
 * or unbounded → `parseSimpleSegment` yields no `lo`), left-unbounded `(,X)`,
 * and anything `parseSimpleSegment` can't parse (composites, qualifiers).
 * Ordering is numeric (dot-segment aware), so `[1.10,)` ranks above `[1.2,)`.
 */
export function highestLowerBoundVersion(ranges: Array<string | null | undefined>): string | null {
  let best: number[] | null = null
  for (const r of ranges) {
    if (!r) continue
    const seg = parseSimpleSegment(r)
    if (!seg || seg.lo === null) continue
    // The lower bound must be INSIDE the range to be a safe default: an exclusive
    // lower bound (`(1.5,2.0]`) excludes 1.5 itself, so suggesting it would resolve
    // to a version outside every range (404). Only inclusive `[` lower bounds count.
    if (!seg.loIncl) continue
    // An all-zero lower bound (`[0,)`, `[0.0,)`) means "from the start" — a
    // degenerate base-like range, not a real version to suggest. Skip it.
    if (seg.lo.every((v) => v === 0)) continue
    if (best === null || compareVersionArrays(seg.lo, best) > 0) best = seg.lo
  }
  return best === null ? null : best.join('.')
}
