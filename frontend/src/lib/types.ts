// Hand-mirrored from the CRS v4 wire contract (see `schema.d.ts` for the
// generated OpenAPI types). Kept hand-written until the codegen migration
// retires this file or reduces it to a thin re-export layer; until then
// this is the source of truth for what crosses the wire and ships with
// the drift gate in `npm run generate-types:check`.

// ---------------------------------------------------------------------------
// Component list & detail
// ---------------------------------------------------------------------------

export interface ComponentSummary {
  id: string
  name: string
  // Nullable + unique server-side. Stored verbatim from the DSL (no key backfill), so it is
  // null when the component declares no componentDisplayName (preserves the legacy $.name wire).
  displayName: string | null
  componentOwner: string | null
  // A component may belong to several systems (component_systems junction).
  // The list page renders these as chips (see labels).
  systems: string[]
  productType: string | null
  archived: boolean
  // Whether this component may be referenced as a parent (parent-picker
  // eligibility — NOT an aggregator, which is a `components { }` owner). Drives
  // the parent picker filter. Optional on the TS type so existing fixtures
  // need not set it; the server always emits it (default false).
  canBeParent?: boolean
  updatedAt: string | null
  // Required on the wire per ComponentSummaryResponse — server emits []
  // for empty, never omits the key. Matches ComponentDetail.labels.
  labels: string[]
  // People aspects surfaced on the list row (CRS Health/redesign API). Server
  // emits [] for empty, never omits the key — same treatment as `labels`. Drive
  // the Health page's people breakdowns cross-reference and any future list
  // columns.
  releaseManagers?: string[]
  securityChampions?: string[]
  // SYS-040 list-view extras — derived by the v4 mapper from the BASE
  // configuration row + first child (sort_order = 0); blank strings normalized to null.
  buildSystem?: string | null
  javaVersion?: string | null
  jiraProjectKey?: string | null
  vcsPath?: string | null
  teamcityProjectId?: string | null
  teamcityProjectUrl?: string | null
}

export interface ComponentDetail {
  id: string
  name: string
  // Nullable + unique server-side. Stored verbatim from the DSL (no key backfill), so it is
  // null when the component declares no componentDisplayName (preserves the legacy $.name wire).
  // Required only for explicit+external components (server-enforced).
  displayName: string | null
  componentOwner: string | null
  productType: string | null
  // A component may belong to several systems (component_systems junction).
  // The editor renders a multi-select (see labels).
  systems: string[]
  clientCode: string | null
  archived: boolean
  solution: boolean | null
  parentComponentName: string | null
  // Whether this component may itself be a parent. Editable (CAN_BE_PARENT
  // switch); a component with canBeParent=true may not have a parent.
  canBeParent?: boolean
  version: number
  createdAt: string | null
  updatedAt: string | null
  // Optional last-modifier username. Absent against backends that don't surface
  // it; the detail header's "Updated <date> by <user>" subline shows the "by
  // <user>" segment only when this is present.
  updatedBy?: string | null
  // SYS-039 — releaseManager / securityChampion are now ordered multi-value
  // lists (CRS v4 ordered child rows). componentOwner stays single-value.
  // The server emits [] for empty, never omits the key (default emptyList()).
  releaseManager?: string[]
  securityChampion?: string[]
  copyright?: string | null
  releasesInDefaultBranch?: boolean | null
  labels: string[]
  // schema-v2 flat per-component scalars
  jiraDisplayName?: string | null
  jiraHotfixVersionFormat?: string | null
  vcsExternalRegistry?: string | null
  // Dedicated boolean replacing the legacy externalRegistry="NOT_AVAILABLE"
  // sentinel (CRS-C). PATCH: null/absent = no-op; must be false for WHISKEY.
  skipCommitCheck?: boolean | null
  distributionExplicit?: boolean | null
  distributionExternal?: boolean | null
  // schema-v2 per-component child rows. The five list fields are required
  // on the wire (ComponentDetailResponse.required in CRS v4 OpenAPI); the
  // server emits [] for empty, never omits the key. Treating them as
  // non-optional here makes a malformed response fail loudly at the call
  // site instead of silently rendering an empty editor.
  group?: ComponentGroup | null
  docs: DocLink[]
  artifactIds: ArtifactId[]
  securityGroups: SecurityGroup[]
  teamcityProjects: TeamcityProject[]
  // schema-v2 flat configuration rows (one BASE + N override rows)
  configurations: ComponentConfiguration[]
  // Per-user affordance from CRS: true when the CURRENT user may edit this
  // component (is its componentOwner / releaseManager / securityChampion, or an
  // admin). Optional — absent against an older backend, in which case the UI
  // falls back to the global CREATE_COMPONENTS permission check.
  canEdit?: boolean
}

/**
 * The people who may edit a component, from `GET /components/{id}/editors`. Read-only
 * informational projection (owner + ordered release managers + security champions +
 * the owner's manager). Administrators may also edit any component but are, unlike the
 * manager, not enumerated here (an open-ended realm-role, not per-component data).
 */
export interface ComponentEditors {
  componentOwner: string | null
  releaseManagers: string[]
  securityChampions: string[]
  manager: string | null
}

// ---------------------------------------------------------------------------
// Configuration rows (BASE + SCALAR_OVERRIDE + MARKER)
// ---------------------------------------------------------------------------

export type ConfigurationRowType = 'BASE' | 'SCALAR_OVERRIDE' | 'MARKER'

export interface ComponentConfiguration {
  id: string
  versionRange: string
  rowType: ConfigurationRowType
  overriddenAttribute: string | null
  isSyntheticBase: boolean
  build?: BuildAspect | null
  escrow?: EscrowAspect | null
  jira?: JiraAspect | null
  vcsEntries: VcsEntry[]
  mavenArtifacts: MavenArtifact[]
  fileUrlArtifacts: FileUrlArtifact[]
  dockerImages: DockerImage[]
  packages: PackageEntry[]
  requiredTools: string[]
}

// ---------------------------------------------------------------------------
// Aspects (read shape — same fields are reused for the write shape)
// ---------------------------------------------------------------------------

export interface BuildAspect {
  buildSystem?: string | null
  javaVersion?: string | null
  mavenVersion?: string | null
  gradleVersion?: string | null
  buildFilePath?: string | null
  deprecated?: boolean | null
  requiredProject?: boolean | null
  projectVersion?: string | null
  systemProperties?: string | null
  buildTasks?: string | null
}

export interface EscrowAspect {
  providedDependencies?: string | null
  reusable?: boolean | null
  generation?: string | null
  diskSpace?: string | null
  additionalSources?: string | null
  gradleIncludeConfigurations?: string | null
  gradleExcludeConfigurations?: string | null
  gradleIncludeTestConfigurations?: boolean | null
}

export interface JiraAspect {
  projectKey?: string | null
  technical?: boolean | null
  minorVersionFormat?: string | null
  releaseVersionFormat?: string | null
  buildVersionFormat?: string | null
  lineVersionFormat?: string | null
  versionPrefix?: string | null
  versionFormat?: string | null
}

// ---------------------------------------------------------------------------
// Per-family child rows on a configuration row (Response)
// ---------------------------------------------------------------------------

export interface VcsEntry {
  id: string
  name?: string | null
  vcsPath: string
  branch?: string | null
  tag?: string | null
  hotfixBranch?: string | null
  repositoryType?: string | null
  sortOrder: number
}

export interface MavenArtifact {
  id: string
  groupPattern: string
  artifactPattern: string
  extension?: string | null
  classifier?: string | null
  sortOrder: number
}

export interface FileUrlArtifact {
  id: string
  url: string
  artifactId?: string | null
  classifier?: string | null
  sortOrder: number
}

export interface DockerImage {
  id: string
  imageName: string
  flavor?: string | null
  sortOrder: number
}

// `Package` collides with the built-in DOM/Node `Package` type in some
// TypeScript lib configurations; aliased to `PackageEntry` to avoid that.
// On the wire the field is still `packages: PackageResponse`.
export interface PackageEntry {
  id: string
  packageType: string
  packageName: string
  sortOrder: number
}

// ---------------------------------------------------------------------------
// Per-component child rows (Response)
// ---------------------------------------------------------------------------

export type ComponentGroupRole = 'AGGREGATOR' | 'MEMBER'

export interface ComponentGroup {
  groupKey: string
  isFake: boolean
  role: ComponentGroupRole
}

export interface DocLink {
  id: string
  docComponentKey: string
  majorVersion?: string | null
  sortOrder: number
}

/**
 * Artifact-ID ownership mode (#357). EXPLICIT = owns exactly the listed literal
 * tokens; ALL_EXCEPT_CLAIMED = catch-all that yields to other components' EXPLICIT
 * claims (single-group); ALL = owns every artifact under the group(s).
 */
export type ArtifactIdMode = 'EXPLICIT' | 'ALL_EXCEPT_CLAIMED' | 'ALL'

export interface ArtifactId {
  id: string
  /** `null`/ALL_VERSIONS for the base mapping; otherwise a per-range override. */
  versionRange?: string | null
  groupPattern: string
  mode: ArtifactIdMode
  artifactTokens: string[]
  /** Server-computed legacy v1–v3 `artifactIdPattern` (read-only, for preview). */
  legacyArtifactIdPattern?: string | null
}

export interface SecurityGroup {
  id: string
  groupType: string
  groupName: string
}

export interface TeamcityProject {
  id: string
  projectId: string
  projectUrl?: string | null
  sortOrder: number
  projectVersion?: string | null
  validations: TeamcityValidation[]
}

export interface TeamcityValidation {
  type: string
  status: string
  message?: string | null
  updatedAt: string
}

export interface TeamcityValidationSummary {
  byStatus: Record<string, number>
  byType: Record<string, number>
  componentsWithIssues: number
  findings: number
}

export interface TeamcityValidationRow {
  componentId: string
  componentName: string
  message: string
  projectId: string
  status: string
  type: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Write side — Request shapes (no `id`, no `sortOrder`)
// ---------------------------------------------------------------------------

export interface VcsEntryRequest {
  name?: string | null
  vcsPath: string
  branch?: string | null
  tag?: string | null
  hotfixBranch?: string | null
  repositoryType?: string | null
}

export interface MavenArtifactRequest {
  groupPattern: string
  artifactPattern: string
  extension?: string | null
  classifier?: string | null
}

export interface FileUrlArtifactRequest {
  url: string
  artifactId?: string | null
  classifier?: string | null
}

export interface DockerImageRequest {
  imageName: string
  flavor?: string | null
}

export interface PackageRequest {
  packageType: string
  packageName: string
}

export interface ComponentGroupRequest {
  groupKey: string
  isFake?: boolean
}

export interface DocLinkRequest {
  docComponentKey: string
  majorVersion?: string | null
}

export interface ArtifactIdRequest {
  /** Omit/`null` for the base mapping; else an existing configuration range. */
  versionRange?: string | null
  groupPattern: string
  /** Omit to let the server default (ALL when tokenless, else EXPLICIT). */
  mode?: ArtifactIdMode
  artifactTokens: string[]
}

export interface SecurityGroupRequest {
  groupType: string
  groupName: string
}

export interface TeamcityProjectRequest {
  projectId: string
}

// Patch / create body for the BASE row. `null` scalar fields preserve on
// update (JSON merge-patch); present child lists REPLACE. On create,
// `versionRange` defaults server-side to `(,0),[0,)` when missing.
export interface BaseConfigurationRequest {
  versionRange?: string | null
  build?: BuildAspect | null
  escrow?: EscrowAspect | null
  jira?: JiraAspect | null
  vcsEntries?: VcsEntryRequest[] | null
  mavenArtifacts?: MavenArtifactRequest[] | null
  fileUrlArtifacts?: FileUrlArtifactRequest[] | null
  dockerImages?: DockerImageRequest[] | null
  packages?: PackageRequest[] | null
  requiredTools?: string[] | null
}

// ---------------------------------------------------------------------------
// Component Create / Update request bodies
// ---------------------------------------------------------------------------

export interface ComponentCreateRequest {
  name: string
  displayName?: string | null
  componentOwner?: string | null
  productType?: string | null
  // Multi-value system membership; omit to leave unset on create.
  systems?: string[]
  clientCode?: string | null
  solution?: boolean | null
  parentComponentName?: string | null
  archived?: boolean
  // Ordered multi-value lists on create. The CRS ComponentCreateRequest
  // defaults them to emptyList(), so the field is optional here — the create
  // dialog omits it entirely (people are added later via the editor).
  releaseManager?: string[]
  securityChampion?: string[]
  copyright?: string | null
  releasesInDefaultBranch?: boolean | null
  labels?: string[]
  jiraDisplayName?: string | null
  jiraHotfixVersionFormat?: string | null
  vcsExternalRegistry?: string | null
  // Dedicated boolean replacing the legacy externalRegistry="NOT_AVAILABLE"
  // sentinel (CRS-C). PATCH: null/absent = no-op; must be false for WHISKEY.
  skipCommitCheck?: boolean | null
  distributionExplicit?: boolean | null
  distributionExternal?: boolean | null
  group?: ComponentGroupRequest | null
  docs?: DocLinkRequest[]
  artifactIds?: ArtifactIdRequest[]
  securityGroups?: SecurityGroupRequest[]
  teamcityProjects?: TeamcityProjectRequest[]
  baseConfiguration?: BaseConfigurationRequest | null
  // Change metadata recorded on the audit row (not on the component). Both
  // optional; the Jira key, when non-blank, must match a Jira key (see
  // lib/editor/jiraKey). Send a trimmed value or omit — never an empty string.
  jiraTaskKey?: string | null
  changeComment?: string | null
}

// JSON Merge Patch semantics: null scalar = "don't touch"; present collection
// = REPLACE. NOTE (R1): `group` / `clearGroup` are kept on the wire for backward
// compatibility but are accepted-and-IGNORED by the API — a group is
// migration-owned aggregator membership and is never modified via PATCH.
export interface ComponentUpdateRequest {
  version: number
  name?: string | null
  displayName?: string | null
  componentOwner?: string | null
  productType?: string | null
  // Multi-value system membership. PATCH semantics — omit to keep server
  // value, set a (possibly empty) array to REPLACE (empty clears all).
  systems?: string[]
  clientCode?: string | null
  solution?: boolean | null
  parentComponentName?: string | null
  // canBeParent: editable flag. clearParent: explicit parent removal —
  // `parentComponentName: null` reads as "don't touch" server-side, so clearing
  // a parent (e.g. remediating a grandfathered parent-of-parent) needs its own flag.
  canBeParent?: boolean | null
  clearParent?: boolean
  archived?: boolean | null
  // PATCH semantics mirror `labels`: omit / null = don't touch; a provided
  // ordered list (including empty [] = clear) REPLACES the whole list.
  releaseManager?: string[] | null
  securityChampion?: string[] | null
  copyright?: string | null
  releasesInDefaultBranch?: boolean | null
  labels?: string[] | null
  jiraDisplayName?: string | null
  jiraHotfixVersionFormat?: string | null
  vcsExternalRegistry?: string | null
  // Dedicated boolean replacing the legacy externalRegistry="NOT_AVAILABLE"
  // sentinel (CRS-C). PATCH: null/absent = no-op; must be false for WHISKEY.
  skipCommitCheck?: boolean | null
  distributionExplicit?: boolean | null
  distributionExternal?: boolean | null
  // R1: `group` and `clearGroup` are accepted-and-IGNORED by the API (a group is
  // migration-owned, never modified via PATCH). Kept on the wire for backward
  // compatibility; `clearGroup` stays required in the CRS v4 OpenAPI, so the save
  // handlers still send `clearGroup: false`.
  group?: ComponentGroupRequest | null
  clearGroup: boolean
  docs?: DocLinkRequest[] | null
  artifactIds?: ArtifactIdRequest[] | null
  securityGroups?: SecurityGroupRequest[] | null
  teamcityProjects?: TeamcityProjectRequest[] | null
  baseConfiguration?: BaseConfigurationRequest | null
  // Item D: field overrides ride the component PATCH as a desired-FULL-SET.
  // omit / null = don't touch overrides; a provided list is the complete set of
  // V4-editable overrides (upsert by id, create id-less entries, delete any
  // existing editable override not in the list), applied in the same transaction.
  fieldOverrides?: FieldOverrideUpsert[] | null
  // Change metadata recorded on the audit row (not on the component); not part
  // of the component's patchable state. Both optional; the Jira key, when
  // non-blank, must match a Jira key (see lib/editor/jiraKey). Send a trimmed
  // value or omit — never an empty string.
  jiraTaskKey?: string | null
  changeComment?: string | null
}

// ---------------------------------------------------------------------------
// Filters, paging, audit log
// ---------------------------------------------------------------------------

export interface ComponentFilter {
  // Wire query param stays `?system=` (CRS ComponentControllerV4.kt:65 — the
  // filter param did NOT rename even though the DTO field did).
  /** Exact-match OR across values (components can belong to multiple systems via systemJunctions). CSV on the wire. */
  system?: string[]
  archived?: boolean
  search?: string
  /**
   * Server-side exact-match filter on `componentOwner`. Sourced from
   * `/components/meta/owners` for the autocomplete picker. SYS-035.
   */
  /** Exact-match OR across values (each component has exactly one componentOwner). CSV on the wire. */
  owner?: string[]
  /** Exact-match OR across values (a component may have several release managers). CSV on the wire. */
  releaseManager?: string[]
  /** Exact-match OR across values (a component may have several security champions). CSV on the wire. */
  securityChampion?: string[]
  /** Exact-match OR across values (a component has exactly one buildSystem). CSV on the wire. */
  buildSystem?: string[]
  /** Exact-match AND across values; sourced from /components/meta/labels. CSV on the wire. */
  labels?: string[]
  /** Filter on the `canBeParent` flag — the parent picker passes `true`. */
  canBeParent?: boolean
  // ── Extended-search filters (back the list-page "extended search" mode; each
  //    maps to a CRS v4 query param). clientCode / jiraProjectKey /
  //    parentComponentName / groupKey are multi-value exact-IN (SYS-046, CSV on
  //    the wire, sourced from the matching /components/meta/* dropdown); the
  //    rest stay single-value. ──
  /** Exact-match OR across values; sourced from /components/meta/client-codes. CSV on the wire. */
  clientCode?: string[]
  solution?: boolean
  /** Exact-match OR across BASE-row values; sourced from /components/meta/jira-project-keys. CSV on the wire. */
  jiraProjectKey?: string[]
  /** Exact-match OR across BASE-row values (a component has one BASE javaVersion); sourced from /components/meta/java-versions. CSV on the wire. */
  javaVersion?: string[]
  jiraTechnical?: boolean
  vcsPath?: string
  productionBranch?: string
  /** Exact-match OR across values; sourced from /components/meta/parent-component-names. CSV on the wire. */
  parentComponentName?: string[]
  /** Exact-match OR across values; sourced from /components/meta/group-keys. CSV on the wire. */
  groupKey?: string[]
  // Distribution boolean filters (SYS-045). `=false` matches only rows explicitly
  // set false — rows where the column is NULL (never set) are excluded server-side.
  distributionExplicit?: boolean
  distributionExternal?: boolean
}

export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
  first: boolean
  last: boolean
}

export interface AuditLogEntry {
  id: number
  entityType: string
  entityId: string
  // Server-resolved, human-readable component key (CRS AuditLogResponse.
  // componentKey). Authoritative because field-override and git-history
  // (MIGRATED) snapshots don't carry the key under a uniform field — the
  // former carries none, the latter uses `moduleName`. Optional so the portal
  // tolerates older payloads / a CRS deployed before this field lands; the
  // table falls back to the value-snapshot name and finally the entityId UUID.
  componentKey?: string | null
  action: string
  changedBy: string | null
  changedAt: string
  // Pre-schema-v2 audit rows carry the OLD DTO shape (`system`, `metadata`,
  // `buildConfigurations[]`, …) indefinitely; keep these as opaque records
  // and render them as raw JSON in the diff viewer. Do NOT add typed
  // field-name resolution here — it would misrender pre-migration entries.
  oldValue: Record<string, unknown> | null
  newValue: Record<string, unknown> | null
  changeDiff: Record<string, unknown> | null
  correlationId: string | null
  // Change metadata captured at save time (CRS AuditLogResponse). Optional so
  // the portal tolerates older rows / a CRS deployed before this field landed.
  jiraTaskKey?: string | null
  changeComment?: string | null
}

// ---------------------------------------------------------------------------
// Field overrides (renamed in schema-v2)
// ---------------------------------------------------------------------------

// Tagged-union by `overriddenAttribute`:
//  - scalar override → `value` is a JSON primitive; `markerChildren` is null
//  - marker override → `markerChildren` carries the replacement child list;
//    `value` is null. Marker names: `vcs.settings`, `distribution.maven`,
//    `distribution.fileUrl`, `distribution.docker`, `distribution.packages`,
//    `build.requiredTools`. NO per-component lists (docs/artifactIds/
//    securityGroups/teamcityProjects/group) are marker-overridable.
export interface MarkerChildrenPayload {
  vcsEntries?: VcsEntryRequest[] | null
  mavenArtifacts?: MavenArtifactRequest[] | null
  fileUrlArtifacts?: FileUrlArtifactRequest[] | null
  dockerImages?: DockerImageRequest[] | null
  packages?: PackageRequest[] | null
  requiredTools?: string[] | null
}

export interface FieldOverride {
  id: string
  overriddenAttribute: string
  versionRange: string
  rowType: ConfigurationRowType
  value?: unknown
  markerChildren?: MarkerChildrenPayload | null
  createdAt: string | null
  updatedAt: string | null
}

// One entry of the desired-FULL-SET sent in ComponentUpdateRequest.fieldOverrides
// (item D). Mirrors CRS FieldOverrideUpsertRequest: omit `id` to create, provide
// it to upsert; value (scalar) XOR markerChildren (marker) carry the row's state.
export interface FieldOverrideUpsert {
  id?: string
  overriddenAttribute: string
  versionRange: string
  // Widened to `unknown` (scalar overrides send string/number/boolean). The
  // generated schema.d.ts types this `Record<string, never>` because CRS
  // declares `value` as a bare `object` in the v4 OpenAPI — same as
  // FieldOverrideCreateBody.value. Fixing the CRS schema (free-form / scalar
  // union) is a follow-up; the hand-mirror stays correct at runtime.
  value?: unknown
  markerChildren?: MarkerChildrenPayload | null
}

// Supported versions (coverage) — the decoupled-version-model layer 1 (ADR-018).
// `all = true` ⇔ the component is defined for every version (no bounded coverage rows);
// otherwise `supported = ∪ ranges`. `warnings` carries non-blocking advisories from a PUT.
export interface SupportedVersionsResponse {
  all: boolean
  ranges: string[]
  warnings: string[]
}

// Declarative replacement: send `all: true` (or an empty `ranges`) for all-versions coverage,
// else the desired non-overlapping set of supported ranges. This is the type the PUT hook
// actually uses (the vendored schema.d.ts is a separate re-export) — keep it aligned with the
// endpoint contract.
export interface SupportedVersionsRequest {
  all?: boolean
  ranges?: string[]
  // Optional change metadata recorded on the audit row (not on the component),
  // mirroring the component create/update requests. See CRS SupportedVersionsRequest.
  jiraTaskKey?: string
  changeComment?: string
}

// ---------------------------------------------------------------------------
// Portal-side runtime config and info endpoints (unchanged)
// ---------------------------------------------------------------------------

// /portal/links returns the LinksResponse Kotlin data class directly — flat
// JSON, not wrapped in a `links` envelope. Each key is optional because
// Jackson omits unconfigured (null) properties from the response: a portal
// with no PORTAL_LINKS_*_BASE_URL env vars set returns an empty `{}`. Code
// reading these fields must tolerate `undefined` (key absent) AND `null`
// (key present with null value, possible if the serializer config changes).
export interface PortalLinks {
  jiraBaseUrl?: string | null
  gitBaseUrl?: string | null
  tcBaseUrl?: string | null
  dmsBaseUrl?: string | null
}

export interface PortalInfo {
  name: string
  version: string
  // Omitted by the backend (NON_NULL) when PORTAL_ENVIRONMENT_LABEL is unset —
  // tolerate both absent key and null, like PortalLinks above.
  environmentLabel?: string | null
}

// /portal/config — component-editor knobs. `solutionKeyPatterns` are substrings
// that mark a component key as a solution candidate: only those components show
// the dedicated Solution topic/tab with its toggle. The backend always emits the key
// (empty array = no component offers the toggle), but tolerate absence anyway.
export interface PortalConfig {
  solutionKeyPatterns?: string[]
  // Onboarding-video availability. Quad-state (not a bare boolean) so the SPA can
  // distinguish "off forever" (disabled/failed → stop polling) from "still cloning"
  // (loading → keep polling until ready/failed). Only `ready` shows the video button.
  onboardingVideoStatus?: 'disabled' | 'loading' | 'ready' | 'failed'
  onboardingVideoHasPoster?: boolean
}

export interface CrsInfo {
  name: string
  version: string
}

// ---------------------------------------------------------------------------
// Validation Problems (Portal-side aggregator facility)
// ---------------------------------------------------------------------------
//
// Hand-mirrored from the Portal backend `/portal/validation/**` wire contract
// (PR #109). These endpoints are NOT part of the CRS v4 surface — they are
// produced by Portal's ValidationController, so they are not covered by the
// generated schema.d.ts drift gate. The facility is generic/extensible: a
// component carries an open-ended list of `problems`, each tagged by `type`.
// The first (and currently only) problem type is UNREGISTERED_RELEASED_VERSIONS.

// Open string-union rather than a closed enum: the backend can add new problem
// kinds before the SPA is updated. Code that switches on `type` must tolerate
// an unknown value (render a generic problem rather than crash).
export type ValidationProblemType = 'UNREGISTERED_RELEASED_VERSIONS' | (string & {})

export type ValidationSeverity = 'ERROR' | 'WARNING'

export interface ValidationProblem {
  type: ValidationProblemType
  severity: ValidationSeverity
  // Short human-readable summary, e.g. "3 released version(s) not registered ...".
  message: string
  // Type-specific payload. For UNREGISTERED_RELEASED_VERSIONS the backend emits
  // { versions: string[], missingCount: number, releasedCount: number }. Kept as
  // an open record so new problem types don't force a type change here; callers
  // read the keys they know about defensively.
  details: Record<string, unknown>
}

export interface ComponentValidation {
  // CRS component id / key (matches ComponentSummary.name on the list page).
  component: string
  problems: ValidationProblem[]
  // A validator/client error — NOT a clean pass. The component was NOT confirmed
  // clean; we failed to check it. `problemsOnly=true` keeps these rows.
  checkFailed: boolean
  // Short reason when checkFailed is true.
  checkError: string | null
}

export interface ValidationReport {
  // When the held `components` were produced (last successful sweep); null until
  // the backend's first successful sweep completes.
  generatedAt: string | null
  // When the most recent refresh attempt ran (success or failure).
  lastAttemptAt: string | null
  // Non-null when the most recent attempt failed; the previous good `components`
  // are retained (stale-but-honest). Surfaced in the UI so a stale/failed report
  // is never silently rendered as "all clean".
  refreshError: string | null
  components: ComponentValidation[]
}

/**
 * Aggregated registry counts served by CRS `GET /health/statistics`
 * (HealthStatisticsResponse). The `componentsBy*` maps are `person -> count`
 * and are emitted as `{}` (never null) when empty — mirror that. Backs the
 * admin Registry Health page's total/active KPIs and the three people
 * breakdowns. The wire integers are `int64`; JSON deserializes them to JS
 * `number`, which is exact for any realistic registry size.
 */
export interface HealthStatistics {
  totalComponents: number
  activeComponents: number
  componentsByOwner: Record<string, number>
  componentsByReleaseManager: Record<string, number>
  componentsBySecurityChampion: Record<string, number>
}

// ---------------------------------------------------------------------------
// System / runtime metrics — admin System tab on the Admin Settings page.
// Served by the portal BFF `GET /portal/metrics` (not CRS). Portal fields are
// always present; CRS fields are best-effort and omitted (Jackson NON_NULL)
// when unavailable, hence the optional markers.
// ---------------------------------------------------------------------------

/** Full JVM/system readout for the portal itself. */
export interface PortalJvm {
  heapUsedBytes: number
  heapCommittedBytes: number
  // null/omitted when the JVM reports no configured max (-1) → render an em-dash.
  heapMaxBytes?: number | null
  nonHeapUsedBytes: number
  nonHeapCommittedBytes: number
  threadsLive: number
  threadsPeak: number
  threadsDaemon: number
  classesLoaded: number
  classesTotalLoaded: number
  classesUnloaded: number
  gcCount: number
  gcTimeMillis: number
  // omitted when the CPU/load reading is unavailable.
  cpuProcess?: number | null
  cpuSystem?: number | null
  systemLoadAverage?: number | null
  availableProcessors: number
}

/** Best-effort subset of a service's JVM metrics — every field optional (any can degrade). */
export interface ServiceJvm {
  heapUsedBytes?: number | null
  heapCommittedBytes?: number | null
  heapMaxBytes?: number | null
  threadsLive?: number | null
  threadsPeak?: number | null
  threadsDaemon?: number | null
  gcCount?: number | null
  gcTimeMillis?: number | null
  cpuProcess?: number | null
  cpuSystem?: number | null
  availableProcessors?: number | null
}

/** A single actuator health component: its status and (best-effort) reason detail. */
export interface ServiceComponentHealth {
  status?: string | null
  reason?: string | null
}

/** One interactive login captured by the portal (per-pod, in-memory). */
export interface RecentLogin {
  username: string
  loginAt: string
}

export interface PortalRuntime {
  uptimeMillis: number
  startedAt: string
  processId: number
  javaVersion: string
  jvm: PortalJvm
  recentLogins: RecentLogin[]
}

/**
 * Best-effort runtime readout for a downstream service (CRS or RMS) on the admin
 * System tab. `reachable` distinguishes "answered the health probe but a component
 * is degraded" from "unreachable"; `downComponents` names the DOWN aggregate
 * components; `employeeService` mirrors the CRS person-validation component so the
 * banner can name the real cause (absent for services without it, e.g. RMS).
 */
export interface ServiceRuntime {
  available: boolean
  reason?: string | null
  status?: string | null
  uptimeMillis?: number | null
  jvm?: ServiceJvm | null
  reachable?: boolean
  downComponents?: string[]
  employeeService?: ServiceComponentHealth | null
}

export interface SystemMetrics {
  portal: PortalRuntime
  crs: ServiceRuntime
  // Optional so a frontend running against an older backend (rolling deploy /
  // local dev) that omits `rms` degrades gracefully instead of crashing.
  rms?: ServiceRuntime
}

// ---------------------------------------------------------------------------
// Migration / async-job envelopes (unchanged by schema-v2; MIG-039 deferred,
// so POST /admin/migrate currently returns 501 Not Implemented — UI gates that)
// ---------------------------------------------------------------------------

export interface MigrationStatus {
  git: number
  db: number
  total: number
}

export interface MigrationResult {
  componentName: string
  success: boolean
  dryRun: boolean
  message: string
  discrepancies: string[]
}

export interface BatchMigrationResult {
  total: number
  migrated: number
  failed: number
  skipped: number
  results: MigrationResult[]
}

export type JobState = 'RUNNING' | 'COMPLETED' | 'FAILED'

/**
 * Wire shape of `POST /admin/migrate` (202 / 409) and `GET /admin/migrate/job` (200 / 404).
 * `result` is populated only after `state === 'COMPLETED'`. While RUNNING, the SPA
 * leans on `currentComponent` + `migrated/total/failed/skipped` to render a
 * progress bar; once COMPLETED, it switches to rendering the full result tiles +
 * failure list.
 */
export interface MigrationJobResponse {
  /** Discriminator — always 'job' for this shape (vs 'conflict' on cross-kind 409). Optional for backward compat with older CRS that omitted the field. */
  kind?: 'job'
  id: string
  state: JobState
  startedAt: string
  finishedAt: string | null
  total: number
  migrated: number
  failed: number
  skipped: number
  currentComponent: string | null
  errorMessage: string | null
  result: FullMigrationResult | null
  /**
   * Sub-phase within RUNNING: 'DEFAULTS' while migrateDefaults is in flight,
   * 'COMPONENTS' once the per-component loop has started. Cleared (null) on
   * COMPLETED / FAILED.
   *
   * Optional rather than just nullable: older CRS deployments simply omit the
   * field from the JSON, so JSON.parse yields `undefined`, not `null`. Callers
   * that switch on this should treat both `undefined` and `null` as "no phase
   * info — render fallback".
   */
  phase?: 'DEFAULTS' | 'COMPONENTS' | null
}

export interface FullMigrationResult {
  defaults: Record<string, unknown>
  components: BatchMigrationResult
}

/**
 * Result body produced by GitHistoryImportService once a `/migrate-history` job
 * reaches COMPLETED. Counters mirror the backend's `ImportStats`.
 */
export interface HistoryImportResult {
  targetRef: string
  targetSha: string
  processedCommits: number
  skippedNoGroovy: number
  skippedParseError: number
  skippedUnknownNames: number
  auditRecords: number
  durationMs: number
}

/**
 * Wire shape of `POST /admin/migrate-history` (202 / 409 same-kind attach) and
 * `GET /admin/migrate-history/job` (200 / 404). Mirrors [MigrationJobResponse]
 * for the components flow with history-specific counters.
 *
 * After a pod restart, `current()` on the backend synthesizes this from the
 * persisted `git_history_import_state` row, so the SPA may see this shape with
 * `id` like `restored-<timestamp>` and zero counters — that's expected, the
 * SPA still uses `state` and `errorMessage` to drive the action buttons.
 */
export interface HistoryMigrationJobResponse {
  /** Discriminator — always 'job' for this shape. Optional for backward compat. */
  kind?: 'job'
  id: string
  state: JobState
  startedAt: string
  finishedAt: string | null
  totalCommits: number
  processedCommits: number
  auditRecords: number
  skippedNoGroovy: number
  skippedParseError: number
  skippedUnknownNames: number
  currentSha: string | null
  targetRef: string | null
  errorMessage: string | null
  result: HistoryImportResult | null
  /**
   * SPA action hint:
   *  - 'RETRY' → terminal+recoverable (COMPLETED or normal FAILED). Show
   *    "Retry (reset state)" button, POST with reset=true.
   *  - 'FORCE_RESET' → stuck IN_PROGRESS row from a previous pod that
   *    crashed. Show "Force reset" + disabled "Retry".
   *  - 'UNKNOWN' → backend can't classify the state (contract drift / future
   *    DB status). SPA renders message but disables both action buttons.
   *  - null → no action (RUNNING, or idle).
   *
   * Replaces the previous brittle `errorMessage.includes('marked IN_PROGRESS')`
   * substring contract.
   *
   * Type is intentionally narrow + nullable; the panel additionally checks
   * for any unrecognised value at runtime (defensive against contract drift
   * where the backend ships a new variant before the SPA is updated).
   */
  recoveryAction?: 'RETRY' | 'FORCE_RESET' | 'UNKNOWN' | null
}

/**
 * 409 body returned for cross-kind conflicts — components POST while history
 * is RUNNING, history POST while TC sync is RUNNING, force-reset while
 * history is RUNNING, etc. Distinct from the same-kind attach 409 that
 * returns a full job-response body — distinguished by the `kind`
 * discriminator (always 'conflict' here).
 */
export interface MigrationConflictResponse {
  /** Discriminator — always 'conflict' for this shape. Mutually exclusive with the 'job' shape. */
  kind: 'conflict'
  code:
    | 'components-migration-running'
    | 'history-migration-running'
    | 'history-import-likely-live-elsewhere'
    | 'tc-resync-running'
  message: string
  activeKind: 'COMPONENTS' | 'HISTORY' | 'TC_RESYNC'
  activeJobId: string | null
}

/**
 * Wire shape of `TeamcitySyncResult` — the per-pass counters returned
 * embedded in [TeamCityResyncJobResponse]'s `result` field once the job
 * reaches COMPLETED. Field names are the same shape the legacy synchronous
 * `POST /resync` endpoint returns.
 *
 * `ambiguous_auto_resolved` is a sub-counter of `updated`+`unchanged`: how
 * many of those rows came from a CDRelease tie-break on a multi-candidate
 * match. Optional in the type because older CRS builds omit the field;
 * the panel falls back to 0 in that case.
 */
export interface TeamCityResyncResult {
  scanned: number
  updated: number
  unchanged: number
  skipped_no_match: number
  skipped_ambiguous: number
  ambiguous_auto_resolved?: number
  errors: string[]
}

/**
 * Wire shape of `POST /admin/teamcity-project-ids/sync` (202 / 409 same-kind
 * attach) and `GET /admin/teamcity-project-ids/sync/job` (200 / 404).
 *
 * Mirrors [MigrationJobResponse] for the components flow but with the
 * domain-specific [TeamCityResyncResult] payload. While RUNNING the panel
 * renders an indeterminate spinner (TC sync has no per-component progress
 * yet); on COMPLETED it switches to rendering the per-pass counter tiles +
 * first error from `result`.
 */
export interface TeamCityResyncJobResponse {
  /** Discriminator — always 'job' for this shape. */
  kind?: 'job'
  id: string
  state: JobState
  startedAt: string
  finishedAt: string | null
  errorMessage: string | null
  result: TeamCityResyncResult | null
}

export interface TeamCityValidationResult {
  scanned: number
  findings: number
  componentsWithIssues: number
  errors: string[]
}

export interface TeamCityValidationJobResponse {
  /** Discriminator — always 'job' for this shape. */
  kind?: 'job'
  id: string
  state: JobState
  startedAt: string
  finishedAt: string | null
  errorMessage: string | null
  result: TeamCityValidationResult | null
}

// ── CRS legacy version rendering (rest/api/2/.../detailed-version) ───────────
// One rendered version in its bare (CI/build) and Jira-facing (prefixed) forms.
export interface ComponentRegistryVersion {
  type: string
  version: string
  jiraVersion: string
}

// The full version ladder for a component + input version, rendered server-side
// by the real versioning library — the only correct source for build systems
// (e.g. Whiskey) whose scheme the client can't reproduce.
export interface DetailedComponentVersion {
  component: string
  minorVersion: ComponentRegistryVersion
  lineVersion: ComponentRegistryVersion
  buildVersion: ComponentRegistryVersion
  rcVersion: ComponentRegistryVersion
  releaseVersion: ComponentRegistryVersion
  hotfixVersion?: ComponentRegistryVersion | null
}

/**
 * SYS-060: one operational service-event row from `GET /rest/api/4/admin/service-events`.
 * Redeploys (STARTUP), migration/history/TC-resync runs, and portal validation sweeps.
 * Mirrors the CRS `ServiceEventResponse` (camelCase).
 */
export interface ServiceEvent {
  id: number
  /** STARTUP | MIGRATION_COMPONENTS | MIGRATION_HISTORY | TEAMCITY_RESYNC | VALIDATION_SWEEP | ONBOARDING_VIDEO_VIEW */
  eventType: string
  /** Derived SYSTEM | USER split (from eventType), server-provided. */
  category?: string
  /** RUNNING | COMPLETED | FAILED */
  status: string
  /** crs | portal */
  source: string
  triggeredBy: string | null
  serviceVersion: string | null
  correlationId: string | null
  summary: string | null
  detail: Record<string, unknown> | null
  startedAt: string
  finishedAt: string | null
}

// SYS-062 — user feedback / report-a-problem. Mirrors the CRS v4 wire contract.
export type FeedbackType = 'BUG' | 'IDEA' | 'QUESTION'
export type FeedbackStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED'

/** One screenshot on the way in — base64 of the raw image (data-URL prefix stripped). */
export interface FeedbackAttachmentPayload {
  filename?: string | null
  contentType?: string | null
  dataBase64: string
}

export interface FeedbackCreateRequest {
  type: FeedbackType
  title?: string | null
  message: string
  pageUrl?: string | null
  appVersion?: string | null
  attachments?: FeedbackAttachmentPayload[] | null
}

/** Attachment metadata (no bytes); the SPA renders each via the attachment-bytes endpoint. */
export interface FeedbackAttachmentMeta {
  id: number
  filename: string | null
  contentType: string | null
  sizeBytes: number | null
}

export interface FeedbackResponse {
  id: number
  type: string
  status: string
  title: string | null
  message: string
  submittedBy: string | null
  pageUrl: string | null
  appVersion: string | null
  detail: Record<string, unknown> | null
  createdAt: string
  updatedAt: string | null
  updatedBy: string | null
  attachments: FeedbackAttachmentMeta[]
}

export interface FeedbackStatusUpdateRequest {
  status: FeedbackStatus
}
