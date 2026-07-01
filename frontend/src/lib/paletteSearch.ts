import type { ComponentSummary } from './types'

// Relevance ranking + matching for the ⌘K command palette. The component search
// itself is server-side (CRS substring LIKE on componentKey + displayName); these
// helpers re-rank whatever the server returns so the best matches surface first,
// and gate the static nav/filter items to those whose label matches the query.
//
// Ranking mirrors the design handoff (design_handoff_command_palette_ordering):
// prefix → word/segment boundary → loose substring. See rankComponents.

/** Case-insensitive substring test. A null / undefined / empty label never matches. */
export function matchesQuery(label: string | null | undefined, q: string): boolean {
  if (!label) return false
  return label.toLowerCase().includes(q.toLowerCase())
}

// Lower is more relevant. 3 = no match at all (or null label) — never wins a min().
//   0 — label starts with the query (prefix)
//   1 — query sits on a word/segment boundary (start, or after a space, '-' or '_')
//   2 — query appears somewhere else (loose substring)
function rankOne(label: string | null | undefined, q: string): 0 | 1 | 2 | 3 {
  if (!label) return 3
  const l = label.toLowerCase()
  if (!l.includes(q)) return 3
  if (l.startsWith(q)) return 0
  // Boundary = query right after a space, '-' or '_'. (Position 0 is already
  // rank 0 above, so the leading-space pad only needs one space.)
  if (` ${l}`.includes(` ${q}`) || l.includes(`-${q}`) || l.includes(`_${q}`)) return 1
  return 2
}

/**
 * Filter components to those matching `q` (by name or displayName), sorted by
 * relevance and capped. Tie-break: better (lower) rank, then shorter name, then
 * alphabetical. Returns [] for a blank query.
 */
export function rankComponents(
  items: ComponentSummary[],
  q: string,
  cap = 6,
): ComponentSummary[] {
  const query = q.trim().toLowerCase()
  if (!query) return []
  const matched = items.filter(
    (c) => matchesQuery(c.name, query) || matchesQuery(c.displayName, query),
  )
  // Precompute each rank once rather than re-deriving it on every comparator call.
  const rankOf = new Map(
    matched.map((c) => [c, Math.min(rankOne(c.name, query), rankOne(c.displayName, query))]),
  )
  return matched
    .sort(
      (a, b) =>
        rankOf.get(a)! - rankOf.get(b)! ||
        a.name.length - b.name.length ||
        a.name.localeCompare(b.name),
    )
    .slice(0, cap)
}
