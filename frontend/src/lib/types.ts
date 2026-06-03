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
  displayName: string | null
  componentOwner: string | null
  // CRS PR #301 collapsed Component.systems Set<String> → Component.system
  // String?. Single-value per component in the domain; the list page renders
  // the scalar directly.
  system: string | null
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
  // SYS-040 list-view extras — derived by the v4 mapper from the BASE
  // configuration row + first child (sort_order = 0); blank strings normalized to null.
  buildSystem?: string | null
  jiraProjectKey?: string | null
  vcsPath?: string | null
  teamcityProjectId?: string | null
  teamcityProjectUrl?: string | null
}

export interface ComponentDetail {
  id: string
  name: string
  displayName: string | null
  componentOwner: string | null
  productType: string | null
  // CRS PR #301 collapsed Component.systems Set<String> → Component.system
  // String?. Domain is single-value per component; the editor renders a
  // single-select EnumSelect bound directly to this scalar.
  system: string | null
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
  // falls back to the global EDIT_COMPONENTS permission check.
  canEdit?: boolean
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
  buildSystemVersion?: string | null
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
  majorVersionFormat?: string | null
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

export interface ArtifactId {
  id: string
  groupPattern: string
  artifactPattern: string
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
  groupPattern: string
  artifactPattern: string
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
  // CRS PR #301: scalar field, optional/nullable.
  system?: string | null
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
  distributionExplicit?: boolean | null
  distributionExternal?: boolean | null
  group?: ComponentGroupRequest | null
  docs?: DocLinkRequest[]
  artifactIds?: ArtifactIdRequest[]
  securityGroups?: SecurityGroupRequest[]
  teamcityProjects?: TeamcityProjectRequest[]
  baseConfiguration?: BaseConfigurationRequest | null
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
  // CRS PR #301: scalar field, optional/nullable. PATCH semantics — omit
  // to keep server value, set string to replace, set null to clear.
  system?: string | null
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
}

export interface CrsInfo {
  name: string
  version: string
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
