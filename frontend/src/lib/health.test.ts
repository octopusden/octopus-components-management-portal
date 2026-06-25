import { describe, it, expect } from 'vitest'
import {
  computeHealthKpis,
  topOffenders,
  rankPeople,
  peopleFilterHref,
} from './health'
import type { ComponentValidation } from './types'

function cv(
  component: string,
  problems: ComponentValidation['problems'],
  checkFailed = false,
): ComponentValidation {
  return { component, problems, checkFailed, checkError: checkFailed ? 'RM 500' : null }
}

// A problem carrying N implicated versions via details.missingCount.
function unregistered(missingCount: number): ComponentValidation['problems'][number] {
  return {
    type: 'UNREGISTERED_RELEASED_VERSIONS',
    severity: 'ERROR',
    message: `${missingCount} released version(s) not registered`,
    details: { missingCount, versions: Array.from({ length: missingCount }, (_, i) => `v${i}`) },
  }
}

describe('computeHealthKpis', () => {
  it('counts only components with genuine problems, excluding check-failed', () => {
    const k = computeHealthKpis(10, [
      cv('a', [unregistered(3)]),
      cv('b', [unregistered(1)]),
      cv('c', [], true), // checkFailed, empty problems — not a problem
      cv('x', [unregistered(2)], true), // checkFailed WITH problems — still excluded
      cv('d', []), // clean
    ])
    expect(k.withProblems).toBe(2)
    expect(k.problemVersions).toBe(4) // 3 + 1; the check-failed x's 2 is not counted
    expect(k.total).toBe(10)
  })

  it('sums problem versions across problem-bearing components', () => {
    const k = computeHealthKpis(5, [cv('a', [unregistered(3)]), cv('b', [unregistered(2)])])
    expect(k.problemVersions).toBe(5)
  })

  it('derives healthy = total − withProblems and the ratios', () => {
    const k = computeHealthKpis(10, [cv('a', [unregistered(1)]), cv('b', [unregistered(1)])])
    expect(k.healthy).toBe(8)
    expect(k.withProblemsRatio).toBeCloseTo(0.2)
    expect(k.healthyRatio).toBeCloseTo(0.8)
  })

  it('guards against divide-by-zero and never goes negative', () => {
    const empty = computeHealthKpis(0, [])
    expect(empty.withProblemsRatio).toBe(0)
    expect(empty.healthyRatio).toBe(0)
    // stale report with more problems than CRS total → healthy clamps at 0
    const stale = computeHealthKpis(1, [cv('a', [unregistered(1)]), cv('b', [unregistered(1)])])
    expect(stale.healthy).toBe(0)
  })
})

describe('topOffenders', () => {
  it('orders by problem versions desc, capped at the limit', () => {
    const rows = topOffenders(
      [
        cv('a', [unregistered(2)]),
        cv('b', [unregistered(9)]),
        cv('c', [unregistered(5)]),
        cv('clean', []),
      ],
      2,
    )
    expect(rows.map((r) => r.component)).toEqual(['b', 'c'])
    expect(rows[0]!.problemVersions).toBe(9)
  })

  it('breaks ties by component key ascending (deterministic)', () => {
    const rows = topOffenders([cv('zeta', [unregistered(3)]), cv('alpha', [unregistered(3)])], 5)
    expect(rows.map((r) => r.component)).toEqual(['alpha', 'zeta'])
  })

  it('excludes check-failed (even with problems) and clean components', () => {
    const rows = topOffenders([cv('a', [], true), cv('b', []), cv('x', [unregistered(4)], true)])
    expect(rows).toEqual([])
  })
})

describe('rankPeople', () => {
  it('ranks by count desc then person asc', () => {
    const ranked = rankPeople({ bob: 5, alice: 10, carol: 5 })
    expect(ranked).toEqual([
      { person: 'alice', count: 10 },
      { person: 'bob', count: 5 },
      { person: 'carol', count: 5 },
    ])
  })

  it('returns [] for an empty map', () => {
    expect(rankPeople({})).toEqual([])
  })
})

describe('peopleFilterHref', () => {
  it('builds a single-value comma-array filter href per role', () => {
    expect(peopleFilterHref('owner', 'alice')).toBe('/components?owner=alice')
    expect(peopleFilterHref('releaseManager', 'carol')).toBe('/components?releaseManager=carol')
    expect(peopleFilterHref('securityChampion', 'dan')).toBe('/components?securityChampion=dan')
  })

  it('URL-encodes the person', () => {
    expect(peopleFilterHref('owner', 'a b+c')).toBe('/components?owner=a%20b%2Bc')
  })
})
