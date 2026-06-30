import { useQuery } from '@tanstack/react-query'
import { ApiError, apiAbsolute } from '../lib/api'

// CRS exposes the env-configured supported groupId prefixes via the v2 common
// namespace (CommonControllerV2#getSupportedGroupIds). It lives OUTSIDE the
// /rest/api/4 surface, so we reach it through apiAbsolute. Used to pre-validate
// that a typed groupId starts with one of these prefixes (CRS rule #10).
const SUPPORTED_GROUPS_PATH = '/rest/api/2/common/supported-groups'

export function useSupportedGroups(options: { enabled?: boolean } = {}): {
  groups: string[]
  isLoading: boolean
} {
  const { enabled = true } = options
  const query = useQuery({
    queryKey: ['meta', 'supported-groups'],
    queryFn: async () => {
      try {
        return await apiAbsolute.get<string[]>(SUPPORTED_GROUPS_PATH)
      } catch (e) {
        // Treat a missing endpoint as an empty vocabulary (mirrors useFieldOptions):
        // the group-prefix check then SKIPS rather than blocking every write on an
        // older/misconfigured server. Other failures propagate to the error state.
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
          return [] as string[]
        }
        throw e
      }
    },
    enabled,
    // Env config — effectively static for the page lifetime.
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return {
    // On error, fall back to [] so the prefix check skips (fail-open) instead of
    // surfacing a hard error in the form — CRS remains authoritative on submit.
    groups: query.data ?? [],
    isLoading: query.isLoading,
  }
}
