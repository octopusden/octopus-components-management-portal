import { useMetaInUse, type UseMetaOptions } from './useMetaInUse'

/**
 * Component-key regexes a test component must match (CRS SYS-099), in configured
 * order, e.g. `["^test-", "^cvelab-"]`. A CRS without the endpoint yields `[]`
 * (404/501), which callers treat as "no restriction known" — CRS still 400s.
 */
export function useTestComponentNamePatterns(options?: UseMetaOptions) {
  return useMetaInUse('test-component-name-patterns', '/components/meta/test-component-name-patterns', options)
}

/**
 * Whether `key` may carry `testComponent=true` under `patterns` (find semantics,
 * like CRS). Fail-open: no usable pattern → true; an unparsable pattern is skipped.
 */
export function keyMatchesTestPatterns(key: string, patterns: readonly string[]): boolean {
  const regexes = patterns.flatMap((p) => {
    try {
      return [new RegExp(p)]
    } catch {
      return []
    }
  })
  return regexes.length === 0 || regexes.some((r) => r.test(key))
}
