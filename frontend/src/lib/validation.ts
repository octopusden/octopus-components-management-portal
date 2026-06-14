import type { ComponentValidation, ValidationProblem } from './types'

// Pure helpers for the Validation Problems facility — kept out of the
// ValidationBadge component file so the component module stays component-only
// (react-refresh/only-export-components) and so the logic is unit-testable in
// isolation from the DOM.

/** Total number of "issues" a validation carries — problems + a failed check. */
export function validationIssueCount(cv: ComponentValidation): number {
  return cv.problems.length + (cv.checkFailed ? 1 : 0)
}

/** A component is worth flagging when it has any problem OR its check failed. */
export function hasValidationIssue(cv: ComponentValidation | undefined): boolean {
  return !!cv && (cv.problems.length > 0 || cv.checkFailed)
}

/**
 * Read the `versions` string array from a problem's open `details` payload
 * defensively — the field is present for UNREGISTERED_RELEASED_VERSIONS but the
 * type is open, so we never assume its shape.
 */
export function problemExampleVersions(problem: ValidationProblem): string[] {
  // Optional-chain `details`: a malformed/older response may omit it entirely.
  const raw = (problem.details as { versions?: unknown } | undefined)?.versions
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === 'string')
}

/**
 * The number to display on the badge. Prefer the summed problem-specific
 * `missingCount` (most meaningful to a maintainer); fall back to the issue
 * count when no problem carries a numeric missingCount.
 */
export function validationBadgeCount(cv: ComponentValidation): number {
  let total = 0
  let sawCount = false
  for (const p of cv.problems) {
    // Optional-chain `details`: a malformed/older response may omit it entirely.
    const mc = (p.details as { missingCount?: unknown } | undefined)?.missingCount
    if (typeof mc === 'number') {
      total += mc
      sawCount = true
    }
  }
  if (sawCount) return total
  return validationIssueCount(cv)
}
