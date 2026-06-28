import { describe, it, expect } from 'vitest'
import {
  detectIntraComponentConflicts,
  fromArtifactId,
  groupError,
  groupTokens,
  hasOverlappingOverrides,
  humanizeOwnership,
  isBadToken,
  legacyArtifactPattern,
  OWNERSHIP_ALL_VERSIONS,
  splitTokens,
  toArtifactIdRequest,
  type OwnershipMappingValue,
} from './artifactOwnership'
import type { ArtifactId } from './types'

const m = (over: Partial<OwnershipMappingValue> = {}): OwnershipMappingValue => ({
  id: over.id ?? 'm1',
  base: over.base ?? true,
  range: over.range ?? null,
  groups: over.groups ?? 'com.example',
  mode: over.mode ?? 'ALL',
  tokens: over.tokens ?? [],
  ...over,
})

describe('artifactOwnership helpers', () => {
  it('groupTokens splits on comma, trims, drops empties', () => {
    expect(groupTokens(' a , b ,, c ')).toEqual(['a', 'b', 'c'])
  })

  it('isBadToken: positive allowlist [A-Za-z0-9_.-] matching CRS isLiteralToken', () => {
    expect(isBadToken('foo.bar-baz_1')).toBe(false)
    expect(isBadToken('')).toBe(true)
    // regex/wildcard metachars AND any other non-allowlist char (/, :, #, @) — CRS 400s these.
    for (const t of ['a*', 'a+', 'a[b]', 'a|b', 'a?b', 'a b', 'a\\b', 'a^b', 'a$b', '(a)', 'foo/bar', 'foo:bar', 'foo#bar', 'foo@bar']) {
      expect(isBadToken(t)).toBe(true)
    }
  })

  it('splitTokens splits on comma / pipe / whitespace', () => {
    expect(splitTokens('a, b|c\td')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('legacyArtifactPattern: ALL → catch-all, EXPLICIT → escaped comma-join', () => {
    expect(legacyArtifactPattern(m({ mode: 'ALL' }), [])).toBe('[\\w-\\.]+')
    expect(legacyArtifactPattern(m({ mode: 'EXPLICIT', tokens: ['foo.bar', 'baz'] }), [])).toBe('foo\\.bar,baz')
  })

  it('legacyArtifactPattern: ALL_EXCEPT prefers server value, else local sibling lookahead', () => {
    const allExcept = m({ id: 'a', mode: 'ALL_EXCEPT_CLAIMED', groups: 'g' })
    const sibling = m({ id: 'b', mode: 'EXPLICIT', groups: 'g', tokens: ['claimed'] })
    expect(legacyArtifactPattern(allExcept, [allExcept, sibling])).toBe('(?!(?:claimed)$)[\\w-\\.]+')
    expect(legacyArtifactPattern({ ...allExcept, legacyArtifactIdPattern: '(?!(?:srv)$)[\\w-\\.]+' }, [allExcept])).toBe(
      '(?!(?:srv)$)[\\w-\\.]+',
    )
  })

  it('groupError flags empty group, bad token, and comma-group ALL_EXCEPT', () => {
    expect(groupError(m({ groups: '' }))).toMatch(/required/)
    expect(groupError(m({ groups: 'a*' }))).toMatch(/Invalid group/)
    expect(groupError(m({ groups: 'a,b', mode: 'ALL_EXCEPT_CLAIMED' }))).toMatch(/single group/)
    expect(groupError(m({ groups: 'a,b', mode: 'ALL' }))).toBe('')
  })

  it('detectIntraComponentConflicts: ANY two mappings sharing a group token in the same range conflict (CRS disjointness, mode-agnostic)', () => {
    // ALL × ALL on the same group.
    expect(detectIntraComponentConflicts([m({ id: 'a', mode: 'ALL' }), m({ id: 'b', mode: 'ALL' })])).toHaveProperty('a')
    // ALL × EXPLICIT on the same group — the previously-missed case; CRS 400s it.
    expect(
      detectIntraComponentConflicts([
        m({ id: 'a', mode: 'ALL' }),
        m({ id: 'b', mode: 'EXPLICIT', tokens: ['x'] }),
      ]),
    ).toHaveProperty('a')
    // EXPLICIT × ALL_EXCEPT_CLAIMED on the same group — intra-component it IS a conflict (disjointness),
    // even though cross-component the catch-all yields. CRS rejects the duplicate group token.
    expect(
      detectIntraComponentConflicts([
        m({ id: 'a', mode: 'EXPLICIT', tokens: ['x'] }),
        m({ id: 'b', mode: 'ALL_EXCEPT_CLAIMED' }),
      ]),
    ).toHaveProperty('a')
    // EXPLICIT × EXPLICIT with DIFFERENT tokens on the same group still conflicts (one group → one mapping).
    expect(
      detectIntraComponentConflicts([
        m({ id: 'a', mode: 'EXPLICIT', tokens: ['x'] }),
        m({ id: 'b', mode: 'EXPLICIT', tokens: ['y'] }),
      ]),
    ).toHaveProperty('a')
    // Same group token in DIFFERENT ranges → no conflict.
    expect(
      detectIntraComponentConflicts([
        m({ id: 'a', mode: 'ALL' }),
        m({ id: 'b', base: false, range: '[1,2)', mode: 'ALL' }),
      ]),
    ).toEqual({})
    // Disjoint group tokens → no conflict.
    expect(
      detectIntraComponentConflicts([m({ id: 'a', groups: 'g1', mode: 'ALL' }), m({ id: 'b', groups: 'g2', mode: 'ALL' })]),
    ).toEqual({})
  })

  it('hasOverlappingOverrides detects overlapping non-base ranges', () => {
    expect(
      hasOverlappingOverrides([
        m({ id: 'a', base: false, range: '[1,3)' }),
        m({ id: 'b', base: false, range: '[2,4)' }),
      ]),
    ).toBe(true)
    expect(
      hasOverlappingOverrides([
        m({ id: 'a', base: false, range: '[1,2)' }),
        m({ id: 'b', base: false, range: '[2,3)' }),
      ]),
    ).toBe(false)
  })

  it('toArtifactIdRequest: base → null range, EXPLICIT carries tokens, ALL drops them', () => {
    expect(toArtifactIdRequest(m({ base: true, groups: ' a , b ', mode: 'EXPLICIT', tokens: ['t'] }))).toEqual({
      versionRange: null,
      groupPattern: 'a,b',
      mode: 'EXPLICIT',
      artifactTokens: ['t'],
    })
    expect(toArtifactIdRequest(m({ base: false, range: '[1,2)', mode: 'ALL', tokens: ['ignored'] }))).toEqual({
      versionRange: '[1,2)',
      groupPattern: 'com.example',
      mode: 'ALL',
      artifactTokens: [],
    })
  })

  it('fromArtifactId: ALL_VERSIONS / null versionRange → base; else override', () => {
    const base: ArtifactId = { id: 's1', versionRange: OWNERSHIP_ALL_VERSIONS, groupPattern: 'g', mode: 'ALL', artifactTokens: [] }
    expect(fromArtifactId(base)).toMatchObject({ serverId: 's1', base: true, range: null, groups: 'g', mode: 'ALL' })
    const over: ArtifactId = { id: 's2', versionRange: '[1,2)', groupPattern: 'g', mode: 'EXPLICIT', artifactTokens: ['x'] }
    expect(fromArtifactId(over)).toMatchObject({ serverId: 's2', base: false, range: '[1,2)', tokens: ['x'] })
  })
})

describe('humanizeOwnership', () => {
  it('reads a base mapping (null range) as "All versions"', () => {
    expect(humanizeOwnership({ groupPattern: 'com.example.foo', mode: 'ALL', versionRange: null })).toBe(
      'All versions · All in group · com.example.foo',
    )
  })

  it('reads the base sentinel range as "All versions"', () => {
    expect(humanizeOwnership({ groupPattern: 'com.example.foo', mode: 'ALL', versionRange: OWNERSHIP_ALL_VERSIONS })).toBe(
      'All versions · All in group · com.example.foo',
    )
  })

  it('lists literal tokens for an EXPLICIT override at a range', () => {
    expect(
      humanizeOwnership({
        groupPattern: 'com.example.foo',
        mode: 'EXPLICIT',
        artifactTokens: ['widget-a', 'widget-b'],
        versionRange: '[1.4,1.5)',
      }),
    ).toBe('[1.4,1.5) · Specific · com.example.foo · widget-a, widget-b')
  })

  it('shows (none) for an EXPLICIT mapping with no tokens', () => {
    expect(humanizeOwnership({ groupPattern: 'com.example.foo', mode: 'EXPLICIT', artifactTokens: [], versionRange: '[1,2)' })).toBe(
      '[1,2) · Specific · com.example.foo · (none)',
    )
  })
})
