import { describe, it, expect } from 'vitest'
import type { ComponentSummary } from './types'
import { matchesQuery, rankComponents } from './paletteSearch'

// Minimal ComponentSummary factory — only the fields rankComponents reads matter.
// Fixtures use neutral synthetic names (no real component/product names).
function comp(name: string, displayName: string | null = null): ComponentSummary {
  return {
    id: name,
    name,
    displayName,
    componentOwner: null,
    system: null,
    productType: null,
    archived: false,
    updatedAt: null,
    labels: [],
  }
}

const names = (items: ComponentSummary[]) => items.map((c) => c.name)

describe('matchesQuery', () => {
  it('is a case-insensitive substring test', () => {
    expect(matchesQuery('Payments', 'pay')).toBe(true)
    expect(matchesQuery('Payments', 'PAY')).toBe(true)
    expect(matchesQuery('billing', 'xyz')).toBe(false)
  })

  it('treats null / undefined / empty labels as no match', () => {
    expect(matchesQuery(null, 'a')).toBe(false)
    expect(matchesQuery(undefined, 'a')).toBe(false)
    expect(matchesQuery('', 'a')).toBe(false)
  })
})

describe('rankComponents', () => {
  it('orders prefix < word-boundary < loose substring', () => {
    const ranked = rankComponents(
      [comp('prepay-tool'), comp('payments'), comp('legacy-pay')],
      'pay',
    )
    // payments: prefix (0); legacy-pay: boundary after '-' (1); prepay-tool: substring (2)
    expect(names(ranked)).toEqual(['payments', 'legacy-pay', 'prepay-tool'])
  })

  it('treats _ and space as word boundaries (rank 1)', () => {
    const ranked = rankComponents([comp('xxsvc'), comp('doc_svc')], 'svc')
    // doc_svc: boundary after '_' (1) beats xxsvc: loose substring (2)
    expect(names(ranked)).toEqual(['doc_svc', 'xxsvc'])
  })

  it('tie-breaks equal rank by shorter name, then alphabetically', () => {
    const ranked = rankComponents([comp('logbook'), comp('logs'), comp('log-x')], 'log')
    // all prefix (rank 0) → by length: logs(4) log-x(5) logbook(7) → shortest first
    expect(names(ranked)).toEqual(['logs', 'log-x', 'logbook'])
  })

  it('matches against displayName as well as name', () => {
    const ranked = rankComponents([comp('svc-a', 'Alpha Service'), comp('billing')], 'alpha')
    expect(names(ranked)).toEqual(['svc-a'])
  })

  it('ranks by the better (min) of name vs displayName', () => {
    // name is a loose substring (2); displayName is a prefix (0) → should rank as 0
    const prefixViaDisplay = comp('zzz-svc', 'Log Portal')
    const looseName = comp('catalog-x')
    const ranked = rankComponents([looseName, prefixViaDisplay], 'log')
    expect(names(ranked)[0]).toBe('zzz-svc')
  })

  it('caps the result set (default 6)', () => {
    const many = Array.from({ length: 12 }, (_, i) => comp(`log-${String(i).padStart(2, '0')}`))
    expect(rankComponents(many, 'log')).toHaveLength(6)
    expect(rankComponents(many, 'log', 3)).toHaveLength(3)
  })

  it('returns empty for a query that matches nothing', () => {
    expect(rankComponents([comp('payments'), comp('billing')], 'zzz')).toEqual([])
  })
})
