import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export type AsCodeMode = 'full' | 'resolved'

interface UseComponentAsCodeOptions {
  mode: AsCodeMode
  /** Concrete version for `mode: 'resolved'`. Ignored in full mode. */
  version?: string
}

/**
 * Fetches the Groovy-style "as-code" rendering of a component as text/plain.
 *
 * - `mode: 'full'`  → GET /components/{id}/as-code            (all version ranges)
 * - `mode: 'resolved'` → GET /components/{id}/as-code?version=X (merged for X)
 *
 * The query is disabled until there is an id and, in resolved mode, a non-blank
 * version — so we never fire a request for an empty version box. Errors are NOT
 * swallowed: a 404 in resolved mode means "no configuration resolves for that
 * version", which the tab distinguishes from a missing component via
 * `ApiError.status`.
 */
export function useComponentAsCode(id: string, { mode, version }: UseComponentAsCodeOptions) {
  const trimmedVersion = version?.trim() ?? ''
  const resolved = mode === 'resolved'
  return useQuery({
    queryKey: ['component-as-code', id, resolved ? trimmedVersion : null],
    queryFn: () => {
      const path = resolved
        ? `/components/${id}/as-code?version=${encodeURIComponent(trimmedVersion)}`
        : `/components/${id}/as-code`
      return api.getText(path)
    },
    enabled: !!id && (!resolved || trimmedVersion.length > 0),
  })
}
