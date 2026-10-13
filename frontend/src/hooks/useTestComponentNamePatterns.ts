import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'

/**
 * Component-key regexes a test component must match (CRS SYS-099), in configured
 * order, e.g. `["^test-", "^cvelab-"]`. A real `[]` means no component may be
 * flagged. `data` is `null` when the endpoint is missing (404/501, older CRS):
 * callers treat that as "no restriction known" (fail-open — CRS still 400s).
 */
export function useTestComponentNamePatterns() {
  return useQuery({
    queryKey: ['meta', 'test-component-name-patterns'],
    queryFn: async (): Promise<string[] | null> => {
      try {
        return await api.get<string[]>('/components/meta/test-component-name-patterns')
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return null
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

/**
 * Whether `key` may carry `testComponent=true` under `patterns` (find semantics,
 * like CRS). `[]` → false (nothing may be flagged). Fail-open: if ANY pattern does
 * not compile as a JS RegExp (Java-only syntax such as `(?i)` or `\p{Alpha}`), the
 * Portal cannot evaluate the set faithfully, so it returns true and CRS decides.
 */
export function keyMatchesTestPatterns(key: string, patterns: readonly string[]): boolean {
  const regexes: RegExp[] = []
  for (const p of patterns) {
    try {
      regexes.push(new RegExp(p))
    } catch {
      return true
    }
  }
  return regexes.some((r) => r.test(key))
}
