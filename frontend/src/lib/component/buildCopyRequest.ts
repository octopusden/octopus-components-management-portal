import type { ComponentCreateRequest, ComponentDetail, JiraAspect } from '../types'
import { selectBaseRow } from '../api/baseRow'

// Builds the POST /components payload for "create as a copy of an existing
// component". Semantics:
//   - omitted key            = not copied / server default (e.g. versionRange,
//                              vcsEntries, distribution child lists);
//   - required collections   = explicit [] when not copied (artifactIds,
//                              teamcityProjects — the CRS v4 create contract
//                              marks them required, mirroring CreateComponentDialog);
//   - copied collections     = `source.x ?? []` so legacy/fixture detail shapes
//                              with absent lists still satisfy the contract.
// NOT copied (unique or server/migration-owned): name (caller-supplied),
// id/version/timestamps/group/canEdit, all override rows, vcsEntries,
// maven/fileUrl/docker/package artifacts, artifactIds, teamcityProjects,
// jira.projectKey, jiraDisplayName.

export interface CopyInput {
  name: string
  displayName?: string
}

// Strip projectKey (unique per component) and keep the rest of the Jira
// aspect, but only when something meaningful remains — a projectKey-only
// aspect must not turn into `jira: {}` on the clone.
function copyJiraAspect(jira: JiraAspect | null | undefined): JiraAspect | undefined {
  if (!jira) return undefined
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { projectKey, ...rest } = jira
  const hasValue = Object.values(rest).some((v) => v != null)
  return hasValue ? rest : undefined
}

export function buildCopyRequest(source: ComponentDetail, input: CopyInput): ComponentCreateRequest {
  const req: ComponentCreateRequest = {
    name: input.name,
    displayName: input.displayName,
    componentOwner: source.componentOwner,
    productType: source.productType,
    system: source.system,
    clientCode: source.clientCode,
    solution: source.solution,
    parentComponentName: source.parentComponentName,
    archived: false,
    releaseManager: [...(source.releaseManager ?? [])],
    securityChampion: [...(source.securityChampion ?? [])],
    copyright: source.copyright,
    releasesInDefaultBranch: source.releasesInDefaultBranch,
    labels: [...(source.labels ?? [])],
    jiraHotfixVersionFormat: source.jiraHotfixVersionFormat,
    vcsExternalRegistry: source.vcsExternalRegistry,
    distributionExplicit: source.distributionExplicit,
    distributionExternal: source.distributionExternal,
    docs: (source.docs ?? []).map((d) => ({
      docComponentKey: d.docComponentKey,
      majorVersion: d.majorVersion ?? null,
    })),
    securityGroups: (source.securityGroups ?? []).map((g) => ({
      groupType: g.groupType,
      groupName: g.groupName,
    })),
    // Required by the create contract but intentionally NOT copied (unique
    // per component): explicit empty lists, mirroring CreateComponentDialog.
    artifactIds: [],
    teamcityProjects: [],
  }

  const baseRow = selectBaseRow(source)
  if (baseRow) {
    const jira = copyJiraAspect(baseRow.jira)
    // Shallow-clone the aspects/lists so the request never shares references
    // with the TanStack-cached source detail — a future mutation of the
    // request must not corrupt the cache entry.
    const baseConfiguration = {
      ...(baseRow.build ? { build: { ...baseRow.build } } : {}),
      ...(baseRow.escrow ? { escrow: { ...baseRow.escrow } } : {}),
      ...(jira ? { jira } : {}),
      ...(baseRow.requiredTools.length > 0 ? { requiredTools: [...baseRow.requiredTools] } : {}),
    }
    // A BASE row whose only content is excluded collections (e.g. a
    // synthetic/minimal base) yields nothing to copy — omit the key rather
    // than sending `baseConfiguration: {}`.
    if (Object.keys(baseConfiguration).length > 0) {
      req.baseConfiguration = baseConfiguration
    }
  }

  return req
}
