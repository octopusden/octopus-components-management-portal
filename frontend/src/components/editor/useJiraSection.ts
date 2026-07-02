import type { ComponentDetail } from '../../lib/types'
import type { FieldVisibility } from '../../hooks/useFieldConfig'
import { selectBaseRow } from '../../lib/api/baseRow'
import type { SectionSlice, DiffEntry } from '../../lib/editor/combineRequest'
import { scalarDiff, boolDiff } from '../../lib/editor/diffUtil'
import { useSectionSnapshot } from './useSectionSnapshot'

interface JiraState {
  projectKey: string
  displayName: string
  technical: boolean
  hotfixVersionFormat: string
  minorVersionFormat: string
  releaseVersionFormat: string
  buildVersionFormat: string
  lineVersionFormat: string
  versionPrefix: string
  versionFormat: string
  releasesInDefaultBranch: boolean
}

function snapshotFrom(component: ComponentDetail): JiraState {
  const j = selectBaseRow(component)?.jira
  return {
    projectKey: j?.projectKey ?? '',
    displayName: component.jiraDisplayName ?? '',
    technical: j?.technical ?? false,
    hotfixVersionFormat: component.jiraHotfixVersionFormat ?? '',
    minorVersionFormat: j?.minorVersionFormat ?? '',
    releaseVersionFormat: j?.releaseVersionFormat ?? '',
    buildVersionFormat: j?.buildVersionFormat ?? '',
    lineVersionFormat: j?.lineVersionFormat ?? '',
    versionPrefix: j?.versionPrefix ?? '',
    versionFormat: j?.versionFormat ?? '',
    releasesInDefaultBranch: component.releasesInDefaultBranch ?? false,
  }
}

export interface JiraVisibilities {
  releasesInDefaultBranch: FieldVisibility
}

export interface JiraSection {
  state: JiraState
  set: <K extends keyof JiraState>(field: K, value: JiraState[K]) => void
  slice: SectionSlice
  reset: () => void
}

export function useJiraSection(component: ComponentDetail, visibilities: JiraVisibilities): JiraSection {
  const { state, setState, snapshotRef, isDirty, reseed } = useSectionSnapshot(component, snapshotFrom)

  const set = <K extends keyof JiraState>(field: K, value: JiraState[K]) =>
    setState((p) => ({ ...p, [field]: value }))

  const reset = reseed

  const prior = snapshotRef.current
  const diff: DiffEntry[] = []
  const push = (d: DiffEntry | null) => { if (d) diff.push(d) }
  if (isDirty) {
    push(scalarDiff('Jira · Project Key', prior.projectKey, state.projectKey, { aspectScalar: true }))
    push(boolDiff('Jira · Technical', prior.technical, state.technical))
    // jiraHotfixVersionFormat is a top-level component scalar (clears persist).
    push(scalarDiff('Jira · Hotfix Version Format', prior.hotfixVersionFormat, state.hotfixVersionFormat))
    push(scalarDiff('Jira · Version Prefix', prior.versionPrefix, state.versionPrefix, { aspectScalar: true }))
    push(scalarDiff('Jira · Minor Version Format', prior.minorVersionFormat, state.minorVersionFormat, { aspectScalar: true }))
    push(scalarDiff('Jira · Release Version Format', prior.releaseVersionFormat, state.releaseVersionFormat, { aspectScalar: true }))
    push(scalarDiff('Jira · Build Version Format', prior.buildVersionFormat, state.buildVersionFormat, { aspectScalar: true }))
    push(scalarDiff('Jira · Line Version Format', prior.lineVersionFormat, state.lineVersionFormat, { aspectScalar: true }))
    push(scalarDiff('Jira · Version Format', prior.versionFormat, state.versionFormat, { aspectScalar: true }))
    if (visibilities.releasesInDefaultBranch !== 'hidden')
      push(boolDiff('Jira · Releases in default branch', prior.releasesInDefaultBranch, state.releasesInDefaultBranch))
    // jiraDisplayName is hidden-by-default and shown only when divergent; surface a row when changed.
    if ((prior.displayName || null) !== (state.displayName || null))
      push(scalarDiff('Jira · Display Name', prior.displayName, state.displayName))
  }

  const slice: SectionSlice = {
    isDirty,
    diff,
    request: {
      // Send-gate releasesInDefaultBranch: only when FC-visible AND changed from
      // the server value (don't clobber a server null with false on an unrelated save).
      ...(visibilities.releasesInDefaultBranch !== 'hidden' &&
      state.releasesInDefaultBranch !== (component.releasesInDefaultBranch ?? false)
        ? { releasesInDefaultBranch: state.releasesInDefaultBranch }
        : {}),
      // Send jiraDisplayName only when it actually changed from the server value.
      ...((state.displayName || null) !== (component.jiraDisplayName ?? null)
        ? { jiraDisplayName: state.displayName || null }
        : {}),
      jiraHotfixVersionFormat: state.hotfixVersionFormat || null,
      baseConfiguration: {
        jira: {
          projectKey: state.projectKey || null,
          technical: state.technical,
          minorVersionFormat: state.minorVersionFormat || null,
          releaseVersionFormat: state.releaseVersionFormat || null,
          buildVersionFormat: state.buildVersionFormat || null,
          lineVersionFormat: state.lineVersionFormat || null,
          versionPrefix: state.versionPrefix || null,
          versionFormat: state.versionFormat || null,
        },
      },
    },
  }

  return { state, set, slice, reset }
}
