import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ComponentSummary, ComponentFilter, Page } from '../lib/types'

interface UseComponentsParams {
  filter?: ComponentFilter
  page?: number
  size?: number
  sort?: string
}

// Default sort is `componentKey,asc`. The CRS v4 JPA entity's primary text
// property is `componentKey` (the DB column renamed `name` → `component_key`
// in the schema migration); Spring Data binds the `sort=` query param to
// the entity property, NOT the v4 DTO field, so `sort=name,asc` throws
// PropertyReferenceException inside JPA → 500. Pinning the default here
// keeps the SPA aligned with the entity property; the v4 DTO continues to
// expose the value under the `name` field for API consumers.
export function useComponents({ filter, page = 0, size = 20, sort = 'componentKey,asc' }: UseComponentsParams = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('size', String(size))
  params.set('sort', sort)
  // CSV multi-value, OR semantics; CRS controller binds `List<String>?`
  // via Spring's CSV binder (companion CRS PR mirroring buildSystem).
  if (filter?.system?.length) params.set('system', filter.system.join(','))
  if (filter?.archived !== undefined) params.set('archived', String(filter.archived))
  if (filter?.search) params.set('search', filter.search)
  // CSV multi-value, OR semantics; CRS controller binds `List<String>?`
  // via Spring's CSV binder (companion CRS PR mirroring buildSystem/system).
  if (filter?.owner?.length) params.set('owner', filter.owner.join(','))
  // CSV multi-value; CRS controller binds `List<String>?` via Spring's
  // CSV binder (companion CRS PR). Until that lands a single-value
  // selection still wins because the wire param is still `?buildSystem=`.
  if (filter?.buildSystem?.length) params.set('buildSystem', filter.buildSystem.join(','))
  // CSV; CRS normalises split-by-comma + trim + drop-empty server-side.
  // If labels ever need to contain commas, switch to repeatable params.
  if (filter?.labels?.length) params.set('labels', filter.labels.join(','))
  if (filter?.canBeParent !== undefined) params.set('canBeParent', String(filter.canBeParent))
  // Extended-search single-value filters (CRS-PR2). Empty strings are dropped
  // (treated as no-filter); booleans are stringified.
  if (filter?.clientCode) params.set('clientCode', filter.clientCode)
  if (filter?.solution !== undefined) params.set('solution', String(filter.solution))
  if (filter?.jiraProjectKey) params.set('jiraProjectKey', filter.jiraProjectKey)
  if (filter?.jiraTechnical !== undefined) params.set('jiraTechnical', String(filter.jiraTechnical))
  if (filter?.vcsPath) params.set('vcsPath', filter.vcsPath)
  if (filter?.productionBranch) params.set('productionBranch', filter.productionBranch)
  if (filter?.parentComponentName) params.set('parentComponentName', filter.parentComponentName)
  if (filter?.groupKey) params.set('groupKey', filter.groupKey)

  return useQuery({
    queryKey: ['components', { filter, page, size, sort }],
    queryFn: () => api.get<Page<ComponentSummary>>(`/components?${params.toString()}`),
  })
}
