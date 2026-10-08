import type { ProfileFieldRule } from '../../hooks/useComponentProfiles'
import type { ComponentCreateRequest } from '../types'

type Reader = (request: ComponentCreateRequest) => string | null | undefined

const jira = (r: ComponentCreateRequest) => r.baseConfiguration?.jira
const firstVcs = (r: ComponentCreateRequest) => r.baseConfiguration?.vcsEntries?.[0]
const firstMaven = (r: ComponentCreateRequest) => r.baseConfiguration?.mavenArtifacts?.[0]
const firstDocker = (r: ComponentCreateRequest) => r.baseConfiguration?.dockerImages?.[0]
const firstPackage = (r: ComponentCreateRequest) => r.baseConfiguration?.packages?.[0]

/**
 * The create-request paths a profile field rule may name, as the registry lists them
 * (`CreateRequestPaths.PATHS`), each with how to read it from a request. An indexed path reads
 * the first entry only.
 */
const READERS: Record<string, Reader> = {
  name: (r) => r.name,
  displayName: (r) => r.displayName,
  clientCode: (r) => r.clientCode,
  'artifactIds[0].groupPattern': (r) => r.artifactIds?.[0]?.groupPattern,
  'baseConfiguration.build.buildTasks': (r) => r.baseConfiguration?.build?.buildTasks,
  'baseConfiguration.vcsEntries[0].vcsPath': (r) => firstVcs(r)?.vcsPath,
  'baseConfiguration.vcsEntries[0].branch': (r) => firstVcs(r)?.branch,
  'baseConfiguration.vcsEntries[0].tag': (r) => firstVcs(r)?.tag,
  'baseConfiguration.jira.projectKey': (r) => jira(r)?.projectKey,
  'baseConfiguration.jira.versionPrefix': (r) => jira(r)?.versionPrefix,
  'baseConfiguration.jira.versionFormat': (r) => jira(r)?.versionFormat,
  'baseConfiguration.jira.lineVersionFormat': (r) => jira(r)?.lineVersionFormat,
  'baseConfiguration.jira.minorVersionFormat': (r) => jira(r)?.minorVersionFormat,
  'baseConfiguration.jira.releaseVersionFormat': (r) => jira(r)?.releaseVersionFormat,
  'baseConfiguration.jira.buildVersionFormat': (r) => jira(r)?.buildVersionFormat,
  'baseConfiguration.mavenArtifacts[0].groupPattern': (r) => firstMaven(r)?.groupPattern,
  'baseConfiguration.mavenArtifacts[0].artifactPattern': (r) => firstMaven(r)?.artifactPattern,
  'baseConfiguration.dockerImages[0].imageName': (r) => firstDocker(r)?.imageName,
  'baseConfiguration.dockerImages[0].flavor': (r) => firstDocker(r)?.flavor,
  'baseConfiguration.packages[0].packageName': (r) => firstPackage(r)?.packageName,
}

/** Rule path → the wizard form field that shows its message (an RHF field path). */
const FIELDS: Record<string, string> = {
  name: 'name',
  displayName: 'displayName',
  clientCode: 'clientCode',
  'artifactIds[0].groupPattern': 'ownership.0.groupId',
  'baseConfiguration.build.buildTasks': 'buildTasks',
  'baseConfiguration.vcsEntries[0].vcsPath': 'vcsUrl',
  'baseConfiguration.vcsEntries[0].branch': 'vcsBranch',
  'baseConfiguration.vcsEntries[0].tag': 'vcsTag',
  'baseConfiguration.jira.projectKey': 'jiraProjectKey',
  'baseConfiguration.jira.versionPrefix': 'versionPrefix',
  'baseConfiguration.jira.versionFormat': 'versionFormat',
  'baseConfiguration.jira.lineVersionFormat': 'lineVersionFormat',
  'baseConfiguration.jira.minorVersionFormat': 'minorVersionFormat',
  'baseConfiguration.jira.releaseVersionFormat': 'releaseVersionFormat',
  'baseConfiguration.jira.buildVersionFormat': 'buildVersionFormat',
  'baseConfiguration.mavenArtifacts[0].groupPattern': 'coordinate.groupPattern',
  'baseConfiguration.mavenArtifacts[0].artifactPattern': 'coordinate.artifactPattern',
  'baseConfiguration.dockerImages[0].imageName': 'coordinate.imageName',
  'baseConfiguration.dockerImages[0].flavor': 'coordinate.flavor',
  'baseConfiguration.packages[0].packageName': 'coordinate.packageName',
}

export const RULE_PATHS: readonly string[] = Object.keys(READERS)

/** The wizard form field for a create-request path, or `undefined` for a path it does not know. */
export function formFieldOfRulePath(path: string): string | undefined {
  return FIELDS[path]
}

const compiled = new WeakMap<ProfileFieldRule, RegExp | null>()

// Anchored so `test` matches the whole value, as the registry's Java `matches()` does.
function regexOf(rule: ProfileFieldRule): RegExp | null {
  if (!compiled.has(rule)) {
    let regex: RegExp | null
    try {
      regex = new RegExp(`^(?:${rule.pattern})$`)
    } catch {
      regex = null
    }
    compiled.set(rule, regex)
  }
  return compiled.get(rule) ?? null
}

/**
 * The profile field rules [request] breaks, keyed by create-request path, with each rule's
 * message.
 *
 * A fast check only: a rule on a path outside the registry's list, or whose pattern this browser
 * cannot compile, is skipped and left to the registry's answer on create. An absent value is
 * checked as `""`, so the pattern decides whether the field may be empty.
 */
export function profileRuleErrors(
  rules: readonly ProfileFieldRule[],
  request: ComponentCreateRequest,
): Map<string, string> {
  const errors = new Map<string, string>()
  for (const rule of rules) {
    const read = READERS[rule.path]
    const regex = regexOf(rule)
    if (!read || !regex) continue
    if (!regex.test(read(request) ?? '') && !errors.has(rule.path)) errors.set(rule.path, rule.message)
  }
  return errors
}

/**
 * A registry rule failure from a create's error body — `<create-request path>: <message>` — when
 * the path is one a rule may name. The generic server-error parser reads plain field names only,
 * so a nested path like `baseConfiguration.jira.projectKey` needs this.
 */
export function ruleErrorOf(rawBody: string): { path: string; message: string } | null {
  let errorMessage: unknown
  try {
    errorMessage = (JSON.parse(rawBody) as { errorMessage?: unknown }).errorMessage
  } catch {
    return null
  }
  if (typeof errorMessage !== 'string') return null
  const separator = errorMessage.indexOf(': ')
  if (separator < 0) return null
  const path = errorMessage.slice(0, separator)
  return path in READERS ? { path, message: errorMessage.slice(separator + 2).trim() } : null
}
