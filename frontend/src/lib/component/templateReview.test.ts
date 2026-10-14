import { describe, it, expect } from 'vitest'
import { reviewProblems } from './templateReview'
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
