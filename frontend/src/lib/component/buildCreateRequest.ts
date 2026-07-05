import type {
  ArtifactIdMode,
  ArtifactIdRequest,
  BaseConfigurationRequest,
  ComponentCreateRequest,
  ComponentDetail,
  JiraAspect,
} from '../types'
import { selectBaseRow } from '../api/baseRow'

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
  // Only settable in the form for an external component (distributionExternal);
  // copyable from the source, not unique. When the external gate is off the form
  // value is ignored and the source value (if any) is preserved.
  clientCode: string
  // BASE jira aspect fields settable at create. jiraProjectKey is unique per component (never
  // copied); versionPrefix defaults to the component key in scratch mode (mirrored in the form).
  jiraProjectKey: string
  versionPrefix: string
  // Jira version-format patterns (BASE jira aspect), prefilled from
  // component-defaults (jira.componentVersionFormat.*) so a new component
  // inherits the configured formats. Line leads its pair (Minor derives from it)
  // and Release leads its pair (Build derives from it). Hotfix Version Format is
  // NOT in the create form — hotfixes are always disabled at creation (no hotfix
  // branch yet, Q8/R9), so a new component never sets a hotfix format.
  minorVersionFormat: string
  releaseVersionFormat: string
  buildVersionFormat: string
  lineVersionFormat: string
  // Mirror flags for the leading/derived pairs (editor JiraTab parity). When a
  // derived field is MIRRORED (flag false), it follows its leading field:
  //   - Minor mirrors Line → materialized into BOTH stored fields at create;
  //   - Build mirrors Release → OMITTED (CRS falls back to Release server-side).
  // SEPARATE (flag true) → the derived field keeps its own value.
  minorSeparate: boolean
  buildSeparate: boolean
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
  // #357 base artifact-ownership. Repeatable per-group rows: each row is one
  // Group ID + its own matching mode (ALL / ALL_EXCEPT_CLAIMED / EXPLICIT) and,
  // for EXPLICIT ("Specific artifacts"), its literal artifact tokens. Each row
  // maps to its own ArtifactIdRequest; per-range overrides are added post-create
  // in the editor. A row with a blank Group ID sends no ownership mapping.
  ownership: Array<{
    groupId: string
    mode: ArtifactIdMode
    tokens: string[]
  }>
  // BASE escrow aspect `generation` (the only escrow field exposed at create).
  // Free-form string carrying an enum value or '' (never blocks submit). Scratch
  // seeds it from componentDefaults.escrow.generation; clone seeds it from the
  // source BASE-row escrow.generation. On submit it overlays `generation` on the
  // escrow aspect (form wins) while the rest of the escrow aspect is copied from
  // the source as before — see buildCreateRequest.
  escrowGeneration: string
}

// Builds the POST /components payload for both create modes.
//
// Precedence (copy mode, source present):
//   - form WINS for: name, displayName, buildSystem (baseConfiguration.build),
//     componentOwner, distributionExplicit/External, releaseManager,
//     securityChampion, copyright;
//   - clientCode: form WINS when external (distributionExternal); when not
//     external the source value is preserved (form value ignored);
//   - distribution coordinate comes from the FORM ONLY, never from the source
//     (unique per component) — and only when explicit+external;
//   - escrow.generation comes from the FORM (form WINS) when that field is
//     editable and a value was chosen; the rest of the escrow aspect is copied
//     from the source BASE row. A non-editable field falls back to the source
//     escrow (form value ignored);
//   - copied from source: productType, system, solution,
//     parentComponentName, labels, docs, securityGroups, releasesInDefaultBranch,
//     jiraHotfixVersionFormat, vcsExternalRegistry, and from the BASE row the
//     escrow aspect (generation overlaid from the form — see above), jira aspect (source projectKey stripped — the form supplies jiraProjectKey
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
  // Strip fields the create form has NO control for so "Create Similar" can't
  // silently carry them from the source (Codex #154 P1):
  //  - projectKey: always component-unique, never copied.
  //  - technical: adminOnly in baseline → a non-admin copy of a technical
  //    component would POST technical and hit the CRS create-rule 403.
  //  - versionFormat: not a create-form field (Q5) → don't leak the source's.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { projectKey, technical, versionFormat, ...rest } = jira
  const hasValue = Object.values(rest).some((v) => v != null)
  return hasValue ? rest : undefined
}

// Maps the form's single coordinate to the matching BASE-row child list. Called
// for a gated (explicit+external) request, and for Docker whenever an image name
// is provided (Docker is not gated — see below).
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

// Maps the dialog's base ownership rows to one base ArtifactIdRequest per row.
// Rows with a blank Group ID are skipped (empty result ⇒ no ownership mapping).
// Artifact tokens are only meaningful for EXPLICIT ("Specific artifacts"); the
// catch-all modes always send an empty token list.
function buildCreateOwnership(rows: CreateFormValues['ownership'] | undefined): ArtifactIdRequest[] {
  return (rows ?? [])
    .filter((row) => row.groupId.trim() !== '')
    .map((row) => ({
      versionRange: null,
      groupPattern: row.groupId.trim(),
      mode: row.mode,
      artifactTokens: row.mode === 'EXPLICIT' ? [...row.tokens] : [],
    }))
}

// Component-level fields whose presence on create is governed by field-config
// visibility. A hidden/readonly field must NOT be sent on create (matching the
// read-only create form) — including values copied from the source in "Create
// Similar" mode. Keys here are both the request keys and the `component.<field>`
// field-config field names — EXCEPT `systems`, whose FC key is the singular
// `component.system` (see the fcField mapping in the strip loop below).
// Structural/required fields (name, componentOwner,
// baseConfiguration, coordinate, archived, collections) are intentionally absent.
const VISIBILITY_GATED_CREATE_FIELDS = [
  'displayName', 'copyright', 'releaseManager', 'securityChampion',
  'distributionExplicit', 'distributionExternal', 'systems', 'clientCode',
  'solution', 'productType', 'parentComponentName', 'releasesInDefaultBranch',
  'vcsExternalRegistry',
] as const

export function buildCreateRequest(
  form: CreateFormValues,
  source?: ComponentDetail,
  // Returns true if a `component.<field>` is editable (i.e. should be sent).
  // Defaults to "everything editable" so existing call-sites/tests are unchanged.
  isFieldEditable: (field: string) => boolean = () => true,
  // Editability of the nested `escrow.generation` field. It is NOT a top-level
  // `component.<field>`, so it is gated separately from `isFieldEditable` (whose
  // callers prefix `component.`). When false the form generation is ignored and
  // the source escrow (if any) is preserved unchanged.
  escrowGenerationEditable = true,
): ComponentCreateRequest {
  const gated = form.distributionExplicit && form.distributionExternal
  const baseRow = source ? selectBaseRow(source) : undefined

  const req: ComponentCreateRequest = {
    name: form.name,
    displayName: form.displayName || undefined,
    componentOwner: form.componentOwner,
    // Source-derived general fields (null/[] defaults in scratch mode).
    productType: source?.productType ?? undefined,
    systems: source?.systems ?? [],
    // clientCode is a General-step field for external components: the form wins
    // when external, otherwise the source value is preserved (non-external clone
    // semantics unchanged). A hidden/readonly field is stripped below regardless.
    clientCode: form.distributionExternal
      ? form.clientCode || undefined
      : (source?.clientCode ?? undefined),
    solution: source?.solution ?? undefined,
    parentComponentName: source?.parentComponentName ?? undefined,
    archived: false,
    releaseManager: [...form.releaseManager],
    securityChampion: [...form.securityChampion],
    copyright: form.copyright || undefined,
    releasesInDefaultBranch: source?.releasesInDefaultBranch ?? undefined,
    labels: [...(source?.labels ?? [])],
    // jiraHotfixVersionFormat is intentionally never set on create: the create
    // form has no Hotfix Version Format field (hotfixes are always disabled at
    // creation — no hotfix branch yet), so it is left to the server default and
    // configured later in the editor once a hotfix branch exists.
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
  // Escrow aspect: copied from the source BASE row (clone), with the form's
  // `generation` overlaid when the escrow.generation field is editable and a
  // value was chosen (form WINS). The rest of the escrow aspect is preserved as
  // copied. When the field is not editable, the form value is ignored and the
  // source escrow (if any) is preserved unchanged. An empty generation with no
  // source escrow creates no escrow object.
  const escrowGeneration = escrowGenerationEditable ? form.escrowGeneration.trim() : ''
  if (baseRow?.escrow || escrowGeneration) {
    baseConfiguration.escrow = {
      ...(baseRow?.escrow ?? {}),
      ...(escrowGeneration ? { generation: escrowGeneration } : {}),
    }
  }
  // Jira aspect: start from the source's copied aspect (projectKey stripped), then overlay the
  // form's jiraProjectKey + versionPrefix (form wins). Only attach when something is present.
  const jira: JiraAspect = { ...(copyJiraAspect(baseRow?.jira) ?? {}) }
  if (form.jiraProjectKey.trim()) jira.projectKey = form.jiraProjectKey.trim()
  if (form.versionPrefix.trim()) jira.versionPrefix = form.versionPrefix.trim()
  // BASE jira version formats are fully FORM-DRIVEN — copy mode prefills the form
  // from the source, so assign the trimmed value or DELETE the value inherited
  // from copyJiraAspect. Otherwise clearing a format in "Create Similar" would
  // silently re-send the source value. Leading/derived materialization (prep §R6):
  //   - Minor MIRRORED → write the Line value into BOTH lineVersionFormat and
  //     minorVersionFormat (CRS/releng-lib's fallback direction is the reverse,
  //     line ?? minor, so the copy must be materialized, not derived);
  //   - Build MIRRORED → OMIT buildVersionFormat entirely (CRS falls back to
  //     Release server-side — the honest fallback, no materialization needed).
  const line = form.lineVersionFormat.trim()
  const minor = (form.minorSeparate ? form.minorVersionFormat : form.lineVersionFormat).trim()
  const release = form.releaseVersionFormat.trim()
  const build = form.buildSeparate ? form.buildVersionFormat.trim() : ''
  const assignOrDelete = (
    k: 'lineVersionFormat' | 'minorVersionFormat' | 'releaseVersionFormat' | 'buildVersionFormat',
    v: string,
  ) => {
    if (v) jira[k] = v
    else delete jira[k]
  }
  assignOrDelete('lineVersionFormat', line)
  assignOrDelete('minorVersionFormat', minor)
  assignOrDelete('releaseVersionFormat', release)
  assignOrDelete('buildVersionFormat', build)
  if (Object.values(jira).some((v) => v != null)) baseConfiguration.jira = jira
  if (baseRow && baseRow.requiredTools.length > 0) {
    baseConfiguration.requiredTools = [...baseRow.requiredTools]
  }
  // Docker is sent whenever an image name is provided, regardless of the
  // explicit+external gate (a Docker image can be published outside that
  // combination). Maven/Package coordinates stay gated — they are only
  // meaningful (and only required) for an explicit+external component.
  if (form.coordinate.type === 'docker') {
    if (form.coordinate.imageName.trim()) {
      Object.assign(baseConfiguration, coordinatePatch(form.coordinate))
    }
  } else if (gated) {
    Object.assign(baseConfiguration, coordinatePatch(form.coordinate))
  }
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
    // The `systems` request key maps to the field-config key `component.system`
    // (the API field was pluralized without renaming the FC key, which stays
    // singular in both CRS and Portal). Every other field's request key and FC
    // field name coincide.
    const fcField = field === 'systems' ? 'system' : field
    if (!isFieldEditable(fcField)) delete req[field as keyof ComponentCreateRequest]
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
