import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVcsSection } from './useVcsSection'
import { useDistributionSection } from './useDistributionSection'
import { useJiraSection } from './useJiraSection'
import { useEscrowSection } from './useEscrowSection'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: () => ({ data: undefined, isLoading: false, isError: false }),
}))

function baseRow(over: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null,
    isSyntheticBase: false, build: null, escrow: null, jira: null, vcsEntries: [],
    mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
    ...over,
  }
}

function makeComponent(over: Partial<ComponentDetail> = {}, row: Partial<ComponentConfiguration> = {}): ComponentDetail {
  return {
    id: 'c1', name: 'comp', displayName: null, componentOwner: null, productType: null,
    system: null, clientCode: null, archived: false, solution: false, parentComponentName: null,
    version: 1, createdAt: null, updatedAt: null, labels: [], docs: [], artifactIds: [],
    securityGroups: [], teamcityProjects: [], configurations: [baseRow(row)],
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('useVcsSection', () => {
  it('clean initially; dirty after editing external registry; slice carries it', () => {
    const { result } = renderHook(() => useVcsSection(makeComponent({ vcsExternalRegistry: 'reg' })))
    expect(result.current.slice.isDirty).toBe(false)
    act(() => result.current.setExternalRegistry('reg2'))
    expect(result.current.slice.isDirty).toBe(true)
    expect(result.current.slice.request.vcsExternalRegistry).toBe('reg2')
  })

  // P-1 ""-clear migration: vcsExternalRegistry now clears via '' (CRS-A), not
  // null — the old null-clear was a silent no-op (prep §1.6).
  it("clears the external registry via '' (not null)", () => {
    const { result } = renderHook(() => useVcsSection(makeComponent({ vcsExternalRegistry: 'reg' })))
    act(() => result.current.setExternalRegistry(''))
    expect(result.current.slice.isDirty).toBe(true)
    expect(result.current.slice.request.vcsExternalRegistry).toBe('')
  })

  it('drops blank-vcsPath entries from the slice payload', () => {
    const { result } = renderHook(() => useVcsSection(makeComponent()))
    act(() => result.current.addEntry())
    act(() => result.current.updateEntry(0, 'name', 'has-no-path'))
    expect(result.current.slice.request.baseConfiguration?.vcsEntries).toEqual([])
  })

  // P1-4: dirty must be computed from the CLEANED projection (what diff + request
  // use), not the raw draft. The invariant: dirty ⇔ cleaned payload differs ⇔
  // diff non-empty. A blank/whitespace/path-less row is dropped from the payload,
  // so it must NOT make the bar dirty (else Review opens "0 fields will change").
  it('(a) adding a blank entry row does NOT make the section dirty', () => {
    const { result } = renderHook(() => useVcsSection(makeComponent()))
    act(() => result.current.addEntry())
    expect(result.current.slice.isDirty).toBe(false)
    expect(result.current.slice.diff).toEqual([])
  })

  it('(b) whitespace-only / name-without-vcsPath edits do not count as dirty', () => {
    const { result } = renderHook(() => useVcsSection(makeComponent()))
    act(() => result.current.addEntry())
    act(() => result.current.updateEntry(0, 'name', 'has-no-path'))
    act(() => result.current.updateEntry(0, 'branch', '   ')) // whitespace only
    expect(result.current.slice.isDirty).toBe(false)
    expect(result.current.slice.diff).toEqual([])
  })

  it('(c) a real edit alongside a leftover blank row clears dirty after save (no stuck-dirty)', () => {
    const c1 = makeComponent({ vcsExternalRegistry: 'reg' })
    const { result, rerender } = renderHook(({ c }) => useVcsSection(c), { initialProps: { c: c1 } })
    // Real change + a junk blank row that the payload will drop.
    act(() => result.current.setExternalRegistry('reg2'))
    act(() => result.current.addEntry())
    expect(result.current.slice.isDirty).toBe(true)
    expect(result.current.slice.request.vcsExternalRegistry).toBe('reg2')
    // The save lands: server now reports reg2 (the cleaned payload). The leftover
    // blank row must NOT keep the section stuck dirty.
    rerender({ c: makeComponent({ vcsExternalRegistry: 'reg2', version: 2 }) })
    expect(result.current.slice.isDirty).toBe(false)
  })

  // P1-2: editing ONLY a branch (vcsPath unchanged) must still produce a diff
  // row — the request persists branch/tag/name/etc., so the diff must too
  // (acceptance #6: diff == what's sent). The old vcsPath-only listDiff missed this.
  it('shows a diff row when only a non-path entry field (branch) changes', () => {
    const c = makeComponent({}, {
      vcsEntries: [{ id: 'v1', vcsPath: 'proj/repo', branch: 'master', tag: null, hotfixBranch: null, name: null, repositoryType: null, sortOrder: 0 }],
    })
    const { result } = renderHook(() => useVcsSection(c))
    expect(result.current.slice.isDirty).toBe(false)
    act(() => result.current.updateEntry(0, 'branch', 'develop'))
    expect(result.current.slice.isDirty).toBe(true)
    // The request persists the new branch...
    expect(result.current.slice.request.baseConfiguration?.vcsEntries?.[0]?.branch).toBe('develop')
    // ...and the diff must reflect it (master → develop), not be empty.
    const branchRow = result.current.slice.diff.find((d) => /branch/i.test(d.label))
    expect(branchRow).toBeDefined()
    expect(branchRow).toMatchObject({ oldValue: 'master', newValue: 'develop' })
  })

  // P1-2 (field-level completeness): editing several non-path fields at once
  // must surface a diff row for EACH — none silently persisted.
  it('surfaces a diff row for every changed entry field (tag + repositoryType)', () => {
    const c = makeComponent({}, {
      vcsEntries: [{ id: 'v1', vcsPath: 'proj/repo', branch: 'master', tag: 'v1', hotfixBranch: null, name: null, repositoryType: 'GIT', sortOrder: 0 }],
    })
    const { result } = renderHook(() => useVcsSection(c))
    act(() => result.current.updateEntry(0, 'tag', 'v2'))
    act(() => result.current.updateEntry(0, 'repositoryType', 'HG'))
    expect(result.current.slice.diff.find((d) => /tag/i.test(d.label))).toMatchObject({ oldValue: 'v1', newValue: 'v2' })
    expect(result.current.slice.diff.find((d) => /repository type/i.test(d.label))).toMatchObject({ oldValue: 'GIT', newValue: 'HG' })
  })

  it('does not clobber a dirty section on component re-seed', () => {
    const c1 = makeComponent({ vcsExternalRegistry: 'a' })
    const { result, rerender } = renderHook(({ c }) => useVcsSection(c), { initialProps: { c: c1 } })
    act(() => result.current.setExternalRegistry('edited'))
    rerender({ c: makeComponent({ vcsExternalRegistry: 'b' }) })
    expect(result.current.externalRegistry).toBe('edited')
  })

  // #4: id change → fresh, clean draft even while dirty (no leak).
  it('starts a fresh clean draft on component id change, even while dirty', () => {
    const c1 = makeComponent({ id: 'comp-1', vcsExternalRegistry: 'a' })
    const { result, rerender } = renderHook(({ c }) => useVcsSection(c), { initialProps: { c: c1 } })
    act(() => result.current.setExternalRegistry('edited'))
    rerender({ c: makeComponent({ id: 'comp-2', vcsExternalRegistry: 'b' }) })
    expect(result.current.externalRegistry).toBe('b')
    expect(result.current.slice.isDirty).toBe(false)
  })

  // #3: own save lands (same id, server now matches the draft) → dirty clears.
  it('clears dirty when the saved component arrives matching the draft (own save)', () => {
    const c1 = makeComponent({ id: 'comp-1', vcsExternalRegistry: 'a' })
    const { result, rerender } = renderHook(({ c }) => useVcsSection(c), { initialProps: { c: c1 } })
    act(() => result.current.setExternalRegistry('edited'))
    expect(result.current.slice.isDirty).toBe(true)
    rerender({ c: makeComponent({ id: 'comp-1', version: 2, vcsExternalRegistry: 'edited' }) })
    expect(result.current.slice.isDirty).toBe(false)
  })
})

describe('useDistributionSection', () => {
  it('dirty on toggling explicit; slice carries both flags', () => {
    const { result } = renderHook(() => useDistributionSection(makeComponent({ distributionExplicit: false, distributionExternal: false })))
    act(() => result.current.setExplicit(true))
    expect(result.current.slice.isDirty).toBe(true)
    expect(result.current.slice.request.distributionExplicit).toBe(true)
    expect(result.current.slice.request.distributionExternal).toBe(false)
  })

  it('securityGroups go top-level, not inside baseConfiguration', () => {
    const { result } = renderHook(() => useDistributionSection(makeComponent()))
    act(() => result.current.addSecurityGroup())
    act(() => result.current.updateSecurityGroup(0, 'groupName', 'grp'))
    expect(result.current.slice.request.securityGroups).toEqual([{ groupType: 'read', groupName: 'grp' }])
    expect('securityGroups' in (result.current.slice.request.baseConfiguration ?? {})).toBe(false)
  })

  // P1-2: editing ONLY a maven classifier (group/artifact unchanged) must still
  // produce a diff row — the request persists classifier/extension, so the diff
  // must too. The old key (group:artifact only) missed sub-field edits.
  it('shows a diff row when only a maven classifier changes', () => {
    const c = makeComponent({}, {
      mavenArtifacts: [{ id: 'm1', groupPattern: 'com.acme', artifactPattern: 'lib', extension: 'jar', classifier: '', sortOrder: 0 }],
    })
    const { result } = renderHook(() => useDistributionSection(c))
    expect(result.current.slice.isDirty).toBe(false)
    act(() => result.current.updateMaven(0, 'classifier', 'sources'))
    expect(result.current.slice.isDirty).toBe(true)
    // The request persists the new classifier...
    expect(result.current.slice.request.baseConfiguration?.mavenArtifacts?.[0]?.classifier).toBe('sources')
    // ...and the diff must reflect the maven change, not be empty.
    const mavenRow = result.current.slice.diff.find((d) => /maven/i.test(d.label))
    expect(mavenRow).toBeDefined()
    expect(mavenRow!.newValue).toMatch(/sources/)
  })

  // P1-4: a blank/incomplete distribution row is dropped from the payload, so it
  // must not make the section dirty (dirty ⇔ cleaned payload differs).
  it('(a) adding a blank maven row does NOT make the section dirty', () => {
    const { result } = renderHook(() => useDistributionSection(makeComponent()))
    act(() => result.current.addMaven())
    expect(result.current.slice.isDirty).toBe(false)
    expect(result.current.slice.diff).toEqual([])
  })

  it('(b) a partial maven row (group only, no artifact) is not dirty', () => {
    const { result } = renderHook(() => useDistributionSection(makeComponent()))
    act(() => result.current.addMaven())
    act(() => result.current.updateMaven(0, 'groupPattern', 'com.acme')) // artifact still blank → filtered
    expect(result.current.slice.isDirty).toBe(false)
  })

  // #4: id change → fresh, clean draft even while dirty.
  it('starts a fresh clean draft on component id change, even while dirty', () => {
    const c1 = makeComponent({ id: 'comp-1', distributionExplicit: false })
    const { result, rerender } = renderHook(({ c }) => useDistributionSection(c), { initialProps: { c: c1 } })
    act(() => result.current.setExplicit(true))
    expect(result.current.slice.isDirty).toBe(true)
    rerender({ c: makeComponent({ id: 'comp-2', distributionExplicit: false }) })
    expect(result.current.state.explicit).toBe(false)
    expect(result.current.slice.isDirty).toBe(false)
  })

  // #3: own save lands (same id, server now matches the draft) → dirty clears.
  it('clears dirty when the saved component arrives matching the draft (own save)', () => {
    const c1 = makeComponent({ id: 'comp-1', distributionExplicit: false })
    const { result, rerender } = renderHook(({ c }) => useDistributionSection(c), { initialProps: { c: c1 } })
    act(() => result.current.setExplicit(true))
    expect(result.current.slice.isDirty).toBe(true)
    rerender({ c: makeComponent({ id: 'comp-1', version: 2, distributionExplicit: true }) })
    expect(result.current.slice.isDirty).toBe(false)
  })
})

describe('useJiraSection', () => {
  const vis = { releasesInDefaultBranch: 'editable' as const }

  it('dirty on project key edit; jira nested in baseConfiguration', () => {
    const { result } = renderHook(() => useJiraSection(makeComponent({}, { jira: { projectKey: 'OLD' } }), vis))
    act(() => result.current.set('projectKey', 'NEW'))
    expect(result.current.slice.request.baseConfiguration?.jira?.projectKey).toBe('NEW')
  })

  // ── Line/Minor pair — UI-materialization (Q9 / prep §R6) ─────────────────
  // Mirrored Minor: the leading Line value is written into BOTH line and minor
  // (CRS/releng-lib fallback is the reverse, so the copy must be materialized).
  it('mirrored Minor materializes the leading Line value into BOTH line and minor', () => {
    // Legacy shape: line null, minor set → mirrored, leading = stored minor.
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({}, { jira: { lineVersionFormat: '', minorVersionFormat: '$major.$minor' } }), vis),
    )
    act(() => result.current.set('lineVersionFormat', '$major.$minor.x'))
    const jira = result.current.slice.request.baseConfiguration?.jira
    expect(jira?.lineVersionFormat).toBe('$major.$minor.x')
    expect(jira?.minorVersionFormat).toBe('$major.$minor.x') // materialized copy
  })

  it('separate Minor sends line and minor independently', () => {
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({}, { jira: { lineVersionFormat: 'L', minorVersionFormat: 'M' } }), vis),
    )
    expect(result.current.state.minorSeparate).toBe(true) // both set + differ → separate
    act(() => result.current.set('minorVersionFormat', 'M2'))
    const jira = result.current.slice.request.baseConfiguration?.jira
    expect(jira?.lineVersionFormat).toBe('L')
    expect(jira?.minorVersionFormat).toBe('M2')
  })

  it('promoting Minor to separate seeds from Line, then edits independently', () => {
    const { result } = renderHook(() => useJiraSection(makeComponent({}, { jira: { lineVersionFormat: 'L' } }), vis))
    expect(result.current.state.minorSeparate).toBe(false) // minor null → mirrored
    act(() => result.current.setMinorSeparate(true))
    expect(result.current.state.minorVersionFormat).toBe('L') // seeded from Line
    act(() => result.current.set('minorVersionFormat', 'M2'))
    const jira = result.current.slice.request.baseConfiguration?.jira
    expect(jira?.lineVersionFormat).toBe('L')
    expect(jira?.minorVersionFormat).toBe('M2')
  })

  it('promoting Minor to separate WITHOUT editing is not dirty (same wire value)', () => {
    const { result } = renderHook(() => useJiraSection(makeComponent({}, { jira: { lineVersionFormat: 'L' } }), vis))
    act(() => result.current.setMinorSeparate(true))
    expect(result.current.slice.isDirty).toBe(false)
    expect(result.current.slice.diff).toEqual([])
  })

  it('removing separate Minor resumes materialization (minor = line)', () => {
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({}, { jira: { lineVersionFormat: 'L', minorVersionFormat: 'M' } }), vis),
    )
    act(() => result.current.setMinorSeparate(false))
    const jira = result.current.slice.request.baseConfiguration?.jira
    expect(jira?.lineVersionFormat).toBe('L')
    expect(jira?.minorVersionFormat).toBe('L') // re-materialized from Line
  })

  // ── Release/Build pair — mirrored clears (server fallback), separate = value ─
  it('mirrored Build sends buildVersionFormat "" (CRS falls back to Release)', () => {
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({}, { jira: { releaseVersionFormat: 'R' } }), vis),
    )
    act(() => result.current.set('releaseVersionFormat', 'R2'))
    const jira = result.current.slice.request.baseConfiguration?.jira
    expect(jira?.releaseVersionFormat).toBe('R2')
    expect(jira?.buildVersionFormat).toBe('')
  })

  it('separate Build sends its own value', () => {
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({}, { jira: { releaseVersionFormat: 'R', buildVersionFormat: 'B' } }), vis),
    )
    expect(result.current.state.buildSeparate).toBe(true)
    act(() => result.current.set('buildVersionFormat', 'B2'))
    expect(result.current.slice.request.baseConfiguration?.jira?.buildVersionFormat).toBe('B2')
  })

  it('Remove separate Build clears via "" (CRS-A ""-clear)', () => {
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({}, { jira: { releaseVersionFormat: 'R', buildVersionFormat: 'B' } }), vis),
    )
    act(() => result.current.setBuildSeparate(false))
    expect(result.current.slice.isDirty).toBe(true)
    expect(result.current.slice.request.baseConfiguration?.jira?.buildVersionFormat).toBe('')
  })

  // ── skipCommitCheck (top-level boolean) — send only when toggled ──────────
  it('sends skipCommitCheck only when toggled from the server value', () => {
    const { result } = renderHook(() => useJiraSection(makeComponent({ skipCommitCheck: false }), vis))
    expect('skipCommitCheck' in result.current.slice.request).toBe(false)
    act(() => result.current.set('skipCommitCheck', true))
    expect(result.current.slice.request.skipCommitCheck).toBe(true)
  })

  // ── Payload-gating (P-1 omitNonEditable) ─────────────────────────────────
  it('omits a non-editable jira field from the PATCH slice', () => {
    const isFieldEditable = (p: string) => p !== 'jira.technical'
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({}, { jira: { projectKey: 'P' } }), { ...vis, isFieldEditable }),
    )
    act(() => result.current.set('projectKey', 'P2'))
    const jira = result.current.slice.request.baseConfiguration?.jira
    expect('technical' in (jira ?? {})).toBe(false) // gated out
    expect(jira?.projectKey).toBe('P2') // editable field kept
  })

  // A MIRRORED derived field is gated by its LEADING field's editability (the
  // user edits it via Line/Release) — so a materialized Minor is kept when Line
  // is editable even if the minor path itself is not.
  it('keeps a materialized Minor when Line is editable but the minor path is not', () => {
    const isFieldEditable = (p: string) => p !== 'jira.minorVersionFormat'
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({}, { jira: { lineVersionFormat: 'L' } }), { ...vis, isFieldEditable }),
    )
    act(() => result.current.set('lineVersionFormat', 'L2'))
    const jira = result.current.slice.request.baseConfiguration?.jira
    expect(jira?.lineVersionFormat).toBe('L2')
    expect(jira?.minorVersionFormat).toBe('L2') // materialized, not dropped
  })

  it('omits a SEPARATE Minor gated by its own non-editable path', () => {
    const isFieldEditable = (p: string) => p !== 'jira.minorVersionFormat'
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({}, { jira: { lineVersionFormat: 'L', minorVersionFormat: 'M' } }), { ...vis, isFieldEditable }),
    )
    act(() => result.current.set('minorVersionFormat', 'M2'))
    const jira = result.current.slice.request.baseConfiguration?.jira
    expect('minorVersionFormat' in (jira ?? {})).toBe(false)
  })

  it('does NOT send releasesInDefaultBranch when field is hidden', () => {
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({ releasesInDefaultBranch: false }), { releasesInDefaultBranch: 'hidden' }),
    )
    act(() => result.current.set('releasesInDefaultBranch', true))
    expect('releasesInDefaultBranch' in result.current.slice.request).toBe(false)
  })

  it('sends releasesInDefaultBranch only when changed from server value', () => {
    const { result } = renderHook(() => useJiraSection(makeComponent({ releasesInDefaultBranch: false }), vis))
    expect('releasesInDefaultBranch' in result.current.slice.request).toBe(false)
    act(() => result.current.set('releasesInDefaultBranch', true))
    expect(result.current.slice.request.releasesInDefaultBranch).toBe(true)
  })

  // #4: id change → fresh, clean draft even while dirty.
  it('starts a fresh clean draft on component id change, even while dirty', () => {
    const c1 = makeComponent({ id: 'comp-1' }, { jira: { projectKey: 'OLD' } })
    const { result, rerender } = renderHook(({ c }) => useJiraSection(c, vis), { initialProps: { c: c1 } })
    act(() => result.current.set('projectKey', 'EDITED'))
    expect(result.current.slice.isDirty).toBe(true)
    rerender({ c: makeComponent({ id: 'comp-2' }, { jira: { projectKey: 'NEW' } }) })
    expect(result.current.state.projectKey).toBe('NEW')
    expect(result.current.slice.isDirty).toBe(false)
  })

  // #3: own save lands (same id, server now matches the draft) → dirty clears.
  it('clears dirty when the saved component arrives matching the draft (own save)', () => {
    const c1 = makeComponent({ id: 'comp-1' }, { jira: { projectKey: 'OLD' } })
    const { result, rerender } = renderHook(({ c }) => useJiraSection(c, vis), { initialProps: { c: c1 } })
    act(() => result.current.set('projectKey', 'NEW'))
    expect(result.current.slice.isDirty).toBe(true)
    rerender({ c: makeComponent({ id: 'comp-1', version: 2 }, { jira: { projectKey: 'NEW' } }) })
    expect(result.current.slice.isDirty).toBe(false)
  })

  // P-1 ""-clear migration: jira aspect string scalars clear via '' (CRS-A), and
  // the diff row is no longer flagged as a no-op.
  it("clears a jira aspect scalar via '' and does NOT flag it as a no-op", () => {
    const { result } = renderHook(() =>
      useJiraSection(makeComponent({}, { jira: { releaseVersionFormat: '$major.$minor.$service' } }), vis),
    )
    act(() => result.current.set('releaseVersionFormat', ''))
    expect(result.current.slice.request.baseConfiguration?.jira?.releaseVersionFormat).toBe('')
    const row = result.current.slice.diff.find((d) => /release version format/i.test(d.label))
    expect(row).toBeDefined()
    expect(row?.clearedScalarNoop).toBeFalsy()
  })

  it("clears the jira project key via ''", () => {
    const { result } = renderHook(() => useJiraSection(makeComponent({}, { jira: { projectKey: 'OLD' } }), vis))
    act(() => result.current.set('projectKey', ''))
    expect(result.current.slice.request.baseConfiguration?.jira?.projectKey).toBe('')
  })

  // Top-level component scalars keep their existing null-clear contract.
  it('keeps the top-level hotfix version format on the null-clear contract', () => {
    const { result } = renderHook(() => useJiraSection(makeComponent({ jiraHotfixVersionFormat: 'X' }), vis))
    act(() => result.current.set('hotfixVersionFormat', ''))
    expect(result.current.slice.request.jiraHotfixVersionFormat).toBeNull()
  })
})

describe('useEscrowSection', () => {
  const vis = { productType: 'editable' as const }

  it('dirty on generation edit; escrow nested in baseConfiguration', () => {
    const { result } = renderHook(() => useEscrowSection(makeComponent({}, { escrow: { generation: 'G1' } }), vis))
    act(() => result.current.set('generation', 'G2'))
    expect(result.current.slice.request.baseConfiguration?.escrow?.generation).toBe('G2')
  })

  it('emits build knobs in baseConfiguration.build (disjoint from Build section keys)', () => {
    const { result } = renderHook(() => useEscrowSection(makeComponent({}, { build: { buildSystem: 'GRADLE' } }), vis))
    act(() => result.current.set('buildTasks', 'assemble'))
    const build = result.current.slice.request.baseConfiguration?.build
    expect(build?.buildTasks).toBe('assemble')
    // Escrow must NOT write buildSystem — that's the Build section's key.
    expect('buildSystem' in (build ?? {})).toBe(false)
  })

  it('does NOT send productType when hidden', () => {
    const { result } = renderHook(() =>
      useEscrowSection(makeComponent({ productType: 'TYPE_A' }), { productType: 'hidden' }),
    )
    act(() => result.current.set('generation', 'G2'))
    expect('productType' in result.current.slice.request).toBe(false)
  })

  it('parses requiredTools into a deduped, trimmed array', () => {
    const { result } = renderHook(() => useEscrowSection(makeComponent(), vis))
    act(() => result.current.set('requiredToolsInput', 'a, b , a'))
    expect(result.current.slice.request.baseConfiguration?.requiredTools).toEqual(['a', 'b'])
  })

  // #4: id change → fresh, clean draft even while dirty.
  it('starts a fresh clean draft on component id change, even while dirty', () => {
    const c1 = makeComponent({ id: 'comp-1' }, { escrow: { generation: 'G1' } })
    const { result, rerender } = renderHook(({ c }) => useEscrowSection(c, vis), { initialProps: { c: c1 } })
    act(() => result.current.set('generation', 'EDITED'))
    expect(result.current.slice.isDirty).toBe(true)
    rerender({ c: makeComponent({ id: 'comp-2' }, { escrow: { generation: 'G2' } }) })
    expect(result.current.state.generation).toBe('G2')
    expect(result.current.slice.isDirty).toBe(false)
  })

  // #3: own save lands (same id, server now matches the draft) → dirty clears.
  it('clears dirty when the saved component arrives matching the draft (own save)', () => {
    const c1 = makeComponent({ id: 'comp-1' }, { escrow: { generation: 'G1' } })
    const { result, rerender } = renderHook(({ c }) => useEscrowSection(c, vis), { initialProps: { c: c1 } })
    act(() => result.current.set('generation', 'G2'))
    expect(result.current.slice.isDirty).toBe(true)
    rerender({ c: makeComponent({ id: 'comp-1', version: 2 }, { escrow: { generation: 'G2' } }) })
    expect(result.current.slice.isDirty).toBe(false)
  })

  // P-1 ""-clear migration: escrow aspect string scalars clear via '' (CRS-A).
  it("clears an escrow aspect scalar via '' and does NOT flag it as a no-op", () => {
    const { result } = renderHook(() => useEscrowSection(makeComponent({}, { escrow: { diskSpace: '10GB' } }), vis))
    act(() => result.current.set('diskSpace', ''))
    expect(result.current.slice.request.baseConfiguration?.escrow?.diskSpace).toBe('')
    const row = result.current.slice.diff.find((d) => /disk space/i.test(d.label))
    expect(row?.clearedScalarNoop).toBeFalsy()
  })

  // generation is a validated enum — blank 400s, so it keeps the null-clear no-op.
  it('keeps escrow generation clear as a null no-op (enum exception)', () => {
    const { result } = renderHook(() => useEscrowSection(makeComponent({}, { escrow: { generation: 'AUTO' } }), vis))
    act(() => result.current.set('generation', ''))
    expect(result.current.slice.request.baseConfiguration?.escrow?.generation).toBeNull()
    const row = result.current.slice.diff.find((d) => /generation/i.test(d.label))
    expect(row?.clearedScalarNoop).toBe(true)
  })
})
