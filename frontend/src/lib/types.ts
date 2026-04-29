export interface ComponentSummary {
  id: string
  name: string
  displayName: string | null
  componentOwner: string | null
  system: string[]
  productType: string | null
  archived: boolean
  updatedAt: string | null
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
