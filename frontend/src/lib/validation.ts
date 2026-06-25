import type { ComponentValidation, ValidationProblem } from './types'

// Pure helpers for the Validation Problems facility — kept out of the
// ValidationBadge component file so the component module stays component-only
// (react-refresh/only-export-components) and so the logic is unit-testable in
// isolation from the DOM.

/**
 * Number of genuine, actionable problems a validation carries.
 *
 * A failed check (`checkFailed`) is deliberately NOT counted: it is a system
 * condition (we could not verify the component), not a problem with the
 * component itself, and is surfaced once at report level — never per component.
 */
export function validationIssueCount(cv: ComponentValidation): number {
  return cv.problems.length
}

/**
 * A component is worth flagging in the UI (red triangle / Validation Problems
 * tab) ONLY when it has a genuine problem. A failed check is intentionally
 * excluded — see [validationIssueCount] / [countCheckFailed].
 */
export function hasValidationIssue(cv: ComponentValidation | undefined): boolean {
  return !!cv && cv.problems.length > 0
}

/**
 * How many components in a report could NOT be checked (a system/infra failure
 * such as the release-management or components-registry service being briefly
 * unreachable). Drives the single report-level "validation temporarily
 * unavailable" banner instead of lighting up every affected row.
 */
export function countCheckFailed(cvs: Iterable<ComponentValidation>): number {
  let n = 0
  for (const cv of cvs) {
    if (cv.checkFailed) n++
  }
  return n
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
 * Every version string across ALL of a component's problems, in problem order,
 * for the "Copy" affordance in the full-list dialog. Newline-join at the call
 * site. Versions can legally repeat across problems; we do not dedup so the
 * copied list mirrors exactly what is rendered.
 */
export function allProblemVersions(cv: ComponentValidation): string[] {
  return cv.problems.flatMap((p) => problemExampleVersions(p))
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
