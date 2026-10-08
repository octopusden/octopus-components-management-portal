import { describe, it, expect } from 'vitest'
import {
  componentKeyCharsetError,
  renameKeyCharsetError,
  initialValues,
  makeCreateSchema,
  type ComponentDefaults,
} from './createFormModel'
import type { CreateFormValues } from './buildCreateRequest'
import type { ComponentConfiguration, ComponentDetail } from '../types'
import type { ComponentProfile, ProfileFieldRule } from '../../hooks/useComponentProfiles'
import shipped from '../../test-fixtures/component-profiles.contract.json'

function makeBaseRow(overrides: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-base',
    versionRange: '(,0),[0,)',
    rowType: 'BASE',
    overriddenAttribute: null,
    isSyntheticBase: false,
    build: { buildSystem: 'GRADLE' },
    escrow: null,
    jira: null,
    vcsEntries: [],
    mavenArtifacts: [],
    fileUrlArtifacts: [],
    dockerImages: [],
    packages: [],
    requiredTools: [],
    ...overrides,
  }
}

function makeSource(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'svc-alpha',
    displayName: 'Service Alpha',
    componentOwner: 'alice',
    productType: null,
    systems: [],
    clientCode: null,
    archived: false,
    solution: null,
    parentComponentName: null,
    version: 1,
    createdAt: null,
    updatedAt: null,
    labels: [],
    docs: [],
    artifactIds: [],
    securityGroups: [],
    teamcityProjects: [],
    releaseManager: [],
    securityChampion: [],
    distributionExplicit: false,
    distributionExternal: true,
    configurations: [makeBaseRow()],
    ...overrides,
  }
}

describe('initialValues — escrow generation', () => {
  it('scratch: seeds escrowGeneration from the component-defaults escrow.generation', () => {
    const defaults: ComponentDefaults = { escrow: { generation: 'AUTO' } }
    expect(initialValues(null, defaults).escrowGeneration).toBe('AUTO')
  })

  it('scratch: escrowGeneration is empty when no default is configured', () => {
    expect(initialValues(null, {}).escrowGeneration).toBe('')
  })

  it('scratch: a blank default escrow.generation becomes empty', () => {
    const defaults: ComponentDefaults = { escrow: { generation: '   ' } }
    expect(initialValues(null, defaults).escrowGeneration).toBe('')
  })

  it('clone: seeds escrowGeneration from the source base-row escrow.generation', () => {
    const source = makeSource({
      configurations: [makeBaseRow({ escrow: { generation: 'MANUAL', reusable: true } })],
    })
    expect(initialValues(source, {}).escrowGeneration).toBe('MANUAL')
  })

  it('clone: escrowGeneration is empty when the source base row has no escrow generation', () => {
    const source = makeSource({ configurations: [makeBaseRow({ escrow: null })] })
    expect(initialValues(source, {}).escrowGeneration).toBe('')
  })
})

describe('initialValues — Full Version Format (config-first with a universal fallback)', () => {
  const FALLBACK = '$versionPrefix-$baseVersionFormat'
  it('scratch: uses the component-defaults value, else the universal fallback (never blank)', () => {
    expect(initialValues(null, {}).versionFormat).toBe(FALLBACK)
    const defaults: ComponentDefaults = {
      jira: { componentVersionFormat: { versionFormat: '$prefix-$custom' } },
    }
    expect(initialValues(null, defaults).versionFormat).toBe('$prefix-$custom')
  })

  it('clone: uses the source versionFormat, else the universal fallback', () => {
    const withFmt = makeSource({
      configurations: [makeBaseRow({ jira: { projectKey: 'A', versionFormat: 'SRC-FMT' } })],
    })
    expect(initialValues(withFmt, {}).versionFormat).toBe('SRC-FMT')
    const noFmt = makeSource({ configurations: [makeBaseRow({ jira: { projectKey: 'A' } })] })
    expect(initialValues(noFmt, {}).versionFormat).toBe(FALLBACK)
  })
})

describe('initialValues — scratch distribution flags follow the pre-selected profile', () => {
  it('derives External/Explicit from the default profile, NOT from defaults.distribution', () => {
    // Even if component-defaults say internal/explicit, a scratch component starts
    // as the pre-selected Regular external profile → external=true, explicit=false.
    const defaults: ComponentDefaults = { distribution: { external: false, explicit: true } }
    const v = initialValues(null, defaults)
    expect(v.distributionExternal).toBe(true)
    expect(v.distributionExplicit).toBe(false)
  })
})

// SYS-095 / CRS ADR-020: a Component Key may carry '_' only inside its
// client-code prefix — the lowercased Client Code of the same component.
describe('componentKeyCharsetError — client-code prefix', () => {
  it('accepts an underscore inside the client-code prefix', () => {
    expect(componentKeyCharsetError('ab_cd-payments', 'AB_CD')).toBeNull()
  })

  it('accepts the bare client-code prefix as the whole key', () => {
    expect(componentKeyCharsetError('ab_cd', 'AB_CD')).toBeNull()
  })

  it('accepts a plain kebab key with no client code', () => {
    expect(componentKeyCharsetError('plain-component')).toBeNull()
  })

  it('rejects an underscore when there is no client code', () => {
    expect(componentKeyCharsetError('ab_cd-payments')).toBe(
      'Component Key must be lowercase letters, digits and "-", starting with a letter',
    )
  })

  it('rejects an underscore when the client code has none', () => {
    expect(componentKeyCharsetError('ab_cd-payments', 'ABCD')).toContain('abcd')
  })

  it('rejects a client-code match that does not lead the key', () => {
    expect(componentKeyCharsetError('payments-ab_cd', 'AB_CD')).not.toBeNull()
  })

  it('rejects an uppercase key even when it matches the client code', () => {
    expect(componentKeyCharsetError('AB_CD-payments', 'AB_CD')).not.toBeNull()
  })

  it('rejects a digit-leading key even when the client code leads with that digit', () => {
    expect(componentKeyCharsetError('123abc-payments', '123ABC')).not.toBeNull()
  })

  it('rejects a bare all-digit client code as the whole key', () => {
    expect(componentKeyCharsetError('123', '123')).not.toBeNull()
  })

  it('rejects a key that is nothing but an underscore client code', () => {
    expect(componentKeyCharsetError('_', '_')).not.toBeNull()
  })

  it('names the prefix that would legalise the underscore', () => {
    expect(componentKeyCharsetError('payments_1', 'AB_CD')).toBe(
      'Component Key must be lowercase letters, digits and "-", starting with a letter; "_" is allowed only inside the Client Code prefix "ab_cd" (e.g. ab_cd-payments)',
    )
  })
})

// The create schema must validate the Component Key against the Client Code that
// buildCreateRequest will actually SEND, not the raw form value: the payload strips a
// non-editable clientCode and ignores the form value when the component is not external.
// A key accepted here but sent without its client code earns a 400 from CRS.
describe('makeCreateSchema — key validated against the client code that is sent', () => {
  function form(overrides: Partial<CreateFormValues> = {}): CreateFormValues {
    return {
      ...initialValues(null, {}),
      name: 'ab_cd-copy',
      componentOwner: 'alice',
      buildSystem: 'PROVIDED',
      jiraProjectKey: 'ABCD',
      versionFormat: '$major.$minor',
      distributionExplicit: false,
      distributionExternal: true,
      clientCode: 'AB_CD',
      ...overrides,
    }
  }
  const keyIssues = (schema: ReturnType<typeof makeCreateSchema>, values: CreateFormValues) => {
    const result = schema.safeParse(values)
    return result.success ? [] : result.error.issues.filter((i) => i.path[0] === 'name')
  }
  const allEditable = () => true

  it('accepts the key when the form client code is the one that gets sent', () => {
    expect(keyIssues(makeCreateSchema(allEditable, [], null, []), form())).toHaveLength(0)
  })

  it('rejects the key when clientCode is not editable, because the payload strips it', () => {
    const schema = makeCreateSchema((f) => f !== 'clientCode', [], null, [])
    expect(keyIssues(schema, form())).toHaveLength(1)
  })

  it('rejects the key when the component is not external, because the form value is ignored', () => {
    const schema = makeCreateSchema(allEditable, [], null, [])
    expect(keyIssues(schema, form({ distributionExternal: false }))).toHaveLength(1)
  })
})

describe('makeCreateSchema — the chosen profile\'s field rules', () => {
  const rulesOf = (id: string): ProfileFieldRule[] =>
    (shipped.profiles as ComponentProfile[]).find((p) => p.id === id)!.rules
  const rule = (path: string, pattern: string): ProfileFieldRule => ({ path, pattern, message: `rule on ${path}` })
  const allEditable: (field: string) => boolean = () => true
  function form(overrides: Partial<CreateFormValues> = {}): CreateFormValues {
    return {
      ...initialValues(null, {}),
      name: 'payments',
      componentOwner: 'alice',
      buildSystem: 'PROVIDED',
      jiraProjectKey: 'ABCD',
      versionFormat: '$major.$minor',
      ...overrides,
    }
  }
  const issuesOn = (rules: ProfileFieldRule[], values: CreateFormValues, editable = allEditable) => {
    const result = makeCreateSchema(editable, [], null, rules).safeParse(values)
    return result.success ? [] : result.error.issues
  }
  const messagesAt = (issues: ReturnType<typeof issuesOn>, path: string) =>
    issues.filter((i) => i.path.join('.') === path).map((i) => i.message)

  it('reports a character failure alone, before any profile rule', () => {
    const issues = issuesOn(rulesOf('regular-external'), form({ name: 'Solution' }))
    expect(messagesAt(issues, 'name')).toHaveLength(1)
    expect(messagesAt(issues, 'name')[0]).toMatch(/Component Key must be/)
  })

  it('reports a failing profile rule on the key', () => {
    const issues = issuesOn(rulesOf('regular-external'), form({ name: 'resolution-service' }))
    expect(messagesAt(issues, 'name')).toEqual([rulesOf('regular-external')[0]!.message])
  })

  it('reports a rule on build tasks on the build tasks field', () => {
    const issues = issuesOn([rule('baseConfiguration.build.buildTasks', 'clean build')], form())
    expect(messagesAt(issues, 'buildTasks')).toEqual(['rule on baseConfiguration.build.buildTasks'])
  })

  it('applies only today\'s checks without rules', () => {
    expect(messagesAt(issuesOn([], form({ name: 'resolution-service' })), 'name')).toHaveLength(0)
  })

  it('no longer applies the built-in solution-substring rule', () => {
    expect(messagesAt(issuesOn([], form({ name: 'my-solution' })), 'name')).toHaveLength(0)
  })

  it('checks a Maven-group rule as "" when the coordinate is a Docker image, on the Maven group field', () => {
    const values = form({
      distributionExplicit: true,
      distributionExternal: true,
      displayName: 'Payments',
      coordinate: { ...form().coordinate, type: 'docker', imageName: 'acme/payments' },
    })
    const issues = issuesOn([rule('baseConfiguration.mavenArtifacts[0].groupPattern', '.+')], values)
    expect(messagesAt(issues, 'coordinate.groupPattern')).toEqual([
      'rule on baseConfiguration.mavenArtifacts[0].groupPattern',
    ])
  })

  it('checks a rule on a field the user may not edit as "", because the request leaves it out', () => {
    const issues = issuesOn([rule('displayName', '.+')], form({ displayName: 'Payments' }), (f: string) => f !== 'displayName')
    expect(messagesAt(issues, 'displayName')).toEqual(['rule on displayName'])
  })

  it('does not add a rule message to a blank key, which already shows "required"', () => {
    const issues = issuesOn(rulesOf('solution'), form({ name: '' }))
    expect(messagesAt(issues, 'name')).toEqual(['Component Key is required'])
  })
})

describe('renameKeyCharsetError — the editor rename gate', () => {
  it('passes a changed key that satisfies the client-code prefix', () => {
    expect(renameKeyCharsetError('ab_cd-payments', 'ab_cd-billing', 'AB_CD')).toBeNull()
  })

  it('rejects a changed key whose underscore has no client code behind it', () => {
    expect(renameKeyCharsetError('ab_cd-payments', 'legacy-key')).toMatch(/Component Key must be/)
  })

  it('never re-validates an untouched legacy key', () => {
    expect(renameKeyCharsetError('LEGACY_KEY.v1', 'LEGACY_KEY.v1')).toBeNull()
  })

  it('ignores surrounding whitespace, the way CRS decides isRename', () => {
    expect(renameKeyCharsetError('  LEGACY_KEY.v1  ', 'LEGACY_KEY.v1')).toBeNull()
  })

  it('treats a cleared field as not-yet-a-rename, not a charset violation', () => {
    // buildUpdateRequest's `nameChanged` gate omits a blank name from the PATCH entirely,
    // so a blank field must not surface an error — same guard componentKeyError has.
    expect(renameKeyCharsetError('', 'legacy-key')).toBeNull()
    expect(renameKeyCharsetError('   ', 'legacy-key')).toBeNull()
    expect(renameKeyCharsetError(undefined, 'legacy-key')).toBeNull()
  })
})
