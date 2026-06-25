import { describe, it, expect } from 'vitest'
import {
  hasValidationIssue,
  validationIssueCount,
  problemExampleVersions,
  validationBadgeCount,
  countCheckFailed,
} from './validation'
import type { ComponentValidation, ValidationProblem } from './types'

function clean(): ComponentValidation {
  return { component: 'c', problems: [], checkFailed: false, checkError: null }
}

function problem(over: Partial<ValidationProblem> = {}): ValidationProblem {
  return {
    type: 'UNREGISTERED_RELEASED_VERSIONS',
    severity: 'ERROR',
    message: 'm',
    details: {},
    ...over,
  }
}

function withProblems(...problems: ValidationProblem[]): ComponentValidation {
  return { component: 'c', problems, checkFailed: false, checkError: null }
}

function failedCheck(): ComponentValidation {
  return { component: 'c', problems: [], checkFailed: true, checkError: 'RM 500' }
}

describe('hasValidationIssue', () => {
  it('is false for undefined / clean', () => {
    expect(hasValidationIssue(undefined)).toBe(false)
    expect(hasValidationIssue(clean())).toBe(false)
  })

  it('is true for genuine problems', () => {
    expect(hasValidationIssue(withProblems(problem()))).toBe(true)
  })

  it('is false for a failed check (a system failure is NOT a per-component problem)', () => {
    // A failed check means we could not verify the component — that is an
    // operational/system condition surfaced once at report level, never as a
    // per-component "Validation Problem" (no red triangle, tooltip or tab).
    expect(hasValidationIssue(failedCheck())).toBe(false)
  })

  it('is true when a genuine problem coexists with a failed check (problem wins)', () => {
    // Defensive: the two are mutually exclusive in practice, but if a payload
    // ever carries both, the genuine problem must still surface.
    const both: ComponentValidation = {
      component: 'c',
      problems: [problem()],
      checkFailed: true,
      checkError: 'RM 500',
    }
    expect(hasValidationIssue(both)).toBe(true)
    expect(validationIssueCount(both)).toBe(1)
    // ...and it is still counted as check-failed for the report-level banner.
    expect(countCheckFailed([both])).toBe(1)
  })
})

describe('validationIssueCount', () => {
  it('counts genuine problems only (a failed check is not an issue)', () => {
    expect(validationIssueCount(clean())).toBe(0)
    expect(validationIssueCount(withProblems(problem(), problem()))).toBe(2)
    expect(validationIssueCount(failedCheck())).toBe(0)
  })
})

describe('countCheckFailed', () => {
  it('counts components whose check failed across the report', () => {
    expect(countCheckFailed([])).toBe(0)
    expect(countCheckFailed([clean(), withProblems(problem())])).toBe(0)
    expect(countCheckFailed([clean(), failedCheck(), failedCheck()])).toBe(2)
  })

  it('accepts the values iterator of a Map (the byComponent overlay shape)', () => {
    const map = new Map<string, ComponentValidation>([
      ['a', clean()],
      ['b', failedCheck()],
    ])
    expect(countCheckFailed(map.values())).toBe(1)
  })
})

describe('problemExampleVersions', () => {
  it('reads the versions string array', () => {
    expect(problemExampleVersions(problem({ details: { versions: ['a', 'b'] } }))).toEqual([
      'a',
      'b',
    ])
  })

  it('returns [] when versions is absent or not an array', () => {
    expect(problemExampleVersions(problem({ details: {} }))).toEqual([])
    expect(problemExampleVersions(problem({ details: { versions: 'nope' } }))).toEqual([])
  })

  it('drops non-string entries defensively', () => {
    expect(
      problemExampleVersions(problem({ details: { versions: ['a', 1, null, 'b'] } })),
    ).toEqual(['a', 'b'])
  })
})

describe('validationBadgeCount', () => {
  it('sums missingCount across problems when present', () => {
    expect(
      validationBadgeCount(
        withProblems(
          problem({ details: { missingCount: 2 } }),
          problem({ details: { missingCount: 3 } }),
        ),
      ),
    ).toBe(5)
  })

  it('falls back to the issue count when no missingCount is present', () => {
    expect(validationBadgeCount(withProblems(problem({ details: {} })))).toBe(1)
    // A failed check carries no problems → issue count 0. (The badge never
    // renders for a check-failed-only component; this just pins the fallback.)
    expect(validationBadgeCount(failedCheck())).toBe(0)
  })
})
