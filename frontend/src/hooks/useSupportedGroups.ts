import { useQuery } from '@tanstack/react-query'
import { apiAbsolute } from '../lib/api'

/**
 * Allowed groupId prefixes for new components, sourced from
 * `GET /rest/api/2/common/supported-groups`.
 *
 * **Error policy is intentionally LOUD**: this endpoint already exists in
 * CRS, so a 404 / 5xx is a real failure, not "feature not shipped yet". We
 * do **not** convert errors to `[]` — the consumer must gate Submit on
 * `isLoading` / `isError`. Validating against an empty allowed-prefix list
 * would otherwise reject every valid groupId and silently mislead the user.
 *
 * Uses `apiAbsolute` because the endpoint lives under /rest/api/2, not
 * /rest/api/4 — the default `api` helper would mis-route the request.
 */
export function useSupportedGroups() {
  return useQuery({
    queryKey: ['meta', 'supported-groups'],
    queryFn: () => apiAbsolute.get<string[]>('/rest/api/2/common/supported-groups'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
