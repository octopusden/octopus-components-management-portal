import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * Wire shape of `POST /admin/teamcity-project-ids/resync` (CRS PR-2).
 *
 * The resync scans every component, calls TeamCity REST to find the project
 * whose `COMPONENT_NAME` parameter equals the component id, and rewrites
 * `teamcityProjectId` + `teamcityProjectUrl` when the match changes. Counters
 * are incremented per component:
 *   - scanned: total components considered
 *   - updated: rows where (id, url) actually changed
 *   - unchanged: match returned identical values
 *   - skipped_no_match: TC has no project pointing at this component
 *   - skipped_ambiguous: TC has more than one project pointing at this id
 *   - errors: per-component error messages (truncated server-side; the SPA
 *     just renders the count + first few lines on demand)
 */
export interface TeamCityResyncResult {
  scanned: number
  updated: number
  unchanged: number
  skipped_no_match: number
  skipped_ambiguous: number
  errors: string[]
}

/**
 * Synchronous (request-scoped) resync. Mirrors the `/admin/migrate-defaults`
 * pattern rather than the async-job pattern used by `/admin/migrate` —
 * resync over ~hundreds of components fits in a single HTTP cycle.
 *
 * On success the SPA invalidates `['components']` so the list view picks up
 * the new TC URLs without a manual refresh, and also invalidates all
 * `['component', id]` detail caches so open detail pages reflect the
 * updated teamcityProjectId / teamcityProjectUrl immediately.
 */
export function useTeamCityResync() {
  const queryClient = useQueryClient()
  return useMutation<TeamCityResyncResult, Error, void>({
    mutationFn: () =>
      api.post<TeamCityResyncResult>('/admin/teamcity-project-ids/resync'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['components'] })
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'component',
      })
    },
  })
}
