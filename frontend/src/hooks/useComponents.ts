import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ComponentSummary, ComponentFilter, Page } from '../lib/types'

interface UseComponentsParams {
  filter?: ComponentFilter
  page?: number
  size?: number
  sort?: string
  // When false, the query is held (e.g. the command palette's component search
  // skips the request until the user has typed something). Defaults to true so
  // the list page is unaffected.
  enabled?: boolean
}

// Default sort is `componentKey,asc`. The CRS v4 JPA entity's primary text
// property is `componentKey` (the DB column renamed `name` → `component_key`
// in the schema migration); Spring Data binds the `sort=` query param to
// the entity property, NOT the v4 DTO field, so `sort=name,asc` throws
// PropertyReferenceException inside JPA → 500. Pinning the default here
// keeps the SPA aligned with the entity property; the v4 DTO continues to
// expose the value under the `name` field for API consumers.
export function useComponents({ filter, page = 0, size = 20, sort = 'componentKey,asc', enabled = true }: UseComponentsParams = {}) {
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
  // Extended-search filters (CRS v4). clientCode / jiraProjectKey /
  // parentComponentName / groupKey are multi-value exact-IN (SYS-046): CSV join,
  // OR semantics — same wire shape as system/owner/buildSystem/labels. The rest
  // stay single-value (empty strings dropped, booleans stringified).
  if (filter?.clientCode?.length) params.set('clientCode', filter.clientCode.join(','))
  if (filter?.solution !== undefined) params.set('solution', String(filter.solution))
  if (filter?.jiraProjectKey?.length) params.set('jiraProjectKey', filter.jiraProjectKey.join(','))
  if (filter?.jiraTechnical !== undefined) params.set('jiraTechnical', String(filter.jiraTechnical))
  if (filter?.vcsPath) params.set('vcsPath', filter.vcsPath)
  if (filter?.productionBranch) params.set('productionBranch', filter.productionBranch)
  if (filter?.parentComponentName?.length) params.set('parentComponentName', filter.parentComponentName.join(','))
  if (filter?.groupKey?.length) params.set('groupKey', filter.groupKey.join(','))
  // Java version: exact-match OR across BASE-row values (SYS meta/java-versions), CSV on the wire.
  if (filter?.javaVersion?.length) params.set('javaVersion', filter.javaVersion.join(','))
  // Phase 1b: personal RM/SC presets + Health people deep-links. Multi-value
  // CSV, OR semantics — CRS now binds `List<String>?` for these (same wire
  // shape as owner/system/buildSystem).
  if (filter?.releaseManager?.length) params.set('releaseManager', filter.releaseManager.join(','))
  if (filter?.securityChampion?.length) params.set('securityChampion', filter.securityChampion.join(','))
  // Distribution boolean filters (SYS-045); `=false` excludes NULL rows server-side.
  if (filter?.distributionExplicit !== undefined) params.set('distributionExplicit', String(filter.distributionExplicit))
  if (filter?.distributionExternal !== undefined) params.set('distributionExternal', String(filter.distributionExternal))

  return useQuery({
    queryKey: ['components', { filter, page, size, sort }],
    queryFn: () => api.get<Page<ComponentSummary>>(`/components?${params.toString()}`),
    enabled,
  })
}
