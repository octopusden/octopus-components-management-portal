import type {
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
//     escrow aspect, jira aspect (without projectKey), requiredTools, and the
//     build aspect (merged with the form's buildSystem);
//   - required-but-not-copied collections: artifactIds: [], teamcityProjects: [];
//   - never sent: id/version/timestamps/group/canEdit, override rows, vcsEntries,
//     source distribution artifacts, jira.projectKey, jiraDisplayName.
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
    jiraHotfixVersionFormat: source?.jiraHotfixVersionFormat ?? undefined,
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
    // Required by the create contract but intentionally NOT copied (unique
    // per component): explicit empty lists.
    artifactIds: [],
    teamcityProjects: [],
  }

  // baseConfiguration is ALWAYS present: the form always supplies buildSystem.
  // In copy mode the build aspect inherits the source's other build fields
  // (e.g. gradleVersion) but the buildSystem comes from the form.
  const baseConfiguration: BaseConfigurationRequest = {
    build: { ...(baseRow?.build ?? {}), buildSystem: form.buildSystem },
  }
  if (baseRow?.escrow) baseConfiguration.escrow = { ...baseRow.escrow }
  const jira = copyJiraAspect(baseRow?.jira)
  if (jira) baseConfiguration.jira = jira
  if (baseRow && baseRow.requiredTools.length > 0) {
    baseConfiguration.requiredTools = [...baseRow.requiredTools]
  }
  // The form's distribution coordinate is only meaningful (and only required)
  // when explicit+external; otherwise no coordinate lists are sent.
  if (gated) Object.assign(baseConfiguration, coordinatePatch(form.coordinate))

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
