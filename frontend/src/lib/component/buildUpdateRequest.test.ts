import { describe, it, expect } from 'vitest'
import { buildUpdateRequest, type FieldVisibilities, type DirtyFlags } from './buildUpdateRequest'
import type { ComponentDetail } from '../types'
import type { GeneralFormValues } from '../../components/editor/GeneralTab'

function makeComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'svc-alpha',
    displayName: 'Service Alpha',
    componentOwner: 'alice',
    productType: 'TYPE_A',
    systems: ['SYS1'],
    clientCode: null,
    archived: false,
    solution: false,
    parentComponentName: null,
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    labels: [],
    docs: [],
    artifactIds: [],
    securityGroups: [],
    teamcityProjects: [],
    configurations: [],
    ...overrides,
  }
}

function makeValues(overrides: Partial<GeneralFormValues> = {}): GeneralFormValues {
  return {
    name: 'svc-alpha',
    displayName: 'Service Alpha',
    componentOwner: 'alice',
    productType: 'TYPE_A',
    system: 'SYS1',
    clientCode: '',
    solution: false,
    archived: false,
    parentComponentName: '',
    groupId: '',
    groupIsFake: false,
    releaseManager: '',
    securityChampion: '',
    copyright: '',
    releasesInDefaultBranch: false,
    labels: '',
    teamcityProjects: [],
    docs: [],
    artifactIds: [],
    ...overrides,
  }
}

const EDITABLE: FieldVisibilities = {
  displayName: 'editable',
  componentOwner: 'editable',
  systems: 'editable',
  clientCode: 'editable',
  groupId: 'editable',
  releaseManager: 'editable',
  securityChampion: 'editable',
  copyright: 'editable',
  releasesInDefaultBranch: 'editable',
  labels: 'editable',
  teamcityProjectId: 'editable',
  teamcityProjectUrl: 'editable',
}

const NO_DIRTY: DirtyFlags = {}

describe('buildUpdateRequest — contract baseline', () => {
  it('untouched form on an empty component emits clearGroup:false + version + omits volatile fields', () => {
    const req = buildUpdateRequest({
      component: makeComponent(),
      values: makeValues(),
      visibilities: EDITABLE,
      dirtyFields: NO_DIRTY,
    })
    expect(req.version).toBe(1)
    expect(req.clearGroup).toBe(false)
    // dirtyFields untouched → solution, releasesInDefaultBranch, archived, name omitted
    expect(req.solution).toBeUndefined()
    expect(req.releasesInDefaultBranch).toBeUndefined()
    expect(req.archived).toBeUndefined()
    expect(req.name).toBeUndefined()
    // No prior lists → no list patches
    expect(req.teamcityProjects).toBeUndefined()
    expect(req.docs).toBeUndefined()
    expect(req.artifactIds).toBeUndefined()
    expect(req.group).toBeUndefined()
  })
})

describe('buildUpdateRequest — field-config hidden visibility', () => {
  it('hidden displayName + componentOwner + systems + clientCode + labels → fields omitted', () => {
    const req = buildUpdateRequest({
      component: makeComponent(),
      values: makeValues({ displayName: 'X', componentOwner: 'Y', system: 'A,B', clientCode: 'C', labels: 'x,y' }),
      visibilities: {
        ...EDITABLE,
        displayName: 'hidden',
        componentOwner: 'hidden',
        systems: 'hidden',
        clientCode: 'hidden',
        labels: 'hidden',
      },
      dirtyFields: NO_DIRTY,
    })
    expect(req.displayName).toBeUndefined()
    expect(req.componentOwner).toBeUndefined()
    expect(req.systems).toBeUndefined()
    expect(req.clientCode).toBeUndefined()
    expect(req.labels).toBeUndefined()
  })

  it('hidden TC visibility skips the teamcityProjects patch even with dirty + prior data', () => {
    const req = buildUpdateRequest({
      component: makeComponent({
        teamcityProjects: [{ id: 'tc-1', projectId: 'P1', projectUrl: 'http://x/P1', sortOrder: 0 }],
      }),
      values: makeValues({ teamcityProjects: [] }),
      visibilities: { ...EDITABLE, teamcityProjectId: 'hidden' },
      dirtyFields: { teamcityProjects: true },
    })
    expect(req.teamcityProjects).toBeUndefined()
  })

  it('hidden groupId visibility skips both group set and clearGroup-true', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ group: { groupKey: 'G1', isFake: false, role: 'MEMBER' } }),
      values: makeValues({ groupId: '' }),
      visibilities: { ...EDITABLE, groupId: 'hidden' },
      dirtyFields: { groupId: true },
    })
    expect(req.clearGroup).toBe(false)
    expect(req.group).toBeUndefined()
  })
})

describe('buildUpdateRequest — dirtyFields gating (pre-hydration safety)', () => {
  it('solution form-default false on server-null component is omitted when not dirty', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ solution: null }),
      values: makeValues({ solution: false }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    expect(req.solution).toBeUndefined()
  })

  it('solution form value true with dirtyFields.solution=true is forwarded', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ solution: null }),
      values: makeValues({ solution: true }),
      visibilities: EDITABLE,
      dirtyFields: { solution: true },
    })
    expect(req.solution).toBe(true)
  })

  it('empty teamcityProjects + had prior + not dirty → omits (pre-hydration guard)', () => {
    const req = buildUpdateRequest({
      component: makeComponent({
        teamcityProjects: [{ id: 'tc-1', projectId: 'P1', projectUrl: 'http://x/P1', sortOrder: 0 }],
      }),
      values: makeValues({ teamcityProjects: [] }),
      visibilities: EDITABLE,
      dirtyFields: { teamcityProjects: false },
    })
    expect(req.teamcityProjects).toBeUndefined()
  })

  it('empty teamcityProjects + had prior + dirty → emits explicit clear ([])', () => {
    const req = buildUpdateRequest({
      component: makeComponent({
        teamcityProjects: [{ id: 'tc-1', projectId: 'P1', projectUrl: 'http://x/P1', sortOrder: 0 }],
      }),
      values: makeValues({ teamcityProjects: [] }),
      visibilities: EDITABLE,
      dirtyFields: { teamcityProjects: true },
    })
    expect(req.teamcityProjects).toEqual([])
  })

  it('systems form-default empty + had prior + NOT dirty → omits (pre-hydration guard)', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ systems: ['SYS1', 'SYS2'] }),
      values: makeValues({ system: '' }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    expect(req.systems).toBeUndefined()
  })

  it('systems populated + dirty → forwards parsed array', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ systems: ['OLD'] }),
      values: makeValues({ system: 'SYS1, SYS2' }),
      visibilities: EDITABLE,
      dirtyFields: { system: true },
    })
    expect(req.systems).toEqual(['SYS1', 'SYS2'])
  })

  it('empty docs + had prior + not dirty → omits; same for artifactIds', () => {
    const req = buildUpdateRequest({
      component: makeComponent({
        docs: [{ id: 'd-1', docComponentKey: 'docs-a', majorVersion: '1.x', sortOrder: 0 }],
        artifactIds: [{ id: 'a-1', groupPattern: 'org.x', artifactPattern: 'my-*' }],
      }),
      values: makeValues({ docs: [], artifactIds: [] }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    expect(req.docs).toBeUndefined()
    expect(req.artifactIds).toBeUndefined()
  })

  it('empty docs + had prior + dirty → emits []; same for artifactIds', () => {
    const req = buildUpdateRequest({
      component: makeComponent({
        docs: [{ id: 'd-1', docComponentKey: 'docs-a', majorVersion: '1.x', sortOrder: 0 }],
        artifactIds: [{ id: 'a-1', groupPattern: 'org.x', artifactPattern: 'my-*' }],
      }),
      values: makeValues({ docs: [], artifactIds: [] }),
      visibilities: EDITABLE,
      dirtyFields: { docs: true, artifactIds: true },
    })
    expect(req.docs).toEqual([])
    expect(req.artifactIds).toEqual([])
  })
})

describe('buildUpdateRequest — clearGroup', () => {
  it('blank groupId + dirty + prior group → clearGroup=true wins over default false', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ group: { groupKey: 'G1', isFake: false, role: 'MEMBER' } }),
      values: makeValues({ groupId: '' }),
      visibilities: EDITABLE,
      dirtyFields: { groupId: true },
    })
    expect(req.clearGroup).toBe(true)
    expect(req.group).toBeUndefined()
  })

  it('blank groupId + dirty + NO prior group → omits clearGroup (falls back to false default)', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ group: null }),
      values: makeValues({ groupId: '' }),
      visibilities: EDITABLE,
      dirtyFields: { groupId: true },
    })
    expect(req.clearGroup).toBe(false)
  })

  it('populated groupId + isFake=true → group object set, clearGroup stays default false', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ group: null }),
      values: makeValues({ groupId: 'my-group', groupIsFake: true }),
      visibilities: EDITABLE,
      dirtyFields: { groupId: true },
    })
    expect(req.group).toEqual({ groupKey: 'my-group', isFake: true })
    expect(req.clearGroup).toBe(false)
  })
})

describe('buildUpdateRequest — list cleanup', () => {
  it('teamcityProjects rows with blank projectId are dropped; whitespace trimmed', () => {
    const req = buildUpdateRequest({
      component: makeComponent(),
      values: makeValues({
        teamcityProjects: [
          { projectId: '  P1  ' },
          { projectId: '   ' },
          { projectId: 'P2' },
        ],
      }),
      visibilities: EDITABLE,
      dirtyFields: { teamcityProjects: true },
    })
    expect(req.teamcityProjects).toEqual([{ projectId: 'P1' }, { projectId: 'P2' }])
  })

  it('docs rows with blank docComponentKey are dropped; majorVersion blank → null', () => {
    const req = buildUpdateRequest({
      component: makeComponent(),
      values: makeValues({
        docs: [
          { docComponentKey: '  docs-a  ', majorVersion: '  ' },
          { docComponentKey: '', majorVersion: '1.x' },
          { docComponentKey: 'docs-b', majorVersion: '2.x' },
        ],
      }),
      visibilities: EDITABLE,
      dirtyFields: { docs: true },
    })
    expect(req.docs).toEqual([
      { docComponentKey: 'docs-a', majorVersion: null },
      { docComponentKey: 'docs-b', majorVersion: '2.x' },
    ])
  })

  it('artifactIds rows with either pattern blank are dropped (both required)', () => {
    const req = buildUpdateRequest({
      component: makeComponent(),
      values: makeValues({
        artifactIds: [
          { groupPattern: 'org.x', artifactPattern: '' },
          { groupPattern: '', artifactPattern: 'my-*' },
          { groupPattern: '  org.y  ', artifactPattern: '  svc-*  ' },
        ],
      }),
      visibilities: EDITABLE,
      dirtyFields: { artifactIds: true },
    })
    expect(req.artifactIds).toEqual([{ groupPattern: 'org.y', artifactPattern: 'svc-*' }])
  })
})

describe('buildUpdateRequest — name / parentComponentName', () => {
  it('unchanged name → omitted; renamed → trimmed value sent', () => {
    const req1 = buildUpdateRequest({
      component: makeComponent({ name: 'svc-alpha' }),
      values: makeValues({ name: 'svc-alpha' }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    expect(req1.name).toBeUndefined()
    const req2 = buildUpdateRequest({
      component: makeComponent({ name: 'svc-alpha' }),
      values: makeValues({ name: '  svc-beta  ' }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    expect(req2.name).toBe('svc-beta')
  })

  it('parentComponentName: unchanged → undefined, blank → null, set → value', () => {
    const stored = makeComponent({ parentComponentName: 'parent' })
    expect(
      buildUpdateRequest({
        component: stored,
        values: makeValues({ parentComponentName: 'parent' }),
        visibilities: EDITABLE,
        dirtyFields: {},
      }).parentComponentName,
    ).toBeUndefined()
    expect(
      buildUpdateRequest({
        component: stored,
        values: makeValues({ parentComponentName: '' }),
        visibilities: EDITABLE,
        dirtyFields: {},
      }).parentComponentName,
    ).toBeNull()
    expect(
      buildUpdateRequest({
        component: stored,
        values: makeValues({ parentComponentName: 'new-parent' }),
        visibilities: EDITABLE,
        dirtyFields: {},
      }).parentComponentName,
    ).toBe('new-parent')
  })
})

describe('buildUpdateRequest — labels dedup + scalar omit semantics', () => {
  it('blank labels → undefined (don\'t touch), not [] (which would clear)', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ labels: ['existing'] }),
      values: makeValues({ labels: '' }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    expect(req.labels).toBeUndefined()
  })

  it('duplicate labels are deduped + trimmed', () => {
    const req = buildUpdateRequest({
      component: makeComponent(),
      values: makeValues({ labels: ' a , b , a , c , c ' }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    expect(req.labels).toEqual(['a', 'b', 'c'])
  })
})
