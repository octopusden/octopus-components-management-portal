import type { ComponentValidation, HealthStatistics } from './types'
import { hasValidationIssue, validationBadgeCount } from './validation'

// Pure aggregation helpers for the admin Registry Health page. Kept out of the
// page component so the KPI math, top-offender ordering, and people-breakdown
// ranking are unit-testable without mounting React.

/**
 * KPI roll-up derived from the validation report's per-component entries.
 *
 * Only GENUINE problems count toward `withProblems` / `problemVersions`: a
 * failed check (`checkFailed`) is a system condition, not a component problem
 * (it is surfaced once at report level — see lib/validation), so it is excluded
 * here exactly as it is on the list page and detail badge.
 *
 * `problemVersions` sums `validationBadgeCount` across problem-bearing
 * components — the count of released versions implicated across the registry.
 *
 * Health math is ACTIVE-based (product decision): the validation sweep only
 * covers active components — `RegistryClient.componentIds()` filters archived
 * out — so `withProblems` is inherently active-only, and the denominator must
 * match. `healthy = active − withProblems`; the ratios divide by `active`.
 * `total` is carried through unchanged only to back the "Total components" KPI
 * tile (the grand total incl. archived); it is NOT used in the health math.
 */
export interface HealthKpis {
  /** Grand total incl. archived (CRS totalComponents) — KPI tile only. */
  total: number
  /** Active (non-archived) count — the base for all health math. */
  active: number
  withProblems: number
  problemVersions: number
  healthy: number
  /** withProblems / active, 0..1; 0 when active is 0. */
  withProblemsRatio: number
  /** healthy / active, 0..1; 0 when active is 0. */
  healthyRatio: number
}

export function computeHealthKpis(
  total: number,
  active: number,
  validations: Iterable<ComponentValidation>,
): HealthKpis {
  let withProblems = 0
  let problemVersions = 0
  for (const cv of validations) {
    // checkFailed is a system condition, never a component problem — exclude it
    // explicitly rather than leaning on CRS emitting problems=[] alongside it.
    if (cv.checkFailed || !hasValidationIssue(cv)) continue
    withProblems += 1
    problemVersions += validationBadgeCount(cv)
  }
  // Clamp healthy at 0: a stale report holding entries for components no longer
  // active could in theory exceed `active`; never show a negative count.
  const healthy = Math.max(0, active - withProblems)
  return {
    total,
    active,
    withProblems,
    problemVersions,
    healthy,
    withProblemsRatio: active > 0 ? withProblems / active : 0,
    healthyRatio: active > 0 ? healthy / active : 0,
  }
}

/** One row of the Top offenders list: a component and its problem-version count. */
export interface TopOffender {
  /** CRS component key — equals the `/components/{id}` detail-route id. */
  component: string
  /** Sum of validationBadgeCount across the component's problems. */
  problemVersions: number
}

/**
 * The components with the most problem versions, descending, capped at `limit`
 * (default 5). Components with no genuine problem are excluded. Ties break by
 * component key ascending so the order is stable/deterministic across renders.
 */
export function topOffenders(
  validations: Iterable<ComponentValidation>,
  limit = 5,
): TopOffender[] {
  const rows: TopOffender[] = []
  for (const cv of validations) {
    // Same exclusion as computeHealthKpis: a check-failed row is not an offender.
    if (cv.checkFailed || !hasValidationIssue(cv)) continue
    rows.push({ component: cv.component, problemVersions: validationBadgeCount(cv) })
  }
  rows.sort((a, b) =>
    b.problemVersions - a.problemVersions || a.component.localeCompare(b.component),
  )
  return rows.slice(0, limit)
}

/** One ranked person row in a people breakdown panel. */
export interface PersonCount {
  person: string
  count: number
}

/**
 * Turn a CRS `componentsBy*` map (`person -> count`) into a list ranked by
 * count descending, ties broken by person ascending (stable/deterministic).
 * Shaped so a future `problemType` dimension could reuse the same ranker.
 */
export function rankPeople(byPerson: HealthStatistics['componentsByOwner']): PersonCount[] {
  return Object.entries(byPerson)
    .map(([person, count]) => ({ person, count }))
    .sort((a, b) => b.count - a.count || a.person.localeCompare(b.person))
}

/** Role dimension a people panel deep-links into on the Components list. */
export type PeopleRole = 'owner' | 'releaseManager' | 'securityChampion'

/**
 * Deep-link href into the pre-filtered Components list for a single person in a
 * role. Serialized to match how `useFilterUrlState` parses array filters — a
 * single comma-separated value — so Phase 1's on-mount URL read picks it up.
 * The person is URL-encoded (LDAP usernames are token-safe today, but a stray
 * space or `+` must round-trip).
 */
export function peopleFilterHref(role: PeopleRole, person: string): string {
  return `/components?${role}=${encodeURIComponent(person)}`
}
