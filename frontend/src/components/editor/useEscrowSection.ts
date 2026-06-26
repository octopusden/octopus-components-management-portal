import type { ComponentDetail } from '../../lib/types'
import type { FieldVisibility } from '../../hooks/useFieldConfig'
import { selectBaseRow } from '../../lib/api/baseRow'
import type { SectionSlice, DiffEntry } from '../../lib/editor/combineRequest'
import { scalarDiff, boolDiff, listDiff } from '../../lib/editor/diffUtil'
import { useSectionSnapshot } from './useSectionSnapshot'

interface EscrowState {
  productType: string
  generation: string
  diskSpace: string
  reusable: boolean
  providedDependencies: string
  additionalSources: string
  gradleIncludeConfigurations: string
  gradleExcludeConfigurations: string
  gradleIncludeTestConfigurations: boolean
  // build.* automation knobs migrated here from the Build tab (paths unchanged)
  buildTasks: string
  systemProperties: string
  deprecated: boolean
  requiredProject: boolean
  projectVersion: string
  requiredToolsInput: string
}

function snapshotFrom(component: ComponentDetail): EscrowState {
  const br = selectBaseRow(component)
  const e = br?.escrow
  const b = br?.build
  return {
    productType: component.productType ?? '',
    generation: e?.generation ?? '',
    diskSpace: e?.diskSpace ?? '',
    reusable: e?.reusable ?? false,
    providedDependencies: e?.providedDependencies ?? '',
    additionalSources: e?.additionalSources ?? '',
    gradleIncludeConfigurations: e?.gradleIncludeConfigurations ?? '',
    gradleExcludeConfigurations: e?.gradleExcludeConfigurations ?? '',
    gradleIncludeTestConfigurations: e?.gradleIncludeTestConfigurations ?? false,
    buildTasks: b?.buildTasks ?? '',
    systemProperties: b?.systemProperties ?? '',
    deprecated: b?.deprecated ?? false,
    requiredProject: b?.requiredProject ?? false,
    projectVersion: b?.projectVersion ?? '',
    requiredToolsInput: (br?.requiredTools ?? []).join(', '),
  }
}

function parseTools(input: string): string[] {
  return [...new Set(input.split(',').map((t) => t.trim()).filter(Boolean))]
}

export interface EscrowVisibilities {
  productType: FieldVisibility
}

export interface EscrowSection {
  state: EscrowState
  set: <K extends keyof EscrowState>(field: K, value: EscrowState[K]) => void
  parsedRequiredTools: string[]
  slice: SectionSlice
  reset: () => void
}

export function useEscrowSection(component: ComponentDetail, visibilities: EscrowVisibilities): EscrowSection {
  const { state, setState, snapshotRef, isDirty, reseed } = useSectionSnapshot(component, snapshotFrom)

  const set = <K extends keyof EscrowState>(field: K, value: EscrowState[K]) =>
    setState((p) => ({ ...p, [field]: value }))

  const reset = reseed

  const parsedRequiredTools = parseTools(state.requiredToolsInput)
  // Guard against wiping server-side requiredTools / build when no BASE row was
  // loaded yet (form values would be bare defaults). Sending null/omit = "don't touch".
  const baseRowPresent = selectBaseRow(component) !== undefined
  const requiredToolsPayload = baseRowPresent ? parsedRequiredTools : null

  const prior = snapshotRef.current
  const diff: DiffEntry[] = []
  const push = (d: DiffEntry | null) => { if (d) diff.push(d) }
  if (isDirty) {
    if (visibilities.productType !== 'hidden')
      // productType is a top-level component scalar; CRS only sends it when present
      // (a clear is omitted, never null) so a "clear" never persists either — flag it.
      push(scalarDiff('Escrow · Product Type', prior.productType, state.productType, { aspectScalar: true }))
    push(scalarDiff('Escrow · Generation', prior.generation, state.generation, { aspectScalar: true }))
    push(scalarDiff('Escrow · Disk Space', prior.diskSpace, state.diskSpace, { aspectScalar: true }))
    push(boolDiff('Escrow · Reusable', prior.reusable, state.reusable))
    push(scalarDiff('Escrow · Provided Dependencies', prior.providedDependencies, state.providedDependencies, { aspectScalar: true }))
    push(scalarDiff('Escrow · Additional Sources', prior.additionalSources, state.additionalSources, { aspectScalar: true }))
    push(scalarDiff('Escrow · Gradle Include Configurations', prior.gradleIncludeConfigurations, state.gradleIncludeConfigurations, { aspectScalar: true }))
    push(scalarDiff('Escrow · Gradle Exclude Configurations', prior.gradleExcludeConfigurations, state.gradleExcludeConfigurations, { aspectScalar: true }))
    push(boolDiff('Escrow · Gradle Include Test Configurations', prior.gradleIncludeTestConfigurations, state.gradleIncludeTestConfigurations))
    push(scalarDiff('Build · Build Tasks', prior.buildTasks, state.buildTasks, { aspectScalar: true }))
    push(scalarDiff('Build · System Properties', prior.systemProperties, state.systemProperties, { aspectScalar: true }))
    push(scalarDiff('Build · Project Version', prior.projectVersion, state.projectVersion, { aspectScalar: true }))
    push(boolDiff('Build · Deprecated', prior.deprecated, state.deprecated))
    push(boolDiff('Build · Required Project', prior.requiredProject, state.requiredProject))
    push(listDiff('Build · Required Tools', parseTools(prior.requiredToolsInput), parsedRequiredTools))
  }

  const slice: SectionSlice = {
    isDirty,
    diff,
    request: {
      // productType: hidden → omit; editable/readonly → send only when a value is present.
      ...(visibilities.productType !== 'hidden' && state.productType ? { productType: state.productType } : {}),
      baseConfiguration: {
        escrow: {
          providedDependencies: state.providedDependencies || null,
          reusable: state.reusable,
          generation: state.generation || null,
          diskSpace: state.diskSpace || null,
          additionalSources: state.additionalSources || null,
          gradleIncludeConfigurations: state.gradleIncludeConfigurations || null,
          gradleExcludeConfigurations: state.gradleExcludeConfigurations || null,
          gradleIncludeTestConfigurations: state.gradleIncludeTestConfigurations,
        },
        // Migrated build knobs — only the fields this section renders are sent
        // (CRS PATCH applies per-field, so omitted scalars stay untouched and the
        // Build section remains the sole writer of buildSystem/versions).
        ...(baseRowPresent
          ? {
              build: {
                buildTasks: state.buildTasks || null,
                systemProperties: state.systemProperties || null,
                deprecated: state.deprecated,
                requiredProject: state.requiredProject,
                projectVersion: state.projectVersion || null,
              },
            }
          : {}),
        // requiredTools lives at the BaseConfigurationRequest level. When a BASE
        // row is present we send the parsed array (REPLACE); with no BASE row
        // loaded we send `null`, which CRS treats as "don't touch" (preserving
        // server state) — the documented legacy wire contract, unchanged here.
        requiredTools: requiredToolsPayload,
      },
    },
  }

  return { state, set, parsedRequiredTools, slice, reset }
}
