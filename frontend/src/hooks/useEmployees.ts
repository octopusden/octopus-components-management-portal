import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface EmployeeMatch {
  username: string
  active: boolean
}

export type EmployeeStatuses = Record<string, boolean | null>

export function lookupEmployee(query: string): Promise<EmployeeMatch[]> {
  const username = query.trim()
  if (!username) return Promise.resolve([])
  return api.get<EmployeeMatch[]>(
    `/components/meta/employees?search=${encodeURIComponent(username)}`,
  )
}

export function useEmployeeStatuses(usernames: string[]) {
  const normalized = Array.from(
    new Set(usernames.map((username) => username.trim()).filter(Boolean)),
  ).sort()

  return useQuery({
    queryKey: ['meta', 'employees', 'status', normalized],
    queryFn: () =>
      api.post<EmployeeStatuses>('/components/meta/employees/status', normalized),
    enabled: normalized.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}
