import { useQuery, skipToken } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'
import { useFieldConfigOptions } from './useFieldConfig'

const META_ENDPOINTS: Record<string, string> = {
  buildSystem: '/components/meta/build-systems',
  // Sectioned path: aligns with GeneralTab.tsx + ComponentDetailPage.tsx
  // which both read systems via useFieldConfigEntry('component.system').
  // Using the same key here keeps admin field-config edits effective on
  // the filter bar AND the editor surface — they'd otherwise resolve to
  // different entries and silently drift apart.
  'component.system': '/components/meta/systems',
  repositoryType: '/components/meta/repository-types',
  generation: '/components/meta/escrow-generations',
  // Allowed Java / Maven build-tool versions (numeric-sorted server-side). Keys are the
  // section-prefixed field-config paths the BuildTab EnumSelect passes, so an admin
  // field-config `options[]` for these fields takes precedence over the meta endpoint.
  'build.javaVersion': '/components/meta/java-versions',
  'build.mavenVersion': '/components/meta/maven-versions',
}

interface UseFieldOptionsOptions {
  /**
   * Gate the meta-endpoint fetch behind a UI interaction. Defaults to `true`.
   * Filter pickers whose endpoint may not yet exist (e.g. /meta/systems
   * before the companion CRS PR ships) should pass `false` until first
   * popover open — otherwise the page-mount fetch fires a native browser
   * 404 log BEFORE React Query's catch runs, which Playwright's
   * console-error listener picks up. Admin-side callers (already gated
   * by a logged-in admin route) keep the default.
   */
  enabled?: boolean
}

export function useFieldOptions(
  fieldPath: string,
  { enabled = true }: UseFieldOptionsOptions = {},
): {
  options: string[]
  isLoading: boolean
} {
  const { options: adminOptions, isLoading: adminLoading } =
    useFieldConfigOptions(fieldPath)
  const endpoint = META_ENDPOINTS[fieldPath]
  const hasAdminOptions = adminOptions.length > 0
  const shouldFetchMeta = !!endpoint && !adminLoading && !hasAdminOptions && enabled

  const metaQuery = useQuery({
    queryKey: ['meta', 'field-options', fieldPath],
    queryFn: shouldFetchMeta
      ? async () => {
          try {
            return await api.get<string[]>(endpoint)
          } catch (e) {
            // CRS may not have shipped this meta endpoint yet — treat the
            // "missing endpoint" responses as an empty vocabulary. Mirrors
            // the useLabels pattern. Any other failure (5xx, network)
            // still propagates to React Query's error state.
            if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
              return [] as string[]
            }
            throw e
          }
        }
      : skipToken,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  if (hasAdminOptions) {
    return { options: adminOptions, isLoading: false }
  }

  if (!endpoint) {
    return { options: [], isLoading: adminLoading }
  }

  if (metaQuery.isError) {
    return { options: [], isLoading: false }
  }

  return {
    options: metaQuery.data ?? [],
    isLoading: adminLoading || metaQuery.isLoading,
  }
}
