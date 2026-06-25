import { useEffect, useRef, useState } from 'react'
import type { ComponentDetail } from '../../lib/types'
import { selectBaseRow, selectOverrideRows } from '../../lib/api/baseRow'
import { useFieldConfig } from '../../hooks/useAdminConfig'
import { labelFor } from '../../hooks/useFieldConfig'
import type { SectionSlice, DiffEntry } from '../../lib/editor/combineRequest'
import { deepEqual, scalarDiff } from '../../lib/editor/diffUtil'

/** Build-tab BASE-row scalars this section owns (the toolchain knobs; the
 *  escrow/automation knobs migrated to the Escrow section). */
interface BuildState {
  buildSystem: string
  buildFilePath: string
  javaVersion: string
  mavenVersion: string
  gradleVersion: string
}

function snapshotFrom(component: ComponentDetail): BuildState {
  const b = selectBaseRow(component)?.build
  return {
    buildSystem: b?.buildSystem ?? '',
    buildFilePath: b?.buildFilePath ?? '',
    javaVersion: b?.javaVersion ?? '',
    mavenVersion: b?.mavenVersion ?? '',
    gradleVersion: b?.gradleVersion ?? '',
  }
}

export interface BuildSection {
  state: BuildState
  set: <K extends keyof BuildState>(field: K, value: BuildState[K]) => void
  /** buildSystem is required server-side; the page Save guard reads this to
   *  block the combined save and surface the inline error. */
  buildSystemMissing: boolean
  buildSystemTouched: boolean
  setBuildSystemTouched: (v: boolean) => void
  showMavenVersion: boolean
  showGradleVersion: boolean
  slice: SectionSlice
  reset: () => void
}

/**
 * Build section state for the unified save bar. Owns its local state +
 * last-saved snapshot, computes dirty via a deep-compare (no RHF here, so a
 * structural compare is correct + simpler — Phase 3b two-mechanism dirty
 * model). The `component`-change effect re-seeds the snapshot ONLY while the
 * section is clean, so a successful save re-syncs but an in-flight edit in this
 * section is never clobbered by another section's `setQueryData`.
 */
export function useBuildSection(component: ComponentDetail): BuildSection {
  const [state, setState] = useState<BuildState>(() => snapshotFrom(component))
  const snapshotRef = useRef<BuildState>(state)
  const [buildSystemTouched, setBuildSystemTouched] = useState(false)

  const isDirty = !deepEqual(state, snapshotRef.current)

  useEffect(() => {
    // Re-seed from the server snapshot only when clean. Killing the old
    // per-tab `useEffect([component]) → reset` clobber: a sibling section's
    // post-save setQueryData re-runs this effect, but a dirty Build section
    // keeps its in-progress edits.
    if (!isDirty) {
      const next = snapshotFrom(component)
      snapshotRef.current = next
      // Only re-render when the server snapshot actually differs from current
      // state — a fresh-but-equal object would otherwise schedule a needless
      // re-render every time the effect re-runs.
      setState((prev) => (deepEqual(prev, next) ? prev : next))
    }
    // isDirty intentionally omitted — re-seed is keyed on the component identity,
    // and the guard reads the latest isDirty via closure at effect run time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component])

  function set<K extends keyof BuildState>(field: K, value: BuildState[K]) {
    setState((prev) => ({ ...prev, [field]: value }))
  }

  function reset() {
    const next = snapshotFrom(component)
    snapshotRef.current = next
    setState(next)
    setBuildSystemTouched(false)
  }

  // Maven/Gradle version visibility mirrors the legacy BuildTab: show the
  // tool-version input when SOME range builds with that tool (the live BASE
  // selection or a build.buildSystem override) or an override targets the
  // version field itself. Hidden ≠ cleared: hidden fields stay out of the slice.
  const scalarOverrideRows = selectOverrideRows(component).filter((r) => r.rowType === 'SCALAR_OVERRIDE')
  const effectiveBuildSystems = new Set(
    [
      state.buildSystem,
      ...scalarOverrideRows
        .filter((r) => r.overriddenAttribute === 'build.buildSystem')
        .map((r) => r.build?.buildSystem),
    ].filter((s): s is string => Boolean(s)),
  )
  const hasOverrideOn = (attr: string) => scalarOverrideRows.some((r) => r.overriddenAttribute === attr)
  const showMavenVersion = effectiveBuildSystems.has('MAVEN') || hasOverrideOn('build.mavenVersion')
  const showGradleVersion = effectiveBuildSystems.has('GRADLE') || hasOverrideOn('build.gradleVersion')

  const { data: fcData } = useFieldConfig()
  const label = (path: string, fallback: string) => `Build · ${labelFor(fcData, path, fallback)}`
  const prior = snapshotRef.current
  const diff: DiffEntry[] = []
  const push = (d: DiffEntry | null) => { if (d) diff.push(d) }
  if (isDirty) {
    push(scalarDiff(label('build.buildSystem', 'Build System'), prior.buildSystem, state.buildSystem, { aspectScalar: true }))
    push(scalarDiff(label('build.buildFilePath', 'Build File Path'), prior.buildFilePath, state.buildFilePath, { aspectScalar: true }))
    push(scalarDiff(label('build.javaVersion', 'Java Version'), prior.javaVersion, state.javaVersion, { aspectScalar: true }))
    if (showMavenVersion) push(scalarDiff(label('build.mavenVersion', 'Maven Version'), prior.mavenVersion, state.mavenVersion, { aspectScalar: true }))
    if (showGradleVersion) push(scalarDiff(label('build.gradleVersion', 'Gradle Version'), prior.gradleVersion, state.gradleVersion, { aspectScalar: true }))
  }

  const slice: SectionSlice = {
    isDirty,
    diff,
    request: {
      baseConfiguration: {
        build: {
          buildSystem: state.buildSystem || null,
          buildFilePath: state.buildFilePath || null,
          javaVersion: state.javaVersion || null,
          // Hidden tool versions are omitted (not nulled) — same contract as legacy BuildTab.
          ...(showMavenVersion ? { mavenVersion: state.mavenVersion || null } : {}),
          ...(showGradleVersion ? { gradleVersion: state.gradleVersion || null } : {}),
        },
      },
    },
  }

  const buildSystemMissing = !state.buildSystem

  return {
    state,
    set,
    buildSystemMissing,
    buildSystemTouched,
    setBuildSystemTouched,
    showMavenVersion,
    showGradleVersion,
    slice,
    reset,
  }
}
