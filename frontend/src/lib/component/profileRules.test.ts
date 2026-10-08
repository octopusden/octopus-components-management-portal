import { describe, it, expect } from 'vitest'
import { formFieldOfRulePath, profileRuleErrors, RULE_PATHS } from './profileRules'
import type { ComponentProfile, ProfileFieldRule } from '../../hooks/useComponentProfiles'
import type { ComponentCreateRequest } from '../types'
import shipped from '../../test-fixtures/component-profiles.contract.json'

const rulesOf = (id: string): ProfileFieldRule[] =>
  (shipped.profiles as ComponentProfile[]).find((p) => p.id === id)!.rules

function request(overrides: Partial<ComponentCreateRequest> = {}): ComponentCreateRequest {
  return { name: 'payments', ...overrides }
}

describe('profileRuleErrors', () => {
  it('returns a failing name rule message on its path', () => {
    const errors = profileRuleErrors(rulesOf('regular-external'), request({ name: 'resolution-service' }))
    expect(errors.get('name')).toBe(rulesOf('regular-external')[0]!.message)
  })

  it('returns nothing for a value that passes', () => {
    expect(profileRuleErrors(rulesOf('regular-external'), request({ name: 'payments' })).size).toBe(0)
  })

  it('matches the whole value, as the registry does: [a-z]+ rejects payments-1', () => {
    const rules = [rule('name', '[a-z]+')]
    expect(profileRuleErrors(rules, request({ name: 'payments-1' })).has('name')).toBe(true)
    expect(profileRuleErrors(rules, request({ name: 'payments' })).has('name')).toBe(false)
  })

  it('checks an absent value as "", so a rule requiring a value fails on it', () => {
    const rules = [rule('displayName', '.+')]
    expect(profileRuleErrors(rules, request()).has('displayName')).toBe(true)
  })

  it('skips a rule on a path outside the registry list', () => {
    expect(profileRuleErrors([rule('componentOwner', 'x')], request()).size).toBe(0)
  })

  it('skips a pattern the browser cannot compile and still checks the others', () => {
    const rules = [rule('displayName', '\\p{Lu}++'), rule('name', 'x')]
    const errors = profileRuleErrors(rules, request({ displayName: 'ABC' }))
    expect([...errors.keys()]).toEqual(['name'])
  })

  it.each([
    ['regular-external', 'resolution-service', true],
    ['regular-external', 'x-dmp-bundle', true],
    ['regular-external', 'payments', false],
    ['regular-internal', 'resolution-service', true],
    ['solution', 'payments-dmp-bundle', true],
    ['solution', 'payments-solution', false],
    ['dmp-bundle', 'payments-dmp-bundle', false],
  ])('the shipped %s rule on key %s fails: %s', (profileId, key, fails) => {
    expect(profileRuleErrors(rulesOf(profileId), request({ name: key })).has('name')).toBe(fails)
  })
})

describe('rule paths', () => {
  const full: ComponentCreateRequest = {
    name: 'v-name',
    displayName: 'v-display',
    clientCode: 'v-client',
    artifactIds: [
      { groupPattern: 'v-ownership', mode: 'ALL', artifactTokens: [] },
      { groupPattern: 'second', mode: 'ALL', artifactTokens: [] },
    ],
    baseConfiguration: {
      build: { buildSystem: 'GRADLE', buildTasks: 'v-tasks' },
      vcsEntries: [{ vcsPath: 'v-vcs', branch: 'v-branch', tag: 'v-tag' }],
      jira: {
        projectKey: 'v-project',
        versionPrefix: 'v-prefix',
        versionFormat: 'v-full',
        lineVersionFormat: 'v-line',
        minorVersionFormat: 'v-minor',
        releaseVersionFormat: 'v-release',
        buildVersionFormat: 'v-build',
      },
      mavenArtifacts: [{ groupPattern: 'v-group', artifactPattern: 'v-artifact', extension: null, classifier: null }],
      dockerImages: [{ imageName: 'v-image', flavor: 'v-flavor' }],
      packages: [{ packageType: 'DEB', packageName: 'v-package' }],
    },
  } as ComponentCreateRequest

  // Paths and readers follow the registry's CreateRequestPaths; fields follow the wizard's form.
  it.each([
    ['name', 'v-name', 'name'],
    ['displayName', 'v-display', 'displayName'],
    ['clientCode', 'v-client', 'clientCode'],
    ['artifactIds[0].groupPattern', 'v-ownership', 'ownership.0.groupId'],
    ['baseConfiguration.build.buildTasks', 'v-tasks', 'buildTasks'],
    ['baseConfiguration.vcsEntries[0].vcsPath', 'v-vcs', 'vcsUrl'],
    ['baseConfiguration.vcsEntries[0].branch', 'v-branch', 'vcsBranch'],
    ['baseConfiguration.vcsEntries[0].tag', 'v-tag', 'vcsTag'],
    ['baseConfiguration.jira.projectKey', 'v-project', 'jiraProjectKey'],
    ['baseConfiguration.jira.versionPrefix', 'v-prefix', 'versionPrefix'],
    ['baseConfiguration.jira.versionFormat', 'v-full', 'versionFormat'],
    ['baseConfiguration.jira.lineVersionFormat', 'v-line', 'lineVersionFormat'],
    ['baseConfiguration.jira.minorVersionFormat', 'v-minor', 'minorVersionFormat'],
    ['baseConfiguration.jira.releaseVersionFormat', 'v-release', 'releaseVersionFormat'],
    ['baseConfiguration.jira.buildVersionFormat', 'v-build', 'buildVersionFormat'],
    ['baseConfiguration.mavenArtifacts[0].groupPattern', 'v-group', 'coordinate.groupPattern'],
    ['baseConfiguration.mavenArtifacts[0].artifactPattern', 'v-artifact', 'coordinate.artifactPattern'],
    ['baseConfiguration.dockerImages[0].imageName', 'v-image', 'coordinate.imageName'],
    ['baseConfiguration.dockerImages[0].flavor', 'v-flavor', 'coordinate.flavor'],
    ['baseConfiguration.packages[0].packageName', 'v-package', 'coordinate.packageName'],
  ])('%s reads %s and shows on %s', (path, value, field) => {
    expect(profileRuleErrors([rule(path, value)], full).size).toBe(0)
    expect(profileRuleErrors([rule(path, 'other')], full).has(path)).toBe(true)
    expect(formFieldOfRulePath(path)).toBe(field)
  })

  it('covers exactly the registry list: every path has a reader and a field', () => {
    expect(RULE_PATHS).toHaveLength(20)
    for (const path of RULE_PATHS) expect(formFieldOfRulePath(path)).toBeDefined()
  })
})

function rule(path: string, pattern: string): ProfileFieldRule {
  return { path, pattern, message: `${path} breaks ${pattern}` }
}
