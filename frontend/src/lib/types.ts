export interface ComponentSummary {
  id: string
  name: string
  displayName: string | null
  componentOwner: string | null
  system: string[]
  productType: string | null
  archived: boolean
  updatedAt: string | null
  // SYS-040 list-view extras (CRS v4 mapper). Null when the source
  // nested entity is absent or its leaf field is blank.
  buildSystem?: string | null
  jiraProjectKey?: string | null
  vcsPath?: string | null
  labels?: string[]
  // TC link restoration (CRS PR-2). Optional so the type can ship before the
  // CRS deploy lands — older responses that omit the fields just leave them
  // undefined here, and the list/detail views render no TC icon.
  // - teamcityProjectId: matching key (TC project's id, e.g. "MyProject_Build").
  // - teamcityProjectUrl: full webUrl as TC returned it; rendered verbatim.
  teamcityProjectId?: string | null
  teamcityProjectUrl?: string | null
}

export interface ComponentDetail {
  id: string
  name: string
  displayName: string | null
  componentOwner: string | null
  productType: string | null
  system: string[]
  clientCode: string | null
  archived: boolean
  solution: boolean | null
  parentComponentName: string | null
  metadata: Record<string, unknown>
  version: number
  createdAt: string | null
  updatedAt: string | null
  // SYS-039 (CRS PR #163). Optional so the type can ship before the
  // CRS deploy lands — older responses that omit the fields just leave
  // them undefined here, and the editor renders empty inputs.
  groupId?: string | null
  releaseManager?: string | null
  securityChampion?: string | null
  copyright?: string | null
  releasesInDefaultBranch?: boolean | null
  labels?: string[]
  // TC link restoration (CRS PR-2). See ComponentSummary for shape rationale.
  teamcityProjectId?: string | null
  teamcityProjectUrl?: string | null
  buildConfigurations: BuildConfiguration[]
  vcsSettings: VcsSettings[]
  distributions: Distribution[]
  jiraComponentConfigs: JiraComponentConfig[]
  escrowConfigurations: EscrowConfiguration[]
  versions: ComponentVersion[]
}

export interface BuildConfiguration {
  id: string | null
  buildSystem: string | null
  buildFilePath: string | null
  javaVersion: string | null
  deprecated: boolean
  metadata: Record<string, unknown>
}

export interface VcsSettings {
  id: string | null
  vcsType: string | null
  externalRegistry: string | null
  entries: VcsSettingsEntry[]
}

export interface VcsSettingsEntry {
  id: string | null
  name: string | null
  vcsPath: string | null
  repositoryType: string
  tag: string | null
  branch: string | null
}

export interface Distribution {
  id: string | null
  explicit: boolean
  external: boolean
  artifacts: DistributionArtifact[]
  securityGroups: DistributionSecurityGroup[]
}

export interface DistributionArtifact {
  id: string | null
  artifactType: string
  groupPattern: string | null
  artifactPattern: string | null
  name: string | null
  tag: string | null
}

export interface DistributionSecurityGroup {
  id: string | null
  groupType: string
  groupName: string
}

export interface JiraComponentConfig {
  id: string | null
  projectKey: string | null
  displayName: string | null
  componentVersionFormat: Record<string, unknown> | null
  technical: boolean
  metadata: Record<string, unknown>
}

export interface EscrowConfiguration {
  id: string | null
  buildTask: string | null
  providedDependencies: string | null
  reusable: boolean | null
  generation: string | null
  diskSpace: string | null
}

export interface ComponentVersion {
  id: string | null
  versionRange: string
}

export interface ComponentFilter {
  system?: string
  productType?: string
  archived?: boolean
  search?: string
  /**
   * Server-side exact-match filter on `componentOwner`. Sourced from
   * `/components/meta/owners` for the autocomplete picker. SYS-035.
   */
  owner?: string
  buildSystem?: string
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
  oldValue: Record<string, unknown> | null
  newValue: Record<string, unknown> | null
  changeDiff: Record<string, unknown> | null
  correlationId: string | null
}

export interface FieldOverride {
  id: string
  fieldPath: string
  versionRange: string
  value: unknown
  createdAt: string | null
  updatedAt: string | null
}

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
 * is RUNNING, force-reset while history is RUNNING, etc. Distinct from the
 * same-kind attach 409 that returns a full job-response body — distinguished
 * by the `kind` discriminator (always 'conflict' here).
 */
export interface MigrationConflictResponse {
  /** Discriminator — always 'conflict' for this shape. Mutually exclusive with the 'job' shape. */
  kind: 'conflict'
  code:
    | 'components-migration-running'
    | 'history-migration-running'
    | 'history-import-likely-live-elsewhere'
  message: string
  activeKind: 'COMPONENTS' | 'HISTORY'
  activeJobId: string | null
}
