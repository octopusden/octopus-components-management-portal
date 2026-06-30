import type {
  ArtifactIdMode,
  ArtifactIdRequest,
  BaseConfigurationRequest,
  ComponentCreateRequest,
  ComponentDetail,
  JiraAspect,
} from '../types'
import { selectBaseRow } from '../api/baseRow'
import { groupTokens } from '../artifactOwnership'

// Distribution-coordinate enum for the package family — CRS validatePackageType
// accepts only these (EnumValidValues.kt), so the form constrains them rather
// than free text.
export type PackageType = 'DEB' | 'RPM'

export type CoordinateType = 'maven' | 'docker' | 'package'

// Deprecated build systems are not offered for NEW components (the editor of
// existing components is unaffected).
export const DEPRECATED_BUILD_SYSTEMS: ReadonlySet<string> = new Set(['BS2_0'])

// Legacy EscrowConfigValidator rule: VCS roots are mandatory for every build
// system except these. BS2_0 is listed defensively — it is deprecated and
// filtered out of the create dropdown (legacy demanded a FAKE vcs root for it,
// which the portal never sends).
export const VCS_HIDDEN_BUILD_SYSTEMS: ReadonlySet<string> = new Set([
  'BS2_0',
  'PROVIDED',
  'ESCROW_PROVIDED_MANUALLY',
  'ESCROW_NOT_SUPPORTED',
  'WHISKEY',
])

// An unknown/future build system requires VCS — the legacy "everything else"
// default.
export function vcsBlockApplies(buildSystem: string): boolean {
  return buildSystem !== '' && !VCS_HIDDEN_BUILD_SYSTEMS.has(buildSystem)
}

// component-defaults has no vcs.branch yet (only vcs.tag); until service-config
// grows one, the production-branch prefill falls back here.
export const FALLBACK_VCS_BRANCH = 'master'

export const SSH_VCS_URL_REGEX = /^ssh:\/\/(?:[^@/\s]+@)?[^/\s:]+(?::\d+)?\/\S+$/

// The unified create-form value shape, consumed by both CreateComponentDialog
// modes (scratch / "Create Similar") and mapped to ComponentCreateRequest here.
export interface CreateFormValues {
  name: string
  displayName: string
  buildSystem: string
  componentOwner: string
  distributionExplicit: boolean
  distributionExternal: boolean
  // Required by CRS only when explicit+external; the form gates them behind
  // that combination but always carries the fields.
  releaseManager: string[]
  securityChampion: string[]
  copyright: string
  // BASE jira aspect fields settable at create. jiraProjectKey is unique per component (never
  // copied); versionPrefix defaults to the component key in scratch mode (mirrored in the form).
  jiraProjectKey: string
  versionPrefix: string
  // Jira version-format patterns, prefilled from component-defaults
  // (jira.componentVersionFormat.*) so a new component inherits the configured
  // formats. major/release/build/line live on the BASE jira aspect; hotfix is a
  // top-level component field (jiraHotfixVersionFormat).
  minorVersionFormat: string
  releaseVersionFormat: string
  buildVersionFormat: string
  lineVersionFormat: string
  hotfixVersionFormat: string
  // VCS entry fields, only emitted when vcsBlockApplies(buildSystem). vcsUrl is
  // unique per component (never copied); tag/branch are reusable format
  // patterns prefilled from component-defaults (or the source BASE row in copy
  // mode).
  vcsUrl: string
  vcsTag: string
  vcsBranch: string
  // Exactly one distribution coordinate (more are added later in the
  // Distribution tab). Only emitted when explicit+external.
  coordinate: {
    type: CoordinateType
    groupPattern: string
    artifactPattern: string
    imageName: string
    packageType: PackageType
    packageName: string
  }
  // #357 base artifact-ownership. The dialog offers ALL / ALL_EXCEPT_CLAIMED and
  // EXPLICIT ("Specific artifacts"); multi-group and per-range overrides are added
  // post-create in the editor. An empty group sends no ownership mapping. `tokens`
  // holds the literal artifact IDs and is only meaningful for EXPLICIT.
  ownership: {
    groups: string
    mode: ArtifactIdMode
    tokens: string[]
  }
}

// Builds the POST /components payload for both create modes.
//
// Precedence (copy mode, source present):
//   - form WINS for: name, displayName, buildSystem (baseConfiguration.build),
//     componentOwner, distributionExplicit/External, releaseManager,
//     securityChampion, copyright;
//   - distribution coordinate comes from the FORM ONLY, never from the source
//     (unique per component) — and only when explicit+external;
//   - copied from source: productType, system, clientCode, solution,
//     parentComponentName, labels, docs, securityGroups, releasesInDefaultBranch,
//     jiraHotfixVersionFormat, vcsExternalRegistry, and from the BASE row the
//     escrow aspect, jira aspect (source projectKey stripped — the form supplies jiraProjectKey
//     and versionPrefix, which win), requiredTools, and the build aspect (merged with the form's
//     buildSystem);
//   - required-but-not-copied collections: artifactIds: [], teamcityProjects: [];
//   - never sent: id/version/timestamps/group/canEdit, override rows, vcsEntries,
//     source distribution artifacts, source jira.projectKey, jiraDisplayName.
//
// Scratch mode (no source): source-derived fields fall to their defaults
// (system: null, empty collections, archived: false).

// Strip projectKey (unique per component) and keep the rest of the Jira aspect,
// but only when something meaningful remains — a projectKey-only aspect must
// not turn into `jira: {}` on the new component.
function copyJiraAspect(jira: JiraAspect | null | undefined): JiraAspect | undefined {
  if (!jira) return undefined
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { projectKey, ...rest } = jira
  const hasValue = Object.values(rest).some((v) => v != null)
  return hasValue ? rest : undefined
}

// Maps the form's single coordinate to the matching BASE-row child list. Only
// called when the request is gated (explicit+external).
function coordinatePatch(
  coordinate: CreateFormValues['coordinate'],
): Partial<BaseConfigurationRequest> {
  switch (coordinate.type) {
    case 'maven':
      return {
        mavenArtifacts: [
          {
            groupPattern: coordinate.groupPattern,
            artifactPattern: coordinate.artifactPattern,
            extension: null,
            classifier: null,
          },
        ],
      }
    case 'docker':
      return { dockerImages: [{ imageName: coordinate.imageName, flavor: null }] }
    case 'package':
      return {
        packages: [{ packageType: coordinate.packageType, packageName: coordinate.packageName }],
      }
  }
}

// Maps the dialog's base ownership section to a single base mapping (or none).
function buildCreateOwnership(ownership: CreateFormValues['ownership'] | undefined): ArtifactIdRequest[] {
  const groups = groupTokens(ownership?.groups ?? '')
  if (groups.length === 0) return []
  // Artifact tokens are only meaningful for EXPLICIT ("Specific artifacts"); the
  // catch-all modes always send an empty token list.
  const artifactTokens = ownership!.mode === 'EXPLICIT' ? [...ownership!.tokens] : []
  return [{ versionRange: null, groupPattern: groups.join(','), mode: ownership!.mode, artifactTokens }]
}

// Component-level fields whose presence on create is governed by field-config
// visibility. A hidden/readonly field must NOT be sent on create (matching the
// read-only create form) — including values copied from the source in "Create
// Similar" mode. Keys here are both the request keys and the `component.<field>`
// field-config field names. Structural/required fields (name, componentOwner,
// baseConfiguration, coordinate, archived, collections) are intentionally absent.
const VISIBILITY_GATED_CREATE_FIELDS = [
  'displayName', 'copyright', 'releaseManager', 'securityChampion',
  'distributionExplicit', 'distributionExternal', 'system', 'clientCode',
  'solution', 'productType', 'parentComponentName', 'releasesInDefaultBranch',
  'jiraHotfixVersionFormat', 'vcsExternalRegistry',
] as const

export function buildCreateRequest(
  form: CreateFormValues,
  source?: ComponentDetail,
  // Returns true if a `component.<field>` is editable (i.e. should be sent).
  // Defaults to "everything editable" so existing call-sites/tests are unchanged.
  isFieldEditable: (field: string) => boolean = () => true,
): ComponentCreateRequest {
  const gated = form.distributionExplicit && form.distributionExternal
  const baseRow = source ? selectBaseRow(source) : undefined

  const req: ComponentCreateRequest = {
    name: form.name,
    displayName: form.displayName || undefined,
    componentOwner: form.componentOwner,
    // Source-derived general fields (null/[] defaults in scratch mode).
    productType: source?.productType ?? undefined,
    system: source?.system ?? null,
    clientCode: source?.clientCode ?? undefined,
    solution: source?.solution ?? undefined,
    parentComponentName: source?.parentComponentName ?? undefined,
    archived: false,
    releaseManager: [...form.releaseManager],
    securityChampion: [...form.securityChampion],
    copyright: form.copyright || undefined,
    releasesInDefaultBranch: source?.releasesInDefaultBranch ?? undefined,
    labels: [...(source?.labels ?? [])],
    // Hotfix format is a top-level component field (not on the jira aspect). The
    // form carries it (prefilled from component-defaults / source); a blank clears.
    jiraHotfixVersionFormat: form.hotfixVersionFormat.trim() || undefined,
    vcsExternalRegistry: source?.vcsExternalRegistry ?? undefined,
    distributionExplicit: form.distributionExplicit,
    distributionExternal: form.distributionExternal,
    docs: (source?.docs ?? []).map((d) => ({
      docComponentKey: d.docComponentKey,
      majorVersion: d.majorVersion ?? null,
    })),
    securityGroups: (source?.securityGroups ?? []).map((g) => ({
      groupType: g.groupType,
      groupName: g.groupName,
    })),
    // Base artifact-ownership from the dialog's ownership section (NOT copied from a source —
    // ownership is unique per component). Empty group ⇒ no mapping (server then has none).
    artifactIds: buildCreateOwnership(form.ownership),
    teamcityProjects: [],
  }

  // baseConfiguration is ALWAYS present: the form always supplies buildSystem.
  // In copy mode the build aspect inherits the source's other build fields
  // (e.g. gradleVersion) but the buildSystem comes from the form.
  const baseConfiguration: BaseConfigurationRequest = {
    build: { ...(baseRow?.build ?? {}), buildSystem: form.buildSystem },
  }
  if (baseRow?.escrow) baseConfiguration.escrow = { ...baseRow.escrow }
  // Jira aspect: start from the source's copied aspect (projectKey stripped), then overlay the
  // form's jiraProjectKey + versionPrefix (form wins). Only attach when something is present.
  const jira: JiraAspect = { ...(copyJiraAspect(baseRow?.jira) ?? {}) }
  if (form.jiraProjectKey.trim()) jira.projectKey = form.jiraProjectKey.trim()
  if (form.versionPrefix.trim()) jira.versionPrefix = form.versionPrefix.trim()
  // BASE jira version formats (hotfix is component-level, set above) are fully
  // FORM-DRIVEN — copy mode prefills the form from the source, so assign the
  // trimmed value or DELETE the value inherited from copyJiraAspect. Otherwise
  // clearing a format in "Create Similar" would silently re-send the source value.
  for (const k of ['minorVersionFormat', 'releaseVersionFormat', 'buildVersionFormat', 'lineVersionFormat'] as const) {
    const v = form[k].trim()
    if (v) jira[k] = v
    else delete jira[k]
  }
  if (Object.values(jira).some((v) => v != null)) baseConfiguration.jira = jira
  if (baseRow && baseRow.requiredTools.length > 0) {
    baseConfiguration.requiredTools = [...baseRow.requiredTools]
  }
  // The form's distribution coordinate is only meaningful (and only required)
  // when explicit+external; otherwise no coordinate lists are sent.
  if (gated) Object.assign(baseConfiguration, coordinatePatch(form.coordinate))
  // VCS entry comes from the FORM ONLY (never the source — the repository is
  // unique per component) and only for VCS-requiring build systems.
  if (vcsBlockApplies(form.buildSystem)) {
    baseConfiguration.vcsEntries = [
      {
        vcsPath: form.vcsUrl.trim(),
        tag: form.vcsTag.trim() || undefined,
        branch: form.vcsBranch.trim() || undefined,
      },
    ]
  }

  req.baseConfiguration = baseConfiguration

  // Strip field-config hidden/readonly component fields so a non-editable field
  // is never sent on create — including a value copied from the source. The
  // server then applies its own default, matching the read-only create form.
  for (const field of VISIBILITY_GATED_CREATE_FIELDS) {
    if (!isFieldEditable(field)) delete req[field as keyof ComponentCreateRequest]
  }

  // Drop keys left undefined (scratch mode where the source is absent) so the
  // request omits them entirely — `'productType' in req` stays false and the
  // wire shape means "server default", matching the legacy create payload.
  // `null` values (e.g. system) are intentional and preserved.
  for (const key of Object.keys(req) as (keyof ComponentCreateRequest)[]) {
    if (req[key] === undefined) delete req[key]
  }

  return req
}
