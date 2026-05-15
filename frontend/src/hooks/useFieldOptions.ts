import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useFieldConfigOptions } from './useFieldConfig'

const META_ENDPOINTS: Record<string, string> = {
  buildSystem: '/components/meta/build-systems',
  repositoryType: '/components/meta/repository-types',
  generation: '/components/meta/escrow-generations',
}

export function useFieldOptions(fieldPath: string): {
  options: string[]
  isLoading: boolean
} {
  const { options: adminOptions, isLoading: adminLoading } =
    useFieldConfigOptions(fieldPath)
  const endpoint = META_ENDPOINTS[fieldPath]
  const hasAdminOptions = adminOptions.length > 0

  const metaQuery = useQuery({
    queryKey: ['meta', 'field-options', fieldPath],
    queryFn: () => api.get<string[]>(endpoint!),
    enabled: !!endpoint && !adminLoading && !hasAdminOptions,
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
