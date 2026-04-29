import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { FullMigrationResult, MigrationStatus } from '../lib/types'

export function useMigrationStatus() {
  return useQuery<MigrationStatus>({
    queryKey: ['migration', 'status'],
    queryFn: () => api.get<MigrationStatus>('/admin/migration-status'),
  })
}

export function useRunMigration() {
  const queryClient = useQueryClient()
  return useMutation<FullMigrationResult, Error, void>({
    mutationFn: () => api.post<FullMigrationResult>('/admin/migrate'),
    onSuccess: () => {
      // Status reflects the new git/db split after migration. Component
      // defaults are rewritten by ImportService.migrate() (see
      // FullMigrationResult.defaults), so anything reading
      // /config/component-defaults must refetch.
      queryClient.invalidateQueries({ queryKey: ['migration', 'status'] })
      queryClient.invalidateQueries({ queryKey: ['config', 'component-defaults'] })
    },
  })
}
