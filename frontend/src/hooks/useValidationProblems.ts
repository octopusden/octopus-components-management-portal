import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { apiAbsolute } from '../lib/api'
import type { ComponentValidation, ValidationReport } from '../lib/types'

// `/portal/validation/**` are AUTHENTICATED endpoints that the Portal backend
// (PR #109) now treats as API paths: an expired session returns a JSON 401, not
// an OIDC 302/HTML. We therefore fetch them through `apiAbsolute` — the same
// machinery as `/rest/**` calls — which carries api.ts's 401/OIDC-redirect
// handling. We deliberately do NOT use the `fetchInfo` helper in useInfo.ts:
// that one is for the mostly-anonymous `/portal/info|links` footer endpoints and
// intentionally skips the app's API 401 flow.

const VALIDATION_PATH = 'portal/validation/components'

/**
 * Shape returned by useValidationProblems. `byComponent` overlays onto the
 * displayed component rows by component key (ComponentSummary.name); the report
 * freshness fields (`generatedAt` / `lastAttemptAt` / `refreshError`) are
 * surfaced so the UI can flag a stale/failed report rather than hide it.
 */
export interface UseValidationProblemsResult {
  /** componentKey -> ComponentValidation (only components present in the report). */
  byComponent: Map<string, ComponentValidation>
  /** When the held report was last produced by a successful sweep; null pre-first-success. */
  generatedAt: string | null
  /** When the most recent refresh attempt ran. */
  lastAttemptAt: string | null
  /** Non-null when the latest refresh failed — the report may be stale. */
  refreshError: string | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

/**
 * Shared query for the validation report. The two public hooks differ only by
 * the `problemsOnly` query param (false = full registry overlay, true = the
 * problem-bearing set) and their doc intent — the react-query wiring and the
 * derived `UseValidationProblemsResult` shape are identical, so they're kept
 * here once. Distinct query keys per `problemsOnly` value keep the two reports
 * cached independently.
 *
 * `enabled` gates the request: the Validation Problems UI is admin-mode only, so
 * the page passes `enabled = isAdmin` (and the problems-set variant additionally
 * gates on the toggle) to ensure non-admin users make no `/portal/validation`
 * call at all.
 */
function useValidationReport(
  problemsOnly: boolean,
  enabled: boolean,
): UseValidationProblemsResult {
  const query = useQuery<ValidationReport>({
    queryKey: ['validation', 'report', { problemsOnly }],
    queryFn: () =>
      apiAbsolute.get<ValidationReport>(`/${VALIDATION_PATH}?problemsOnly=${problemsOnly}`),
    // The report is recomputed server-side on a schedule (hourly by default);
    // 5 min keeps the badge reasonably fresh without hammering Portal on paging.
    staleTime: 5 * 60 * 1000,
    // A failed report fetch must not break the list page — the badge column
    // simply renders nothing. The page still shows components.
    retry: false,
    enabled,
  })

  const byComponent = useMemo(() => {
    const map = new Map<string, ComponentValidation>()
    for (const cv of query.data?.components ?? []) {
      map.set(cv.component, cv)
    }
    return map
  }, [query.data])

  return {
    byComponent,
    generatedAt: query.data?.generatedAt ?? null,
    lastAttemptAt: query.data?.lastAttemptAt ?? null,
    refreshError: query.data?.refreshError ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Fetch the FULL validation report (problemsOnly=false → the whole registry) so
 * the badge overlay can light up problem-bearing rows on the normal paged list.
 *
 * `enabled` gates the request: the Validation Problems UI is admin-mode only, so
 * the page passes `enabled = isAdmin`. Defaults to true for callers that don't gate.
 */
export function useValidationProblems(enabled = true): UseValidationProblemsResult {
  return useValidationReport(false, enabled)
}

/**
 * Fetch only the components that have problems OR a failed check
 * (problemsOnly=true). Used by the "Only with problems" filter mode, which
 * drives the displayed list from the validation report rather than a CRS page
 * (the CRS list is server-paged and cannot filter on Portal-computed problems).
 *
 * `enabled` lets the caller skip the request entirely when the toggle is off.
 */
export function useComponentsWithProblems(enabled: boolean): UseValidationProblemsResult {
  return useValidationReport(true, enabled)
}

/**
 * Fetch the LIVE per-component validation result via
 * `GET /portal/validation/components/{component}`. Unlike the report hooks
 * above (which read a scheduled Portal-wide sweep), this hits the single-
 * component endpoint so the component DETAIL page surfaces a fresh result for
 * just that one component rather than overlaying a cached report.
 *
 * `enabled` gates the request: the Validation Problems facility is admin-only,
 * so the detail page passes `enabled = isAdmin`. A non-admin therefore issues
 * no `/portal/validation` call at all.
 *
 * `data` is undefined while loading / on error; a returned `ComponentValidation`
 * may itself carry `checkFailed = true` (a "could not verify" state — NOT a
 * clean pass), which callers must surface honestly rather than render as clean.
 */
export function useComponentValidation(
  component: string,
  enabled: boolean,
): UseQueryResult<ComponentValidation> {
  return useQuery<ComponentValidation>({
    queryKey: ['validation', 'component', component],
    queryFn: () =>
      apiAbsolute.get<ComponentValidation>(
        `/${VALIDATION_PATH}/${encodeURIComponent(component)}`,
      ),
    // Same freshness budget as the report hooks — the server recomputes on a
    // schedule, so a 5 min stale window keeps the section reasonably fresh.
    staleTime: 5 * 60 * 1000,
    // A failed fetch must not break the detail page — the section renders an
    // error/empty affordance, the rest of the page still loads.
    retry: false,
    // Skip entirely for non-admins (and before we know the component id).
    enabled: enabled && component.length > 0,
  })
}
