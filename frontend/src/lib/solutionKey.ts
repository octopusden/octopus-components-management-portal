/**
 * A component may be toggled solution/not-solution on the General tab only when
 * its key marks it as a "solution candidate" — i.e. the key CONTAINS one of the
 * configured substrings (default `-solution`, `dmp-bundle`; sourced from
 * service-config via /portal/config). Every other component keeps `solution`
 * server-owned and surfaced read-only as a header badge/banner.
 *
 * Substring semantics (mirrors the backend), case-sensitive — component keys are
 * lower-case by convention, and the patterns are authored to match.
 */
export function isSolutionCandidate(
  componentKey: string | null | undefined,
  patterns: readonly string[] | undefined,
): boolean {
  if (!componentKey || !patterns || patterns.length === 0) return false
  return patterns.some((p) => p !== '' && componentKey.includes(p))
}
