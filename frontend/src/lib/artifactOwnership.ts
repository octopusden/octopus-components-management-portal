// Pure logic for the artifact-ID ownership editor (#357). Framework-free so it can
// be unit-tested without rendering. Mirrors the CRS model: a component owns a LIST
// of mappings, each = comma group-list + ownership mode (+ literal tokens for
// EXPLICIT) at a version range (base = all versions; override REPLACES base).
import type { ArtifactId, ArtifactIdMode, ArtifactIdRequest } from './types'
import { findUnsupportedGroupId } from './groupValidation'
import { formatVersionRange } from './versionRange'

export const OWNERSHIP_ALL_VERSIONS = '(,0),[0,)'

export interface OwnershipMode {
  key: ArtifactIdMode
  label: string
  help: string
}

// Order matches the mockup (ALL, ALL_EXCEPT_CLAIMED, EXPLICIT).
export const OWNERSHIP_MODES: OwnershipMode[] = [
  {
    key: 'ALL',
    label: 'All artifacts in these groups',
    help: 'Owns every artifact under these groups. Must be the sole owner of the group in its range.',
  },
  {
    key: 'ALL_EXCEPT_CLAIMED',
    label: 'All unclaimed artifacts',
    help: 'Owns any artifact not explicitly claimed by another component in an overlapping range.',
  },
  {
    key: 'EXPLICIT',
    label: 'Specific artifacts',
    help: 'Owns exactly the listed artifact IDs. Highest priority during resolution.',
  },
]

/** One ownership mapping in the editor form state. `id` is a client-stable key. */
export interface OwnershipMappingValue {
  id: string
  /** Persisted server id (for legacy-preview reuse); undefined for unsaved rows. */
  serverId?: string
  /** true = base (all versions); false = per-range override. */
  base: boolean
  /** Override version range; null for the base mapping. */
  range: string | null
  /** Comma-separated group tokens, raw as typed. */
  groups: string
  mode: ArtifactIdMode
  tokens: string[]
  /** Server-computed legacy `artifactIdPattern` (read-only preview), if known. */
  legacyArtifactIdPattern?: string | null
}

/** Group tokens: split on comma, trim, drop empties (mirrors the CRS group split). */
export function groupTokens(groups: string): string[] {
  return (groups ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * A literal group/artifact token must match the CRS allowlist `[A-Za-z0-9_.-]+` (positive match —
 * mirrors `ArtifactOwnershipModeClassifier.isLiteralToken`). A denylist of "known regex chars" is
 * too weak: it would let `foo/bar`, `foo:bar`, `foo#bar` through the Portal only for CRS to 400.
 */
export function isBadToken(token: string): boolean {
  return !/^[A-Za-z0-9_.-]+$/.test(token)
}

/** Escape regex metachars when rendering a literal token to a legacy pattern (only `.`). */
export function escapeToken(token: string): string {
  return token.replace(/\./g, '\\.')
}

/** Split a pasted list into literal tokens (comma / pipe / whitespace separated). */
export function splitTokens(input: string): string[] {
  return (input ?? '')
    .split(/[,|\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Best-effort legacy `artifactIdPattern` for the per-mapping preview. ALL and EXPLICIT
 * are exact client-side; ALL_EXCEPT_CLAIMED needs the OTHER components' explicit siblings
 * which only the server knows — prefer the server value, else hint from local siblings.
 */
export function legacyArtifactPattern(
  mapping: OwnershipMappingValue,
  allMappings: OwnershipMappingValue[],
): string {
  if (mapping.mode === 'ALL') return '[\\w-\\.]+'
  if (mapping.mode === 'EXPLICIT') {
    return mapping.tokens.length ? mapping.tokens.map(escapeToken).join(',') : '(none)'
  }
  // ALL_EXCEPT_CLAIMED
  if (mapping.legacyArtifactIdPattern) return mapping.legacyArtifactIdPattern
  const siblings = explicitSiblings(mapping, allMappings)
  const body = siblings.length ? siblings.map(escapeToken).join('|') : '…'
  return `(?!(?:${body})$)[\\w-\\.]+`
}

/** Local EXPLICIT tokens of OTHER mappings sharing a group token in the same range. */
function explicitSiblings(
  mapping: OwnershipMappingValue,
  allMappings: OwnershipMappingValue[],
): string[] {
  const g = groupTokens(mapping.groups)
  const out: string[] = []
  for (const other of allMappings) {
    if (other.id === mapping.id) continue
    if (other.mode !== 'EXPLICIT') continue
    if (other.range !== mapping.range) continue
    if (!groupTokens(other.groups).some((t) => g.includes(t))) continue
    out.push(...other.tokens)
  }
  return out
}

/**
 * Per-mapping validation message ('' when valid). When `supportedGroups` is
 * non-empty, also enforces the CRS supported-prefix rule (#10) — every group
 * token must start with one of the prefixes; an empty list skips the check
 * (fail-open, CRS stays authoritative).
 */
export function groupError(
  mapping: OwnershipMappingValue,
  supportedGroups: readonly string[] = [],
): string {
  const tokens = groupTokens(mapping.groups)
  if (tokens.length === 0) return 'Group ID is required.'
  const bad = tokens.find(isBadToken)
  if (bad !== undefined) {
    return `Invalid group "${bad}". Use letters, digits, . _ - only — no wildcards or regex.`
  }
  const unsupported = findUnsupportedGroupId(mapping.groups, supportedGroups)
  if (unsupported !== undefined) {
    return `Group "${unsupported}" must start with a supported prefix (${supportedGroups.join(', ')}).`
  }
  if (mapping.mode === 'ALL_EXCEPT_CLAIMED' && tokens.length > 1) {
    return '"All unclaimed" supports a single group only — split into one mapping per group.'
  }
  return ''
}

export function isExplicitEmpty(mapping: OwnershipMappingValue): boolean {
  return mapping.mode === 'EXPLICIT' && mapping.tokens.length === 0
}

/**
 * Intra-component conflicts the client CAN detect (this component's own list). Mirrors the CRS
 * intra-component invariant exactly: within one `(component, version range)` a group token belongs
 * to AT MOST ONE mapping — so ANY two mappings sharing a group token in the same range conflict,
 * regardless of mode or tokens (CRS rejects them 400; you must merge them or use distinct groups).
 * Returns a message keyed by mapping id. The mode-aware cross-component matrix (ALL×ALL etc.) needs
 * OTHER components' claims and is decided by the server 409 — it is NOT an intra-component rule.
 */
export function detectIntraComponentConflicts(
  mappings: OwnershipMappingValue[],
): Record<string, string> {
  const byId: Record<string, string> = {}
  // (effective range, group token) -> id of the first mapping that claimed it. base ⇒ ALL_VERSIONS.
  const claimedBy = new Map<string, string>()
  for (const m of mappings) {
    const range = m.base ? OWNERSHIP_ALL_VERSIONS : m.range ?? ''
    for (const g of groupTokens(m.groups)) {
      const key = `${range}\u0000${g}`
      const prior = claimedBy.get(key)
      if (prior !== undefined) {
        const msg = `Group "${g}" is claimed by more than one mapping in the same range — merge them or use distinct groups.`
        byId[m.id] = msg
        byId[prior] = msg
      } else {
        claimedBy.set(key, m.id)
      }
    }
  }
  return byId
}

interface ParsedRange {
  lo: number
  hi: number
}

/** Parse a numeric maven range for the coverage timeline. Unbounded ⇒ 0 / Infinity. */
export function parseRange(range: string | null): ParsedRange {
  if (!range) return { lo: Number.NEGATIVE_INFINITY, hi: Number.POSITIVE_INFINITY }
  const m = range.match(/[[(]\s*([\d.]*)\s*,\s*([\d.]*)\s*[\])]/)
  if (!m) return { lo: Number.NEGATIVE_INFINITY, hi: Number.POSITIVE_INFINITY }
  const lo = m[1] ?? ''
  const hi = m[2] ?? ''
  return {
    lo: lo === '' ? Number.NEGATIVE_INFINITY : parseFloat(lo),
    hi: hi === '' ? Number.POSITIVE_INFINITY : parseFloat(hi),
  }
}

/** Do two override ranges overlap? Per-range ownership ranges must be disjoint. */
export function rangesOverlap(a: string | null, b: string | null): boolean {
  const ra = parseRange(a)
  const rb = parseRange(b)
  return ra.lo < rb.hi && rb.lo < ra.hi
}

/** Are any of the override (non-base) mappings' ranges overlapping? */
export function hasOverlappingOverrides(mappings: OwnershipMappingValue[]): boolean {
  const overrides = mappings.filter((m) => !m.base)
  for (let i = 0; i < overrides.length; i++) {
    for (let j = i + 1; j < overrides.length; j++) {
      if (rangesOverlap(overrides[i]!.range, overrides[j]!.range)) return true
    }
  }
  return false
}

/** Total count of unresolved issues (drives the Save gate). */
export function countOwnershipIssues(
  mappings: OwnershipMappingValue[],
  supportedGroups: readonly string[] = [],
): number {
  let n = 0
  for (const m of mappings) {
    if (groupError(m, supportedGroups)) n++
    if (isExplicitEmpty(m)) n++
  }
  n += Object.keys(detectIntraComponentConflicts(mappings)).length
  if (hasOverlappingOverrides(mappings)) n++
  return n
}

let uidCounter = 0
/** Client-stable mapping id (not persisted). */
export function newMappingId(): string {
  uidCounter += 1
  return `m${uidCounter}`
}

/** Test-only: reset the mapping-id counter for deterministic ids across runs. */
export function resetMappingCounter(): void {
  uidCounter = 0
}

/** Map a server `ArtifactId` response into editor form state. */
export function fromArtifactId(a: ArtifactId): OwnershipMappingValue {
  const isBase = a.versionRange == null || a.versionRange === OWNERSHIP_ALL_VERSIONS
  return {
    id: newMappingId(),
    serverId: a.id,
    base: isBase,
    range: isBase ? null : a.versionRange ?? null,
    groups: a.groupPattern,
    mode: a.mode,
    tokens: a.artifactTokens ?? [],
    legacyArtifactIdPattern: a.legacyArtifactIdPattern ?? null,
  }
}

/** Map editor form state back into a write request (full-replacement PATCH/POST). */
export function toArtifactIdRequest(m: OwnershipMappingValue): ArtifactIdRequest {
  return {
    versionRange: m.base ? null : m.range,
    groupPattern: groupTokens(m.groups).join(','),
    mode: m.mode,
    artifactTokens: m.mode === 'EXPLICIT' ? m.tokens : [],
  }
}

const MODE_SHORT_LABEL: Record<ArtifactIdMode, string> = {
  ALL: 'All in group',
  ALL_EXCEPT_CLAIMED: 'All unclaimed',
  EXPLICIT: 'Specific',
}

/**
 * One-line human-readable summary of an ownership mapping, for the change-review
 * diff (replaces the cryptic `group::MODE::tokens::range` key). Accepts either the
 * server `ArtifactId` or the write `ArtifactIdRequest` shape — both carry
 * groupPattern / mode / artifactTokens / versionRange. Base (null / sentinel
 * range) reads as "All versions"; literal tokens are listed only for EXPLICIT.
 *   e.g. `[1.4,1.5) · Specific · com.example.foo · widget-a, widget-b`
 */
export function humanizeOwnership(m: {
  groupPattern: string
  mode?: ArtifactIdMode
  artifactTokens?: string[] | null
  versionRange?: string | null
}): string {
  const range = m.versionRange ? formatVersionRange(m.versionRange) : 'All versions'
  const groups = groupTokens(m.groupPattern).join(', ') || '(no group)'
  const parts = [range]
  if (m.mode) parts.push(MODE_SHORT_LABEL[m.mode] ?? m.mode)
  parts.push(groups)
  if (m.mode === 'EXPLICIT') {
    parts.push((m.artifactTokens ?? []).join(', ') || '(none)')
  }
  return parts.join(' · ')
}
