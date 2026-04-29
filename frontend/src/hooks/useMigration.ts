import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { FullMigrationResult, MigrationStatus } from '../lib/types'

interface MigrationStatusOptions {
  // Pass a positive number (ms) to enable react-query polling. Use sparingly:
  // every armed consumer adds load to /admin/migration-status. The intended
  // caller is MigrationPanel during an in-flight run, so the operator sees
  // git/db counters updating live as ImportService chews through components.
  refetchInterval?: number | false
}

export function useMigrationStatus(options: MigrationStatusOptions = {}) {
  return useQuery<MigrationStatus>({
    queryKey: ['migration', 'status'],
    queryFn: () => api.get<MigrationStatus>('/admin/migration-status'),
    refetchInterval: options.refetchInterval ?? false,
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
