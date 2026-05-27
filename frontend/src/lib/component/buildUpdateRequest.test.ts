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
    system: 'SYS1',
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
    // system: scalar string both in the form and on the wire (CRS PR #301
    // collapsed Component.systems Set<String> → Component.system String?).
    // labels stays string[] (multi-value via chips UX).
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
    labels: [],
    teamcityProjects: [],
    docs: [],
    artifactIds: [],
    ...overrides,
  }
}

const EDITABLE: FieldVisibilities = {
  displayName: 'editable',
  componentOwner: 'editable',
  system: 'editable',
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
      values: makeValues({
        displayName: 'X',
        componentOwner: 'Y',
        system: 'A',
        clientCode: 'C',
        labels: ['x', 'y'],
      }),
      visibilities: {
        ...EDITABLE,
        displayName: 'hidden',
        componentOwner: 'hidden',
        system: 'hidden',
        clientCode: 'hidden',
        labels: 'hidden',
      },
      dirtyFields: { system: true, labels: true },
    })
    expect(req.displayName).toBeUndefined()
    expect(req.componentOwner).toBeUndefined()
    expect(req.system).toBeUndefined()
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
      component: makeComponent({ group: { groupKey: 'org.example.legacy', isFake: false, role: 'MEMBER' } }),
      values: makeValues({ groupId: '' }),
      visibilities: { ...EDITABLE, groupId: 'hidden' },
      dirtyFields: { groupId: true },
    })
    // ui-swift-sloth §3.5: clearGroup is required-in-schema, always emitted
    // as `false`; the UI never emits `true` after the group-mandatory pivot.
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
    // Form default is `system: ''` (task #14 single-select). Without the
    // dirty-gate a pre-hydration Save would emit `system: null` and wipe the
    // server's list.
    const req = buildUpdateRequest({
      component: makeComponent({ system: 'SYS1' }),
      values: makeValues({ system: '' }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    expect(req.system).toBeUndefined()
  })

  it('systems dirty + empty string → omits (would otherwise send [] which CRS rejects)', () => {
    // The page-level save guard ALSO blocks this case with an inline error;
    // buildUpdateRequest is the belt-and-braces (omit on dirty-empty so a
    // bypassed guard still doesn't 400 the server).
    const req = buildUpdateRequest({
      component: makeComponent({ system: 'SYS1' }),
      values: makeValues({ system: '' }),
      visibilities: EDITABLE,
      dirtyFields: { system: true },
    })
    expect(req.system).toBeUndefined()
  })

  it('system populated + dirty → forwards scalar string on the wire (CRS #301)', () => {
    // CRS PR #301 collapsed Component.systems Set<String> → Component.system
    // String?. The wire shape matches the form shape (scalar string), so
    // buildUpdateRequest just forwards the value — no array wrap.
    const req = buildUpdateRequest({
      component: makeComponent({ system: 'OLD' }),
      values: makeValues({ system: 'SYS1' }),
      visibilities: EDITABLE,
      dirtyFields: { system: true },
    })
    expect(req.system).toBe('SYS1')
  })

  it('systems dirty + whitespace-only value → omits (defensive trim, task #14)', () => {
    // The single-select dropdown doesn't allow whitespace-only values, but
    // a paste-restore round-trip or a stale form snapshot could produce one.
    // Trim it away → effectively empty → omit (page guard blocks the save).
    const req = buildUpdateRequest({
      component: makeComponent({ system: 'SYS1' }),
      values: makeValues({ system: '   ' }),
      visibilities: EDITABLE,
      dirtyFields: { system: true },
    })
    expect(req.system).toBeUndefined()
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

describe('buildUpdateRequest — group patch (ui-swift-sloth §3.5)', () => {
  // The group field is now mandatory server-side; the UI MUST NOT emit
  // `clearGroup: true` — that would 400 every time. The render-side guard
  // (required marker + inline error) blocks the empty-save path, but
  // buildUpdateRequest also defensively omits the group key on blank input.

  it('blank groupId + dirty + prior group → omits group key, clearGroup stays false', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ group: { groupKey: 'org.example.legacy', isFake: false, role: 'MEMBER' } }),
      values: makeValues({ groupId: '' }),
      visibilities: EDITABLE,
      dirtyFields: { groupId: true },
    })
    expect(req.clearGroup).toBe(false)
    expect(req.group).toBeUndefined()
  })

  it('blank groupId + dirty + NO prior group → omits group key, clearGroup stays false', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ group: null }),
      values: makeValues({ groupId: '' }),
      visibilities: EDITABLE,
      dirtyFields: { groupId: true },
    })
    expect(req.clearGroup).toBe(false)
    expect(req.group).toBeUndefined()
  })

  it('populated groupId + dirty → emits group object, clearGroup stays false', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ group: null }),
      values: makeValues({ groupId: 'org.example.alpha', groupIsFake: false }),
      visibilities: EDITABLE,
      dirtyFields: { groupId: true },
    })
    expect(req.group).toEqual({ groupKey: 'org.example.alpha', isFake: false })
    expect(req.clearGroup).toBe(false)
  })

  it('populated groupId + isFake=true → group object set with isFake', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ group: null }),
      values: makeValues({ groupId: 'org.example.synthetic', groupIsFake: true }),
      visibilities: EDITABLE,
      dirtyFields: { groupId: true },
    })
    expect(req.group).toEqual({ groupKey: 'org.example.synthetic', isFake: true })
    expect(req.clearGroup).toBe(false)
  })

  it('populated groupId + clean (matches existing) → omits group key', () => {
    const req = buildUpdateRequest({
      component: makeComponent({
        group: { groupKey: 'org.example.alpha', isFake: false, role: 'MEMBER' },
      }),
      values: makeValues({ groupId: 'org.example.alpha', groupIsFake: false }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    // clean-match short-circuit: no group key on the wire when the value
    // hasn't actually changed.
    expect(req.group).toBeUndefined()
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

describe('buildUpdateRequest — labels + systems dirty-gate matrix (ui-swift-sloth §4)', () => {
  // After the multi-select swap labels mirrors systems' contract: the form
  // mounts with `labels: []`, so emitting `labels: []` on every save would
  // wipe server data before the hydration useEffect runs. A dirtyFields
  // gate (identical to systems) blocks the pre-hydration clobber and the
  // dirty-but-empty case.

  it('(labels-a) form mounts with labels: [], untouched, save → labels omitted', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ labels: ['backend', 'internal'] }),
      values: makeValues({ labels: [] }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    expect(req.labels).toBeUndefined()
  })

  it('(labels-b) user toggles ALL labels off → dirty + empty → labels:[] (explicit clear, PR #44 P2 fix)', () => {
    // Labels is OPTIONAL server-side (unlike systems which is required), so
    // "clear all" is a valid user intent. The previous version silently
    // dropped this case, producing the success-toast-but-server-unchanged
    // bug. The dirty-gate still guards against the pre-hydration clobber
    // (no-dirty + empty → omit), but dirty + empty now emits [] explicitly.
    //
    // PR #44 follow-up note: ComponentDetailPage.handleSave SYNTHESISES
    // `dirtyFields.labels: true` for this case via the touched-gate +
    // server-vs-form value-compare (RHF's own dirtyFields stays false
    // when setValue('labels', []) hits the form-default []). This test
    // pins buildUpdateRequest's half of the contract: given dirty:true +
    // empty array, emit `labels: []` regardless of how the caller arrived
    // at the dirty flag.
    const req = buildUpdateRequest({
      component: makeComponent({ labels: ['backend'] }),
      values: makeValues({ labels: [] }),
      visibilities: EDITABLE,
      dirtyFields: { labels: true },
    })
    expect(req.labels).toEqual([])
  })

  it('(labels-c) user adds a label → dirty + non-empty → array forwarded', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ labels: [] }),
      values: makeValues({ labels: ['backend'] }),
      visibilities: EDITABLE,
      dirtyFields: { labels: true },
    })
    expect(req.labels).toEqual(['backend'])
  })

  it('(systems-a) form mounts with system: \'\', untouched, save → systems omitted', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ system: 'SYS1' }),
      values: makeValues({ system: '' }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    expect(req.system).toBeUndefined()
  })

  it('(systems-b) user clears the system → dirty + empty → systems omitted (page guard blocks)', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ system: 'SYS1' }),
      values: makeValues({ system: '' }),
      visibilities: EDITABLE,
      dirtyFields: { system: true },
    })
    expect(req.system).toBeUndefined()
  })

  it('(system-c) user picks a system → dirty + non-empty → scalar on the wire (CRS #301)', () => {
    const req = buildUpdateRequest({
      component: makeComponent({ system: null }),
      values: makeValues({ system: 'SYS1' }),
      visibilities: EDITABLE,
      dirtyFields: { system: true },
    })
    expect(req.system).toBe('SYS1')
  })

  it('non-empty labels untouched (clean) → omitted', () => {
    // Symmetry with systems: not-dirty + non-empty also omits, because the
    // pre-hydration form-default of [] would otherwise leak. The hydration
    // useEffect populates labels from the server side before any real edit,
    // so a real "user added labels" save always sets dirty.
    const req = buildUpdateRequest({
      component: makeComponent({ labels: ['backend'] }),
      values: makeValues({ labels: ['backend'] }),
      visibilities: EDITABLE,
      dirtyFields: {},
    })
    expect(req.labels).toBeUndefined()
  })
})

describe('buildUpdateRequest — clearGroup invariant (ui-swift-sloth §3.5)', () => {
  // Hard guarantee: no UI path emits `clearGroup: true`. The wire contract
  // still requires the field, so it stays present but is always `false`.
  // We materialise a handful of representative request shapes and assert
  // the invariant — a regression here would 400 every save with a
  // group-mandatory server.
  const fixtures = [
    {
      name: 'untouched form',
      req: () =>
        buildUpdateRequest({
          component: makeComponent(),
          values: makeValues(),
          visibilities: EDITABLE,
          dirtyFields: {},
        }),
    },
    {
      name: 'group set + dirty',
      req: () =>
        buildUpdateRequest({
          component: makeComponent({ group: null }),
          values: makeValues({ groupId: 'org.example.alpha' }),
          visibilities: EDITABLE,
          dirtyFields: { groupId: true },
        }),
    },
    {
      name: 'group cleared + dirty + prior group present',
      req: () =>
        buildUpdateRequest({
          component: makeComponent({ group: { groupKey: 'org.example.legacy', isFake: false, role: 'MEMBER' } }),
          values: makeValues({ groupId: '' }),
          visibilities: EDITABLE,
          dirtyFields: { groupId: true },
        }),
    },
    {
      name: 'group hidden via field-config',
      req: () =>
        buildUpdateRequest({
          component: makeComponent({ group: { groupKey: 'org.example.legacy', isFake: false, role: 'MEMBER' } }),
          values: makeValues({ groupId: '' }),
          visibilities: { ...EDITABLE, groupId: 'hidden' },
          dirtyFields: { groupId: true },
        }),
    },
  ]
  for (const fixture of fixtures) {
    it(`never emits clearGroup:true — ${fixture.name}`, () => {
      const req = fixture.req()
      expect(req.clearGroup).toBe(false)
    })
  }
})
