import type { ComponentDetail } from '../../lib/types'
import type { FieldVisibility } from '../../hooks/useFieldConfig'
import { selectBaseRow } from '../../lib/api/baseRow'
import type { SectionSlice, DiffEntry } from '../../lib/editor/combineRequest'
import { scalarDiff, boolDiff } from '../../lib/editor/diffUtil'
import { omitNonEditable } from '../../lib/editor/payloadGating'
import { useSectionSnapshot } from './useSectionSnapshot'

/**
 * Jira section state (P-2a). The Line/Minor and Release/Build pairs carry a
 * `*Separate` flag beside their value: when the pair is mirrored the derived
 * field (Minor / Build) is NOT edited directly, and Save MATERIALIZES/CLEARS it
 * (see the slice below). `lineVersionFormat` holds the LEADING value of the
 * Line/Minor pair (Minor derives from it); `releaseVersionFormat` leads the
 * Release/Build pair.
 */
interface JiraState {
  projectKey: string
  displayName: string
  technical: boolean
  hotfixVersionFormat: string
  versionPrefix: string
  versionFormat: string
  releaseVersionFormat: string
  /** Leading value of the Line/Minor pair. */
  lineVersionFormat: string
  /** Separate Minor value; meaningful only when `minorSeparate`. */
  minorVersionFormat: string
  minorSeparate: boolean
  /** Separate Build value; meaningful only when `buildSeparate`. */
  buildVersionFormat: string
  buildSeparate: boolean
  releasesInDefaultBranch: boolean
  skipCommitCheck: boolean
}

function snapshotFrom(component: ComponentDetail): JiraState {
  const j = selectBaseRow(component)?.jira
  const lineStored = j?.lineVersionFormat ?? ''
  const minorStored = j?.minorVersionFormat ?? ''
  const buildStored = j?.buildVersionFormat ?? ''
  // Minor is "separate" only when both Line and Minor are stored AND differ;
  // otherwise it mirrors Line. The leading value is the stored Line, or — for
  // legacy components with a null Line — the stored Minor (prep §R6, task B).
  const minorSeparate = lineStored !== '' && minorStored !== '' && lineStored !== minorStored
  const leading = lineStored !== '' ? lineStored : minorStored
  // Build is "separate" iff a Build value is stored; otherwise it mirrors
  // Release (this pair rides CRS's real server-side fallback — no materialization).
  const buildSeparate = buildStored !== ''
  return {
    projectKey: j?.projectKey ?? '',
    displayName: component.jiraDisplayName ?? '',
    technical: j?.technical ?? false,
    hotfixVersionFormat: component.jiraHotfixVersionFormat ?? '',
    versionPrefix: j?.versionPrefix ?? '',
    versionFormat: j?.versionFormat ?? '',
    releaseVersionFormat: j?.releaseVersionFormat ?? '',
    lineVersionFormat: leading,
    minorVersionFormat: minorSeparate ? minorStored : '',
    minorSeparate,
    buildVersionFormat: buildSeparate ? buildStored : '',
    buildSeparate,
    releasesInDefaultBranch: component.releasesInDefaultBranch ?? false,
    skipCommitCheck: component.skipCommitCheck ?? false,
  }
}

/** Effective outgoing Minor/Build values given the mirror flags (materialization). */
function effectiveMinor(s: JiraState): string {
  return s.minorSeparate ? s.minorVersionFormat : s.lineVersionFormat
}
function effectiveBuild(s: JiraState): string {
  // Mirrored → send '' so CRS falls back to Release server-side; separate → own value.
  return s.buildSeparate ? s.buildVersionFormat : ''
}

/**
 * Dirty is computed from the EFFECTIVE (materialized/cleared) projection, not
 * the raw state, so a UI-only flip like "Set separate minor format" without
 * editing the value (which materializes to the same wire value) does NOT read
 * as dirty (mirrors the VCS/Distribution `normalize` contract in
 * useSectionSnapshot — dirty ⇔ payload differs ⇔ diff non-empty).
 */
function normalizeJira(s: JiraState, isWhiskey: boolean) {
  return {
    projectKey: s.projectKey,
    displayName: s.displayName,
    technical: s.technical,
    hotfixVersionFormat: s.hotfixVersionFormat,
    versionPrefix: s.versionPrefix,
    versionFormat: s.versionFormat,
    releaseVersionFormat: s.releaseVersionFormat,
    lineVersionFormat: s.lineVersionFormat,
    minorVersionFormat: effectiveMinor(s),
    buildVersionFormat: effectiveBuild(s),
    releasesInDefaultBranch: s.releasesInDefaultBranch,
    // Skip Commit Check is forced false for WHISKEY (server rule) — normalize to
    // the EFFECTIVE value so a stale true (e.g. toggled on, then Build switched to
    // WHISKEY on another tab) is neither dirty nor shown, matching the send-gate.
    skipCommitCheck: s.skipCommitCheck && !isWhiskey,
  }
}

export interface JiraVisibilities {
  releasesInDefaultBranch: FieldVisibility
}

export interface JiraSectionOptions extends JiraVisibilities {
  /**
   * Effective per-user editability of a jira field path (P-1). Non-editable
   * fields are OMITTED from the PATCH slice (client-side omission is the primary
   * correctness mechanism; the server change-based 422 is defense-in-depth).
   * Defaults to always-editable for hook-level tests.
   */
  isFieldEditable?: (fieldPath: string) => boolean
  /**
   * EFFECTIVE (outgoing) BASE build system — the Build section's DRAFT value, not
   * the persisted component — so the Whiskey rule for Skip Commit Check reacts to
   * an unsaved Build-tab change in the same combined save (Codex #151 P1). When
   * WHISKEY, skipCommitCheck is forced false and never sent (server 422s
   * otherwise). Defaults to the persisted BASE build system for hook-level tests.
   */
  effectiveBuildSystem?: string
}

export interface JiraSection {
  state: JiraState
  set: <K extends keyof JiraState>(field: K, value: JiraState[K]) => void
  /** Flip the Minor field between mirrored (derived from Line) and separate.
   *  Setting separate seeds the value from Line when no value is held yet. */
  setMinorSeparate: (separate: boolean, seed?: string) => void
  /** Flip the Build field between mirrored (derived from Release) and separate. */
  setBuildSeparate: (separate: boolean, seed?: string) => void
  slice: SectionSlice
  reset: () => void
}

export function useJiraSection(component: ComponentDetail, options: JiraSectionOptions): JiraSection {
  const {
    releasesInDefaultBranch: releasesVisibility,
    isFieldEditable = () => true,
    effectiveBuildSystem = selectBaseRow(component)?.build?.buildSystem ?? '',
  } = options
  const isWhiskey = effectiveBuildSystem === 'WHISKEY'
  const { state, setState, snapshotRef, isDirty, reseed } = useSectionSnapshot(
    component,
    snapshotFrom,
    (s) => normalizeJira(s, isWhiskey),
  )

  const set = <K extends keyof JiraState>(field: K, value: JiraState[K]) =>
    setState((p) => ({ ...p, [field]: value }))

  const setMinorSeparate = (separate: boolean, seed?: string) =>
    setState((p) => ({
      ...p,
      minorSeparate: separate,
      // Promote to separate → seed the editable value (explicit seed, else the
      // current Line value); collapse → drop the separate value so a subsequent
      // Discard/compare reads clean.
      minorVersionFormat: separate ? (seed ?? (p.minorVersionFormat || p.lineVersionFormat)) : '',
    }))

  const setBuildSeparate = (separate: boolean, seed?: string) =>
    setState((p) => ({
      ...p,
      buildSeparate: separate,
      buildVersionFormat: separate ? (seed ?? (p.buildVersionFormat || p.releaseVersionFormat)) : '',
    }))

  const reset = reseed

  const prior = snapshotRef.current
  const diff: DiffEntry[] = []
  const push = (d: DiffEntry | null) => { if (d) diff.push(d) }
  if (isDirty) {
    // Diff against the EFFECTIVE (materialized/cleared) values so the Review
    // dialog matches what is sent. P-1 ""-clear: jira aspect string scalars
    // clear via '' (CRS-A), so clears persist and are NOT flagged as no-ops.
    push(scalarDiff('Jira · Project Key', prior.projectKey, state.projectKey))
    push(boolDiff('Jira · Technical', prior.technical, state.technical))
    // jiraHotfixVersionFormat is a top-level component scalar (clears persist).
    push(scalarDiff('Jira · Hotfix Version Format', prior.hotfixVersionFormat, state.hotfixVersionFormat))
    push(scalarDiff('Jira · Version Prefix', prior.versionPrefix, state.versionPrefix))
    push(scalarDiff('Jira · Line Version Format', prior.lineVersionFormat, state.lineVersionFormat))
    push(scalarDiff('Jira · Minor Version Format', effectiveMinor(prior), effectiveMinor(state)))
    push(scalarDiff('Jira · Release Version Format', prior.releaseVersionFormat, state.releaseVersionFormat))
    push(scalarDiff('Jira · Build Version Format', effectiveBuild(prior), effectiveBuild(state)))
    push(scalarDiff('Jira · Version Format', prior.versionFormat, state.versionFormat))
    if (releasesVisibility !== 'hidden')
      push(boolDiff('Jira · Releases in default branch', prior.releasesInDefaultBranch, state.releasesInDefaultBranch))
    // Effective skip (forced false for WHISKEY) so the diff matches the send-gate.
    push(boolDiff('Jira · Skip Commit Check', prior.skipCommitCheck && !isWhiskey, state.skipCommitCheck && !isWhiskey))
    // jiraDisplayName is hidden-by-default and shown only when divergent; surface a row when changed.
    if ((prior.displayName || null) !== (state.displayName || null))
      push(scalarDiff('Jira · Display Name', prior.displayName, state.displayName))
  }

  // ""-clear (CRS-A): aspect string scalars send '' to clear (null = no-op).
  // Empty state == server null (seeded from detail), so unconditionally sending
  // '' for an untouched-empty field is a safe no-op (plan §P-1). Mirrored Minor
  // materializes the Line value into BOTH fields; mirrored Build clears (server
  // fallback). Non-editable fields are then dropped from the PATCH.
  // A MIRRORED derived field is not edited directly — the user changes it via
  // the leading field — so gate its materialized write by the LEADING field's
  // editability (Minor→Line, Build→Release). When SEPARATE, it is edited on its
  // own and gated by its own path.
  const minorGatePath = state.minorSeparate ? 'jira.minorVersionFormat' : 'jira.lineVersionFormat'
  const buildGatePath = state.buildSeparate ? 'jira.buildVersionFormat' : 'jira.releaseVersionFormat'
  const jiraPayload = omitNonEditable(
    {
      projectKey: state.projectKey || '',
      technical: state.technical,
      versionPrefix: state.versionPrefix || '',
      versionFormat: state.versionFormat || '',
      releaseVersionFormat: state.releaseVersionFormat || '',
      buildVersionFormat: effectiveBuild(state),
      lineVersionFormat: state.lineVersionFormat || '',
      minorVersionFormat: effectiveMinor(state) || '',
    },
    {
      projectKey: 'jira.projectKey',
      technical: 'jira.technical',
      versionPrefix: 'jira.versionPrefix',
      versionFormat: 'jira.versionFormat',
      releaseVersionFormat: 'jira.releaseVersionFormat',
      buildVersionFormat: buildGatePath,
      lineVersionFormat: 'jira.lineVersionFormat',
      minorVersionFormat: minorGatePath,
    },
    isFieldEditable,
  )

  const slice: SectionSlice = {
    isDirty,
    diff,
    request: {
      // Send-gate releasesInDefaultBranch: only when FC-visible AND changed from
      // the server value (don't clobber a server null with false on an unrelated save).
      ...(releasesVisibility !== 'hidden' &&
      state.releasesInDefaultBranch !== (component.releasesInDefaultBranch ?? false)
        ? { releasesInDefaultBranch: state.releasesInDefaultBranch }
        : {}),
      // skipCommitCheck (top-level boolean): editable by any editor (canEdit),
      // not field-config gated. Send only when toggled from the server value AND
      // the effective BASE build system is NOT WHISKEY — for WHISKEY the flag is
      // forced false and must never be sent (server 422s on WHISKEY + skip=true,
      // Codex #151 P1); the toggle is also disabled in the UI.
      ...(!isWhiskey && state.skipCommitCheck !== (component.skipCommitCheck ?? false)
        ? { skipCommitCheck: state.skipCommitCheck }
        : {}),
      // Send jiraDisplayName only when it actually changed from the server value.
      ...((state.displayName || null) !== (component.jiraDisplayName ?? null)
        ? { jiraDisplayName: state.displayName || null }
        : {}),
      // jiraHotfixVersionFormat is a top-level component scalar gated OUTSIDE
      // omitNonEditable — gate its send by effective editability so editing an
      // unrelated Jira field can't drag a non-editable hotfix format into the
      // PATCH (Codex #151 P2). CRS enforces on the write-side key
      // `component.jiraHotfixVersionFormat` (ComponentManagementServiceImpl),
      // while the tab renders under `jira.hotfixVersionFormat` — gate on BOTH so
      // client omission matches the server regardless of which path an
      // installation authors the `editable` axis on (same split as externalRegistry).
      ...(isFieldEditable('jira.hotfixVersionFormat') && isFieldEditable('component.jiraHotfixVersionFormat')
        ? { jiraHotfixVersionFormat: state.hotfixVersionFormat || null }
        : {}),
      baseConfiguration: {
        jira: jiraPayload,
      },
    },
  }

  return { state, set, setMinorSeparate, setBuildSeparate, slice, reset }
}
