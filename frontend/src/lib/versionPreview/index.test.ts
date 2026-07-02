import { describe, it, expect } from 'vitest'
import {
  parseVersion,
  expandFormat,
  wrapJira,
  computeLadder,
  isHotfixEnabled,
  type LadderState,
} from './index'
import type { ComponentConfiguration, ComponentDetail } from '../types'

describe('parseVersion', () => {
  it('splits on non-digit runs into positional parts', () => {
    expect(parseVersion('2.15.1505.147-1128')).toEqual({
      major: '2', minor: '15', service: '1505', fix: '147', build: '1128',
    })
  })

  it('fills missing trailing segments with 0', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: '1', minor: '2', service: '3', fix: '0', build: '0' })
    expect(parseVersion('1.2')).toEqual({ major: '1', minor: '2', service: '0', fix: '0', build: '0' })
  })

  it('treats a trailing hotfix segment as the fix position (different arity)', () => {
    expect(parseVersion('1.2.3-187')).toEqual({ major: '1', minor: '2', service: '3', fix: '187', build: '0' })
  })

  it('ignores leading non-digits and blank input', () => {
    expect(parseVersion('v1.2')).toEqual({ major: '1', minor: '2', service: '0', fix: '0', build: '0' })
    expect(parseVersion('')).toEqual({ major: '0', minor: '0', service: '0', fix: '0', build: '0' })
    expect(parseVersion('none')).toEqual({ major: '0', minor: '0', service: '0', fix: '0', build: '0' })
  })
})

describe('expandFormat', () => {
  const parts = parseVersion('2.15.1505.147-1128')

  it('replaces the five numeric variables', () => {
    expect(expandFormat('$major.$minor.$service', parts)).toBe('2.15.1505')
    expect(expandFormat('$major.$minor.$service.$fix', parts)).toBe('2.15.1505.147')
    expect(expandFormat('$major.$minor', parts)).toBe('2.15')
  })

  it('does not corrupt server-computed variables sharing a prefix ($minorC, $serviceC)', () => {
    // $minor must not match inside $minorC; $service must not match inside $serviceCBranch.
    expect(expandFormat('$minorC', parts)).toBe('$minorC')
    expect(expandFormat('$serviceCBranch', parts)).toBe('$serviceCBranch')
    expect(expandFormat('$major.$minorC', parts)).toBe('2.$minorC')
  })
})

describe('wrapJira', () => {
  const parts = parseVersion('2.15.1505.147-1128')
  const fmt = '$versionPrefix-$baseVersionFormat'

  it('wraps a base value with the prefix via the version format (prep §1.5 example)', () => {
    expect(wrapJira(expandFormat('$major.$minor.$service', parts), 'testcomponent', fmt)).toBe('testcomponent-2.15.1505')
    expect(wrapJira(expandFormat('$major.$minor', parts), 'testcomponent', fmt)).toBe('testcomponent-2.15')
  })

  it('returns the base unchanged when the prefix is blank', () => {
    expect(wrapJira('2.15.1505', '', fmt)).toBe('2.15.1505')
    expect(wrapJira('2.15.1505', '   ', fmt)).toBe('2.15.1505')
  })

  it('falls back to the canonical version format when none is supplied', () => {
    expect(wrapJira('1.2', 'pgw', '')).toBe('pgw-1.2')
  })
})

describe('computeLadder — brief §4 ladder example (1.2.3 / pgw / hotfix 1.2.3-187)', () => {
  const state: LadderState = {
    sample: '1.2.3',
    hotfixSample: '1.2.3-187',
    versionPrefix: 'pgw',
    versionFormat: '$versionPrefix-$baseVersionFormat',
    releaseVersionFormat: '$major.$minor.$service',
    minorVersionFormat: '', // collapsed → mirrors line
    lineVersionFormat: '$major.$minor',
    buildVersionFormat: '', // collapsed → mirrors release
    hotfixVersionFormat: '$major.$minor.$service-$fix',
    hotfixEnabled: true,
    technical: false,
  }

  function row(id: string) {
    return computeLadder(state).find((r) => r.id === id)!
  }

  it('Release is wrapped with the prefix and tracks the Fix Version/s field', () => {
    expect(row('release')).toMatchObject({ value: 'pgw-1.2.3', approx: false, fieldId: 'jira.releaseVersionFormat' })
    expect(row('release').dest).toMatch(/fix version/i)
  })

  it('RC is the wrapped release plus _RC', () => {
    expect(row('rc').value).toBe('pgw-1.2.3_RC')
  })

  it('Minor is wrapped and mirrors the line format (tag shown)', () => {
    expect(row('minor')).toMatchObject({ value: 'pgw-1.2', approx: false })
    expect(row('minor').tag).toMatch(/line format/i)
  })

  it('Line is BARE (no prefix)', () => {
    expect(row('line')).toMatchObject({ value: '1.2', approx: false, fieldId: 'jira.lineVersionFormat' })
    expect(row('line').tag).toBeUndefined()
  })

  it('Build is BARE and mirrors the release format (tag shown)', () => {
    expect(row('build')).toMatchObject({ value: '1.2.3', approx: false })
    expect(row('build').tag).toMatch(/release format/i)
  })

  it('Hotfix has two rows computed from the hotfix sample: bare build + wrapped Jira', () => {
    expect(row('hotfix-build')).toMatchObject({ value: '1.2.3-187', approx: true })
    expect(row('hotfix-jira')).toMatchObject({ value: 'pgw-1.2.3-187', approx: true })
  })

  it('produces exactly the seven rows in ladder order', () => {
    expect(computeLadder(state).map((r) => r.id)).toEqual([
      'release', 'rc', 'minor', 'line', 'build', 'hotfix-build', 'hotfix-jira',
    ])
  })
})

describe('computeLadder — variations', () => {
  const base: LadderState = {
    sample: '1.2.3',
    hotfixSample: '1.2.3-187',
    versionPrefix: 'pgw',
    versionFormat: '$versionPrefix-$baseVersionFormat',
    releaseVersionFormat: '$major.$minor.$service',
    minorVersionFormat: '',
    lineVersionFormat: '$major.$minor',
    buildVersionFormat: '',
    hotfixVersionFormat: '$major.$minor.$service-$fix',
    hotfixEnabled: true,
    technical: false,
  }
  const get = (s: LadderState, id: string) => computeLadder(s).find((r) => r.id === id)

  it('omits hotfix rows when hotfixes are disabled', () => {
    const s = { ...base, hotfixEnabled: false }
    expect(get(s, 'hotfix-build')).toBeUndefined()
    expect(get(s, 'hotfix-jira')).toBeUndefined()
    expect(computeLadder(s).map((x) => x.id)).toEqual(['release', 'rc', 'minor', 'line', 'build'])
  })

  it('empty prefix collapses Jira wrapping to the bare value', () => {
    const s = { ...base, versionPrefix: '' }
    expect(get(s, 'release')!.value).toBe('1.2.3')
    expect(get(s, 'minor')!.value).toBe('1.2')
    expect(get(s, 'hotfix-jira')!.value).toBe('1.2.3-187')
  })

  it('a separate minor format overrides the line mirror (no tag)', () => {
    const minor = get({ ...base, minorVersionFormat: '$major' }, 'minor')!
    expect(minor.value).toBe('pgw-1')
    expect(minor.tag).toBeUndefined()
    expect(minor.fieldId).toBe('jira.minorVersionFormat')
  })

  it('a separate build format overrides the release mirror (no tag)', () => {
    const build = get({ ...base, buildVersionFormat: '$major.$minor.$service.$fix' }, 'build')!
    expect(build.value).toBe('1.2.3.0')
    expect(build.tag).toBeUndefined()
    expect(build.approx).toBe(true) // template references $fix
  })

  it('missing sample segments render as 0', () => {
    expect(get({ ...base, sample: '1.2' }, 'release')!.value).toBe('pgw-1.2.0')
  })

  it('technical switches the Release destination caption', () => {
    expect(get({ ...base, technical: true }, 'release')!.dest).toMatch(/subcomponent fix version/i)
  })
})

describe('isHotfixEnabled', () => {
  function makeComponent(rows: Partial<ComponentConfiguration>[]): ComponentDetail {
    return {
      id: 'c', name: 'c', displayName: null, componentOwner: null, productType: null,
      system: null, clientCode: null, archived: false, solution: false, parentComponentName: null,
      version: 1, createdAt: null, updatedAt: null, labels: [], docs: [], artifactIds: [],
      securityGroups: [], teamcityProjects: [],
      configurations: rows.map((r, i) => ({
        id: `cfg-${i}`, versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null,
        isSyntheticBase: false, build: null, escrow: null, jira: null, vcsEntries: [],
        mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
        ...r,
      })),
    }
  }
  const entry = (hotfixBranch: string | null) => ({
    id: 'v', vcsPath: 'proj/repo', name: null, branch: null, tag: null, hotfixBranch, repositoryType: null, sortOrder: 0,
  })

  it('is true when any VCS entry has a non-blank hotfixBranch', () => {
    expect(isHotfixEnabled(makeComponent([{ vcsEntries: [entry('hotfix/$major.$minor')] }]))).toBe(true)
  })

  it('is false when no VCS entry defines a hotfix branch', () => {
    expect(isHotfixEnabled(makeComponent([{ vcsEntries: [entry(null), entry('  ')] }]))).toBe(false)
    expect(isHotfixEnabled(makeComponent([{ vcsEntries: [] }]))).toBe(false)
  })

  it('detects a hotfix branch on any configuration row (not only BASE)', () => {
    expect(
      isHotfixEnabled(
        makeComponent([
          { rowType: 'BASE', vcsEntries: [entry(null)] },
          { rowType: 'MARKER', vcsEntries: [entry('hotfix/x')] },
        ]),
      ),
    ).toBe(true)
  })
})
