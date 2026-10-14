import { describe, it, expect } from 'vitest'
import { applyOverrides, reviewFieldGroups, reviewProblems } from './templateReview'
import type { TemplateRun } from '../../hooks/useTemplateRun'

const VCS_PATH = 'baseConfiguration.vcsEntries[0].vcsPath'

function run(overrides: Partial<TemplateRun> = {}): TemplateRun {
  return {
    valid: true,
    parameterProblems: [],
    problems: [],
    component: { name: 'abc-plugin-pay', baseConfiguration: {} } as NonNullable<TemplateRun['component']>,
    sources: { name: ['CLIENT_CODE', 'PLUGIN_CODE'], [VCS_PATH]: ['CLIENT_CODE'] },
    overridden: [],
    ...overrides,
  }
}

describe('reviewProblems', () => {
  it('keeps a registry problem with its field, parameters and template flag, showing the message without its field prefix', () => {
    const problems = reviewProblems(
      run({
        problems: [
          { fields: ['name'], parameters: ['CLIENT_CODE', 'PLUGIN_CODE'], templateProblem: false, message: 'name: component abc-plugin-pay already exists' },
        ],
      }),
      [],
    )
    expect(problems).toEqual([
      { path: 'name', message: 'component abc-plugin-pay already exists', parameters: ['CLIENT_CODE', 'PLUGIN_CODE'], templateProblem: false },
    ])
  })

  it('places a registry problem that names no field by its message prefix', () => {
    const problems = reviewProblems(
      run({ problems: [{ fields: [], parameters: [], templateProblem: true, message: 'displayName: must not be blank' }] }),
      [],
    )
    expect(problems[0]).toMatchObject({ path: 'displayName', message: 'must not be blank', templateProblem: true })
  })

  it('shows a registry problem with neither a field nor a prefix at the top', () => {
    const problems = reviewProblems(
      run({ problems: [{ fields: [], parameters: [], templateProblem: true, message: 'Copyright is required by the catalog' }] }),
      [],
    )
    expect(problems[0]).toMatchObject({ path: undefined, message: 'Copyright is required by the catalog' })
  })

  it('names the parameters a Portal rule problem came from', () => {
    const problems = reviewProblems(run(), [{ path: VCS_PATH, message: 'VCS host must be git.example.com (the ecosystem Bitbucket)' }])
    expect(problems).toEqual([
      { path: VCS_PATH, message: 'VCS host must be git.example.com (the ecosystem Bitbucket)', parameters: ['CLIENT_CODE'], templateProblem: false },
    ])
  })

  it('makes a Portal rule problem on a field the template fixes a template problem', () => {
    const problems = reviewProblems(run(), [{ path: 'baseConfiguration.jira.versionFormat', message: 'Full Version Format is required' }])
    expect(problems[0]).toMatchObject({ parameters: [], templateProblem: true })
  })

  it('does not blame the template for a Portal rule problem on an overridden field', () => {
    const problems = reviewProblems(run({ sources: { [VCS_PATH]: [] }, overridden: [VCS_PATH] }), [
      { path: VCS_PATH, message: 'VCS Path must be an ssh:// URL, e.g. ssh://git@host/path/repo.git' },
    ])
    expect(problems[0]).toMatchObject({ parameters: [], templateProblem: false })
  })

  it('shows the same problem once when the registry and the Portal both report it', () => {
    const problems = reviewProblems(
      run({ problems: [{ fields: ['name'], parameters: ['CLIENT_CODE'], templateProblem: false, message: 'name: Too long' }] }),
      [{ path: 'name', message: 'Too long' }],
    )
    expect(problems).toHaveLength(1)
  })

  it('lists the registry problems before the Portal ones', () => {
    const problems = reviewProblems(
      run({ problems: [{ fields: ['name'], parameters: [], templateProblem: false, message: 'name: taken' }] }),
      [{ path: VCS_PATH, message: 'Tag is required' }],
    )
    expect(problems.map((p) => p.path)).toEqual(['name', VCS_PATH])
  })
})

describe('reviewFieldGroups', () => {
  const component = {
    name: 'abc-plugin-pay',
    componentOwner: 'jdoe',
    releaseManager: ['jdoe', 'asmith'],
    labels: [],
    distributionExplicit: false,
    distributionExternal: true,
    archived: false,
    artifactIds: [{ groupPattern: 'org.example.abc', mode: 'EXPLICIT', artifactTokens: ['pay'] }],
    baseConfiguration: {
      build: { buildSystem: 'GRADLE' },
      vcsEntries: [{ vcsPath: 'ssh://git@git.example.com/abc/plugin.git', branch: 'master' }],
      jira: { projectKey: 'ABC', versionFormat: '$versionPrefix-$baseVersionFormat' },
      requiredTools: ['jdk21'],
    },
  } as unknown as NonNullable<TemplateRun['component']>

  const groups = (extra: string[] = []) => reviewFieldGroups(component, extra)
  const rowsOf = (heading: string) => groups().find((g) => g.heading === heading)?.rows ?? []

  it('groups the rendered fields as the regular Review does, with its labels', () => {
    expect(groups().map((g) => g.heading)).toEqual(['General', 'Build', 'VCS', 'Jira', 'Other fields'])
    expect(rowsOf('General').map((r) => [r.label, r.value])).toEqual([
      ['Component Key', ['abc-plugin-pay']],
      ['Component Owner', ['jdoe']],
      ['Release Managers', ['jdoe', 'asmith']],
      ['Classification', ['External · not explicit']],
    ])
  })

  it('keys each row by its create-request path', () => {
    expect(rowsOf('VCS').map((r) => r.path)).toEqual([
      'baseConfiguration.vcsEntries[0].vcsPath',
      'baseConfiguration.vcsEntries[0].branch',
    ])
  })

  it('shows each produced-artifact row', () => {
    expect(rowsOf('Build').map((r) => [r.path, r.value])).toEqual([
      ['baseConfiguration.build.buildSystem', ['GRADLE']],
      ['artifactIds[0].groupPattern', ['org.example.abc — Specific artifacts only (pay)']],
    ])
  })

  it('lists a field the grouping does not know under Other fields, rather than dropping it', () => {
    expect(groups().find((g) => g.heading === 'Other fields')?.rows).toEqual([
      { path: 'baseConfiguration.requiredTools', label: 'baseConfiguration.requiredTools', value: ['jdk21'] },
    ])
  })

  it('keeps an empty field a problem or an override needs, so its message has a row', () => {
    const general = groups(['displayName']).find((g) => g.heading === 'General')!
    expect(general.rows.find((r) => r.path === 'displayName')).toEqual({ path: 'displayName', label: 'Display Name', value: [] })
  })
})

describe('applyOverrides', () => {
  const component = {
    name: 'abc-plugin-pay',
    releaseManager: ['jdoe'],
    baseConfiguration: { jira: { projectKey: 'ABC' } },
  } as unknown as NonNullable<TemplateRun['component']>

  it('sets a single-value field to the edited value, leaving the rendered component untouched', () => {
    const edited = applyOverrides(component, { 'baseConfiguration.jira.projectKey': ['XYZ'] })
    expect(edited.baseConfiguration?.jira?.projectKey).toBe('XYZ')
    expect(component.baseConfiguration?.jira?.projectKey).toBe('ABC')
  })

  it('creates the entry an indexed path needs', () => {
    const edited = applyOverrides(component, { 'baseConfiguration.vcsEntries[0].vcsPath': ['ssh://git@git.example.com/x.git'] })
    expect(edited.baseConfiguration?.vcsEntries?.[0]?.vcsPath).toBe('ssh://git@git.example.com/x.git')
  })

  it('keeps a list field a list', () => {
    expect(applyOverrides(component, { releaseManager: ['asmith', 'jdoe'] }).releaseManager).toEqual(['asmith', 'jdoe'])
  })
})
