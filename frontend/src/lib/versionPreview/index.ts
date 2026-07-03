import type { ComponentDetail } from '../types'

/**
 * Client-side version-ladder preview (design brief §4, prep §1.5 / §R6-R8).
 *
 * Pure, no CRS dependency: decompose a sample version into positional numeric
 * parts, expand each format template, and (for Jira-facing versions only) wrap
 * with the version prefix. Line and Build render BARE (no prefix); the hotfix
 * format has two usages (bare build version + wrapped Jira version) and is
 * computed from its OWN sample (hotfix versions carry an extra trailing segment,
 * e.g. standard `1.2.3` vs hotfix `1.2.3-187`).
 */

export interface VersionParts {
  major: string
  minor: string
  service: string
  fix: string
  build: string
}

const PART_KEYS = ['major', 'minor', 'service', 'fix', 'build'] as const

/**
 * Split a sample version on runs of non-digits into the five positional parts;
 * any part with no corresponding numeric run defaults to '0'. Leading/trailing
 * non-digits are ignored (`v1.2` → 1,2,0,0,0; `1.2.3-187` → 1,2,3,187,0).
 */
export function parseVersion(sample: string): VersionParts {
  const nums = (sample.match(/\d+/g) ?? [])
  const parts = {} as VersionParts
  PART_KEYS.forEach((key, i) => {
    parts[key] = nums[i] ?? '0'
  })
  return parts
}

// Replace $major/$minor/$service/$fix/$build only when NOT followed by a letter,
// so server-computed variables that share a prefix ($minorC, $serviceC,
// $serviceCBranch) are left verbatim (degrade gracefully) rather than corrupted.
const NUMERIC_VAR = /\$(major|minor|service|fix|build)(?![A-Za-z])/g
// A template is "approximate" when it references the fix/build positions — those
// are CI/build-time values not deterministic from a release sample (brief §4).
const APPROX_VAR = /\$(fix|build)(?![A-Za-z])/

/** Expand a format template's numeric variables against parsed version parts. */
export function expandFormat(template: string, parts: VersionParts): string {
  return template.replace(NUMERIC_VAR, (_, key: keyof VersionParts) => parts[key])
}

const DEFAULT_VERSION_FORMAT = '$versionPrefix-$baseVersionFormat'

/**
 * Wrap a base (already-expanded) value into its Jira-facing form. With a blank
 * prefix, returns the base unchanged (Jira wrapping only applies when a prefix
 * is set). Otherwise expands the version format's $versionPrefix / $baseVersionFormat
 * (falling back to the canonical `$versionPrefix-$baseVersionFormat`).
 */
export function wrapJira(base: string, prefix: string, versionFormat: string): string {
  if (!prefix.trim()) return base
  const template = versionFormat.trim() ? versionFormat : DEFAULT_VERSION_FORMAT
  // Function replacers so a prefix/base containing $&, $$, $1, … is inserted
  // verbatim rather than interpreted as a replacement pattern.
  return template.replace(/\$versionPrefix/g, () => prefix).replace(/\$baseVersionFormat/g, () => base)
}

export interface LadderState {
  /** Sample version for the standard rows (git tag / build). */
  sample: string
  /** Separate sample for the hotfix rows (different arity, e.g. `1.2.3-187`). */
  hotfixSample: string
  versionPrefix: string
  versionFormat: string
  releaseVersionFormat: string
  minorVersionFormat: string
  lineVersionFormat: string
  buildVersionFormat: string
  hotfixVersionFormat: string
  /** Whether hotfix rows are shown (any VCS root has a hotfix branch). */
  hotfixEnabled: boolean
  /** When true, the Release row tracks "SubComponent Fix Version/s" instead. */
  technical?: boolean
}

export interface LadderRow {
  /** Stable row id (also the hover-association key). */
  id: string
  label: string
  /** Computed version string for this row. */
  value: string
  /** Mirror tag when the row derives from another field ("= line format"). */
  tag?: string
  /** Where the value is used, for the row caption. */
  dest: string
  /** True when the driving template references $fix/$build (build-time value). */
  approx: boolean
  /** Field-config path of the field that produced this row (hover link). */
  fieldId: string
}

function isSeparate(value: string, mirrored: string): boolean {
  const v = value.trim()
  return v !== '' && v !== mirrored.trim()
}

/**
 * Build the ordered ladder rows from the current (possibly unsaved) format
 * state. Release/RC/Minor/Hotfix-jira are wrapped with the prefix; Line/Build
 * and Hotfix-build are bare. Minor mirrors Line and Build mirrors Release when
 * not set separately (matching the editor's collapse rule); hotfix rows are
 * computed from `hotfixSample` and only present when `hotfixEnabled`.
 */
export function computeLadder(state: LadderState): LadderRow[] {
  const parts = parseVersion(state.sample)
  const prefix = state.versionPrefix
  const vf = state.versionFormat

  const minorSeparate = isSeparate(state.minorVersionFormat, state.lineVersionFormat)
  const minorTemplate = minorSeparate ? state.minorVersionFormat : state.lineVersionFormat
  // Line is the leading field (Minor derives from it — brief §5 / prep §R6). No
  // reverse line←minor fallback here: it would show a misleading untagged value
  // for the field the redesign presents as authoritative. Editor seeding writes
  // the effective leading value into Line, so it is populated at read time.
  const lineTemplate = state.lineVersionFormat
  const buildSeparate = isSeparate(state.buildVersionFormat, state.releaseVersionFormat)
  const buildTemplate = buildSeparate ? state.buildVersionFormat : state.releaseVersionFormat

  const approx = (template: string) => APPROX_VAR.test(template)

  const releaseValue = wrapJira(expandFormat(state.releaseVersionFormat, parts), prefix, vf)

  const rows: LadderRow[] = [
    {
      id: 'release',
      label: 'Release Version',
      value: releaseValue,
      dest: state.technical ? 'SubComponent Fix Version/s' : 'Fix Version/s',
      approx: approx(state.releaseVersionFormat),
      fieldId: 'jira.releaseVersionFormat',
    },
    {
      id: 'rc',
      label: 'RC Version',
      value: releaseValue === '' ? '_RC' : `${releaseValue}_RC`,
      dest: 'Jira, until the release replaces it',
      approx: approx(state.releaseVersionFormat),
      fieldId: 'jira.releaseVersionFormat',
    },
    {
      id: 'minor',
      label: 'Minor Version',
      value: wrapJira(expandFormat(minorTemplate, parts), prefix, vf),
      tag: minorSeparate ? undefined : '= line format',
      dest: 'Planning in Jira',
      approx: approx(minorTemplate),
      fieldId: minorSeparate ? 'jira.minorVersionFormat' : 'jira.lineVersionFormat',
    },
    {
      id: 'line',
      label: 'Major (Line) Version',
      value: expandFormat(lineTemplate, parts),
      dest: 'CRN report',
      approx: approx(lineTemplate),
      fieldId: 'jira.lineVersionFormat',
    },
    {
      id: 'build',
      label: 'Build Version',
      value: expandFormat(buildTemplate, parts),
      tag: buildSeparate ? undefined : '= release format',
      dest: 'CI builds',
      approx: approx(buildTemplate),
      fieldId: 'jira.buildVersionFormat',
    },
  ]

  if (state.hotfixEnabled) {
    const hotfixParts = parseVersion(state.hotfixSample)
    const hotfixBare = expandFormat(state.hotfixVersionFormat, hotfixParts)
    const hotfixApprox = approx(state.hotfixVersionFormat)
    rows.push(
      {
        id: 'hotfix-build',
        label: 'Hotfix Version',
        value: hotfixBare,
        dest: 'Hotfix build',
        approx: hotfixApprox,
        fieldId: 'jira.hotfixVersionFormat',
      },
      {
        id: 'hotfix-jira',
        label: 'Hotfix Version',
        value: wrapJira(hotfixBare, prefix, vf),
        dest: state.technical ? 'SubComponent Fix Version/s' : 'Fix Version/s',
        approx: hotfixApprox,
        fieldId: 'jira.hotfixVersionFormat',
      },
    )
  }

  return rows
}

/**
 * Hotfixes are enabled ⇔ some VCS entry on any configuration row defines a
 * non-blank hotfix branch (mirrors CRS ComponentHotfixSupportResolver). Derived
 * on the client from the v4 detail response — no extra contract needed.
 */
export function isHotfixEnabled(component: ComponentDetail): boolean {
  return (component.configurations ?? []).some((row) =>
    (row.vcsEntries ?? []).some((e) => (e.hotfixBranch ?? '').trim() !== ''),
  )
}
