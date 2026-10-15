import type { TemplateRun } from '../../hooks/useTemplateRun'
import type { PortalRuleIssue } from './portalCreateRules'
import { OWNERSHIP_MODES } from '../artifactOwnership'

/** One problem Review shows, from the registry or from the Portal's own rules. */
export interface ReviewProblem {
  /** The create-request path it is shown on; `undefined` shows it at the top of Review. */
  path: string | undefined
  message: string
  /** The parameters the field came from, each a way back to the Parameters step. */
  parameters: string[]
  /** The template, not the creator's values, has to change: report it to an administrator. */
  templateProblem: boolean
}

// The registry words many problems as `<create-request path>: <message>`.
const FIELD_PREFIX = /^([A-Za-z][\w.[\]]*): (.+)$/s

function withoutPrefix(message: string): { field: string | undefined; text: string } {
  const match = FIELD_PREFIX.exec(message)
  return match ? { field: match[1], text: match[2]! } : { field: undefined, text: message }
}

/**
 * Every problem Review shows for a dry run: the registry's, then the Portal-only rules' on the
 * rendered component.
 *
 * A Portal problem takes the parameters the dry run says its field came from. With none, it is the
 * template's problem — unless the creator overrode that field, when it is theirs to fix.
 */
export function reviewProblems(run: TemplateRun, portalIssues: readonly PortalRuleIssue[]): ReviewProblem[] {
  const shown: ReviewProblem[] = run.problems.map((problem) => {
    const { field, text } = withoutPrefix(problem.message)
    return {
      path: problem.fields[0] ?? field,
      message: field ? text : problem.message,
      parameters: [...problem.parameters],
      templateProblem: problem.templateProblem,
    }
  })
  for (const issue of portalIssues) {
    if (shown.some((p) => p.path === issue.path && p.message === issue.message)) continue
    const parameters = [...(run.sources?.[issue.path] ?? [])]
    shown.push({
      path: issue.path,
      message: issue.message,
      parameters,
      templateProblem: parameters.length === 0 && !(run.overridden ?? []).includes(issue.path),
    })
  }
  return shown
}

type RenderedComponent = NonNullable<TemplateRun['component']>

/** One rendered field on Review, keyed by its create-request path. */
export interface ReviewField {
  path: string
  label: string
  value: string[]
}

export interface ReviewFieldGroup {
  heading: string
  rows: ReviewField[]
}

type Reader = (c: RenderedComponent) => unknown

const VCS = 'baseConfiguration.vcsEntries[0]'
const JIRA = 'baseConfiguration.jira'

// The regular Review's groups and labels, by create-request path, in its order.
const KNOWN: readonly { path: string; label: string; group: string; read: Reader }[] = [
  { path: 'name', label: 'Component Key', group: 'General', read: (c) => c.name },
  { path: 'displayName', label: 'Display Name', group: 'General', read: (c) => c.displayName },
  { path: 'componentOwner', label: 'Component Owner', group: 'General', read: (c) => c.componentOwner },
  { path: 'releaseManager', label: 'Release Managers', group: 'General', read: (c) => c.releaseManager },
  { path: 'securityChampion', label: 'Security Champions', group: 'General', read: (c) => c.securityChampion },
  { path: 'copyright', label: 'Copyright', group: 'General', read: (c) => c.copyright },
  { path: 'clientCode', label: 'Client Code', group: 'General', read: (c) => c.clientCode },
  { path: 'classification', label: 'Classification', group: 'General', read: classificationOf },
  { path: 'labels', label: 'Labels', group: 'General', read: (c) => c.labels },
  { path: 'baseConfiguration.build.buildSystem', label: 'Build System', group: 'Build', read: (c) => c.baseConfiguration?.build?.buildSystem },
  { path: 'baseConfiguration.build.buildTasks', label: 'Build Tasks', group: 'Build', read: (c) => c.baseConfiguration?.build?.buildTasks },
  { path: `${VCS}.vcsPath`, label: 'VCS Path', group: 'VCS', read: (c) => c.baseConfiguration?.vcsEntries?.[0]?.vcsPath },
  { path: `${VCS}.branch`, label: 'Production branch', group: 'VCS', read: (c) => c.baseConfiguration?.vcsEntries?.[0]?.branch },
  { path: `${VCS}.tag`, label: 'Tag', group: 'VCS', read: (c) => c.baseConfiguration?.vcsEntries?.[0]?.tag },
  { path: `${JIRA}.projectKey`, label: 'Jira Project Key', group: 'Jira', read: (c) => c.baseConfiguration?.jira?.projectKey },
  { path: `${JIRA}.versionPrefix`, label: 'Version Prefix', group: 'Jira', read: (c) => c.baseConfiguration?.jira?.versionPrefix },
  { path: `${JIRA}.versionFormat`, label: 'Full Version Format', group: 'Jira', read: (c) => c.baseConfiguration?.jira?.versionFormat },
  { path: `${JIRA}.lineVersionFormat`, label: 'Line Version Format', group: 'Jira', read: (c) => c.baseConfiguration?.jira?.lineVersionFormat },
  { path: `${JIRA}.minorVersionFormat`, label: 'Minor Version Format', group: 'Jira', read: (c) => c.baseConfiguration?.jira?.minorVersionFormat },
  { path: `${JIRA}.releaseVersionFormat`, label: 'Release Version Format', group: 'Jira', read: (c) => c.baseConfiguration?.jira?.releaseVersionFormat },
  { path: `${JIRA}.buildVersionFormat`, label: 'Build Version Format', group: 'Jira', read: (c) => c.baseConfiguration?.jira?.buildVersionFormat },
  { path: 'baseConfiguration.mavenArtifacts[0].groupPattern', label: 'Maven Group ID', group: 'Distribution', read: (c) => c.baseConfiguration?.mavenArtifacts?.[0]?.groupPattern },
  { path: 'baseConfiguration.mavenArtifacts[0].artifactPattern', label: 'Maven Artifact ID', group: 'Distribution', read: (c) => c.baseConfiguration?.mavenArtifacts?.[0]?.artifactPattern },
  { path: 'baseConfiguration.dockerImages[0].imageName', label: 'Docker image', group: 'Distribution', read: (c) => c.baseConfiguration?.dockerImages?.[0]?.imageName },
  { path: 'baseConfiguration.dockerImages[0].flavor', label: 'Docker flavor', group: 'Distribution', read: (c) => c.baseConfiguration?.dockerImages?.[0]?.flavor },
  { path: 'baseConfiguration.packages[0].packageType', label: 'Package type', group: 'Distribution', read: (c) => c.baseConfiguration?.packages?.[0]?.packageType },
  { path: 'baseConfiguration.packages[0].packageName', label: 'Package name', group: 'Distribution', read: (c) => c.baseConfiguration?.packages?.[0]?.packageName },
  { path: 'baseConfiguration.escrow.generation', label: 'Generation', group: 'Escrow', read: (c) => c.baseConfiguration?.escrow?.generation },
]
const GROUPS = ['General', 'Build', 'VCS', 'Jira', 'Distribution', 'Escrow']
const OTHER = 'Other fields'

// Fields Review shows another way (classification, produced artifacts) or that a create never
// sets for the creator to see.
const NOT_LISTED = new Set(['distributionExplicit', 'distributionExternal', 'solution', 'archived', 'teamcityProjects'])

function classificationOf(c: RenderedComponent): string {
  const parts = [c.distributionExternal ? 'External' : 'Internal', c.distributionExplicit ? 'explicit' : 'not explicit']
  if (c.solution) parts.push('solution')
  return parts.join(' · ')
}

function asValues(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === false || raw === '') return []
  if (Array.isArray(raw)) return raw.flatMap(asValues)
  return [String(raw).trim()].filter((v) => v !== '')
}

function artifactRows(c: RenderedComponent): ReviewField[] {
  return (c.artifactIds ?? []).map((row, i) => {
    const mode = OWNERSHIP_MODES.find((m) => m.key === row.mode)?.label ?? row.mode ?? ''
    const tokens = row.mode === 'EXPLICIT' ? ` (${(row.artifactTokens ?? []).join(', ')})` : ''
    return { path: `artifactIds[${i}].groupPattern`, label: 'Produced Artifacts', value: [`${row.groupPattern} — ${mode}${tokens}`] }
  })
}

// Every set leaf of [node] the known rows do not cover, by create-request path.
function otherLeaves(node: unknown, path: string, known: ReadonlySet<string>): ReviewField[] {
  if (path === 'artifactIds' || NOT_LISTED.has(path) || known.has(path)) return []
  if (Array.isArray(node) && node.some((v) => typeof v === 'object' && v !== null)) {
    return node.flatMap((v, i) => otherLeaves(v, `${path}[${i}]`, known))
  }
  if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
    return Object.entries(node).flatMap(([key, v]) => otherLeaves(v, path ? `${path}.${key}` : key, known))
  }
  const value = asValues(node)
  return value.length ? [{ path, label: path, value }] : []
}

/**
 * The rendered component as Review lists it: grouped and labelled as in the regular wizard's
 * Review, each row keyed by its create-request path. An empty field is left out unless
 * [keepPaths] names it — a field with a problem or an override needs a row to show it on. A set
 * field the grouping does not know is listed under "Other fields", never dropped.
 */
export function reviewFieldGroups(component: RenderedComponent, keepPaths: readonly string[] = []): ReviewFieldGroup[] {
  const keep = new Set(keepPaths)
  const rows = new Map<string, ReviewField[]>()
  const add = (group: string, row: ReviewField) => rows.set(group, [...(rows.get(group) ?? []), row])
  for (const field of KNOWN) {
    const value = asValues(field.read(component))
    if (value.length || keep.has(field.path)) add(field.group, { path: field.path, label: field.label, value })
    if (field.path === 'baseConfiguration.build.buildTasks') artifactRows(component).forEach((r) => add('Build', r))
  }
  const known = new Set(KNOWN.map((f) => f.path))
  otherLeaves(component, '', known).forEach((r) => add(OTHER, r))
  return [...GROUPS, OTHER].flatMap((heading) => (rows.get(heading) ? [{ heading, rows: rows.get(heading)! }] : []))
}

const LIST_PATHS = new Set(['releaseManager', 'securityChampion', 'labels'])

type Mutable = Record<string, unknown>

function setPath(target: Mutable, path: string, value: unknown) {
  const keys = path.split(/\.|\[(\d+)\]/).filter((k) => k !== undefined && k !== '')
  let node: Mutable = target
  keys.forEach((key, i) => {
    if (i === keys.length - 1) {
      node[key] = value
      return
    }
    const nextIsIndex = /^\d+$/.test(keys[i + 1]!)
    const child = node[key]
    const copy = Array.isArray(child) ? [...child] : child && typeof child === 'object' ? { ...child } : nextIsIndex ? [] : {}
    node[key] = copy
    node = copy as Mutable
  })
}

/**
 * [component] with the creator's edits applied, so an edit can be checked while it is typed,
 * before a dry run has rendered it. [component] itself is not changed.
 */
export function applyOverrides<T extends object>(
  component: T,
  overrides: Readonly<Record<string, readonly string[]>>,
): T {
  const edited = structuredClone(component) as unknown as Mutable
  for (const [path, values] of Object.entries(overrides)) {
    setPath(edited, path, LIST_PATHS.has(path) ? [...values] : (values[0] ?? ''))
  }
  return edited as unknown as T
}
