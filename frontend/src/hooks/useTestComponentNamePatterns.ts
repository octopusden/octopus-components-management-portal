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
 * not compile as a JS RegExp (Java-only syntax such as `(?i)`, `\A` or `\Q…\E`), the
 * Portal cannot evaluate the set faithfully, so it returns true and CRS decides.
 * Unicode mode (`u`) is what makes such syntax throw: without it JS reads an unknown
 * escape as a literal character, and the pattern silently matches nothing.
 */
export function keyMatchesTestPatterns(key: string, patterns: readonly string[]): boolean {
  const regexes: RegExp[] = []
  for (const p of patterns) {
    try {
      regexes.push(new RegExp(p, 'u'))
    } catch {
      return true
    }
  }
  return regexes.some((r) => r.test(key))
}

/**
 * "Create Similar": a clone of a test component stays a test component when its new key
 * may carry the flag (unknown patterns → fail-open, CRS decides). Otherwise the clone of
 * a component with a test parent or docs would be created as real, and CRS rejects a real
 * component referencing a test one — the create form has no switch to fix it.
 */
export function cloneTestComponent(
  source: { testComponent?: boolean } | undefined,
  key: string,
  patterns: readonly string[] | null | undefined,
): boolean {
  return !!source?.testComponent && (patterns == null || keyMatchesTestPatterns(key.trim(), patterns))
}
