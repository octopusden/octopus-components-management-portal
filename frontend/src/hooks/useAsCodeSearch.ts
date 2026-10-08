import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { AsCodeSearchResponse } from '../lib/types'

/** Server minimum for `q` (after trimming); shorter queries are never sent. */
export const AS_CODE_SEARCH_MIN_QUERY = 2

export interface AsCodeSearchParams {
  query: string
  regex: boolean
  /** `undefined` = archived and active components alike (the server default). */
  archived?: boolean
  limit?: number
  /** Matching lines returned per component (server default when unset). */
  maxMatchesPerComponent?: number
}

/** Builds the `/components/as-code/search` path; exported for tests. */
export function asCodeSearchPath({ query, regex, archived, limit, maxMatchesPerComponent }: AsCodeSearchParams): string {
  const params = new URLSearchParams()
  params.set('q', query.trim())
  if (regex) params.set('regex', 'true')
  if (archived !== undefined) params.set('archived', String(archived))
  if (limit !== undefined) params.set('limit', String(limit))
  if (maxMatchesPerComponent !== undefined) params.set('maxMatchesPerComponent', String(maxMatchesPerComponent))
  return `/components/as-code/search?${params.toString()}`
}

/**
 * Global text search over every component's as-code view (CRS SYS-100).
 *
 * The query is held until the trimmed text reaches the server minimum, so typing the first
 * character never produces a 400. Previous results stay on screen while the next query loads
 * (`keepPreviousData`), so the list does not flash empty on every keystroke. Errors are not
 * swallowed: a 400 carries the server's reason (invalid regex, too expensive, too complex),
 * which the page shows inline. No retry — a 400 is deterministic.
 */
export function useAsCodeSearch(params: AsCodeSearchParams) {
  const trimmed = params.query.trim()
  return useQuery({
    queryKey: [
      'as-code-search',
      trimmed,
      params.regex,
      params.archived ?? null,
      params.limit ?? null,
      params.maxMatchesPerComponent ?? null,
    ],
    queryFn: () => api.get<AsCodeSearchResponse>(asCodeSearchPath(params)),
    enabled: trimmed.length >= AS_CODE_SEARCH_MIN_QUERY,
    placeholderData: keepPreviousData,
    retry: false,
  })
}
