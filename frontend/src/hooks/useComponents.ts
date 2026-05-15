import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ComponentSummary, ComponentFilter, Page } from '../lib/types'

interface UseComponentsParams {
  filter?: ComponentFilter
  page?: number
  size?: number
  sort?: string
}

// Default sort is `componentKey,asc` — schema-v2 (CRS PR #192's V1__schema.sql)
// renamed the component's primary text column from `name` to `component_key`
// and the JPA entity property follows the column. Spring Data binds the
// `sort=` query param to the entity property, NOT the v4 DTO field, so
// `sort=name,asc` throws PropertyReferenceException inside JPA → 500.
// Pinning the default here keeps the SPA aligned with the actual entity
// property; v4 DTO continues to expose the value under the `name` field for
// API consumers.
export function useComponents({ filter, page = 0, size = 20, sort = 'componentKey,asc' }: UseComponentsParams = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('size', String(size))
  params.set('sort', sort)
  if (filter?.system) params.set('system', filter.system)
  if (filter?.productType) params.set('productType', filter.productType)
  if (filter?.archived !== undefined) params.set('archived', String(filter.archived))
  if (filter?.search) params.set('search', filter.search)
  if (filter?.owner) params.set('owner', filter.owner)
  if (filter?.buildSystem) params.set('buildSystem', filter.buildSystem)

  return useQuery({
    queryKey: ['components', { filter, page, size, sort }],
    queryFn: () => api.get<Page<ComponentSummary>>(`/components?${params.toString()}`),
  })
}
