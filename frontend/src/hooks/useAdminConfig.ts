import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// field-config and component-defaults are now code-as-config (managed in
// service-config, read-only in the Portal). Only reads remain; the legacy admin
// PUT writers were removed (the backend returns 410 Gone). Changes are applied by
// editing service-config and calling POST /admin/reload-config — see useReloadConfig.

export function useFieldConfig() {
  return useQuery({
    queryKey: ['config', 'field-config'],
    queryFn: () => api.get<Record<string, unknown>>('/config/field-config'),
  })
}

export function useComponentDefaults() {
  return useQuery({
    queryKey: ['config', 'component-defaults'],
    queryFn: () => api.get<Record<string, unknown>>('/config/component-defaults'),
  })
}

/**
 * Reload field-config + component-defaults from service-config WITHOUT a redeploy.
 * Calls the admin endpoint that triggers a Spring Cloud Config refresh + cache
 * re-sync, then invalidates both config queries so the read-only views update.
 */
export function useReloadConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<Record<string, unknown>>('/admin/reload-config'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'field-config'] })
      queryClient.invalidateQueries({ queryKey: ['config', 'component-defaults'] })
    },
  })
}
