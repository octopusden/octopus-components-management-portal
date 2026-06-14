import { describe, it, expect } from 'vitest'
import {
  hasValidationIssue,
  validationIssueCount,
  problemExampleVersions,
  validationBadgeCount,
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

  it('is true for problems or a failed check', () => {
    expect(hasValidationIssue(withProblems(problem()))).toBe(true)
    expect(hasValidationIssue(failedCheck())).toBe(true)
  })
})

describe('validationIssueCount', () => {
  it('counts problems plus a failed check', () => {
    expect(validationIssueCount(clean())).toBe(0)
    expect(validationIssueCount(withProblems(problem(), problem()))).toBe(2)
    expect(validationIssueCount(failedCheck())).toBe(1)
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
    expect(validationBadgeCount(failedCheck())).toBe(1)
  })
})
