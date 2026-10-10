import type { PlacementDiffResult, PlacementEntryDiff, PlacementRowDiff } from '@/lib/types'

// CRS serialises the placement DTOs with Jackson and no NON_NULL, so every
// property of `PlacementDiffResult` / `PlacementRowDiff` / `PlacementEntryDiff`
// is present and the absent nullable ones are explicit `null` — never omitted.
// Spelled out in full here so tests render what the wire really carries.

function entry(overrides: Partial<PlacementEntryDiff> = {}): PlacementEntryDiff {
  return {
    name: 'main',
    vcsPath: 'ssh://git/app.git',
    branch: null,
    tag: null,
    hotfixBranch: null,
    repositoryType: 'GIT',
    currentCheckoutDirectory: null,
    currentSourcePath: null,
    derivedCheckoutDirectory: null,
    derivedSourcePath: null,
    ...overrides,
  }
}

function row(overrides: Partial<PlacementRowDiff>): PlacementRowDiff {
  return {
    componentId: '00000000-0000-0000-0000-00000000000a',
    componentKey: 'app-a',
    configurationRowId: '00000000-0000-0000-0000-0000000000a1',
    versionRange: '[1.0,)',
    rowLabel: 'BASE',
    status: 'RESOLVED',
    entries: [entry()],
    currentBuildWorkingDirectory: null,
    derivedBuildWorkingDirectory: null,
    sourceBuildTypeIds: [],
    notes: [],
    ...overrides,
  }
}

export const CRS_SHAPED_REPORT: PlacementDiffResult = {
  diffId: 'diff-1',
  generatedAt: '2026-09-30T10:00:42Z',
  rows: [
    // Derived Checkout Directory set; derived Build Working Directory is null = "checkout root".
    row({
      componentId: '00000000-0000-0000-0000-00000000000a',
      componentKey: 'app-resolved',
      status: 'RESOLVED',
      entries: [entry({ derivedCheckoutDirectory: 'app-resolved' })],
      currentBuildWorkingDirectory: 'old/dir',
      derivedBuildWorkingDirectory: null,
      sourceBuildTypeIds: ['Build_App_Resolved'],
    }),
    // Report-only: nothing derived, nothing current.
    row({
      componentId: '00000000-0000-0000-0000-00000000000b',
      componentKey: 'app-nochain',
      configurationRowId: '00000000-0000-0000-0000-0000000000b1',
      status: 'NO_CHAIN',
      notes: ['no build chain found'],
    }),
    row({
      componentId: '00000000-0000-0000-0000-00000000000c',
      componentKey: 'app-tcerror',
      configurationRowId: '00000000-0000-0000-0000-0000000000c1',
      status: 'TC_ERROR',
      notes: ['TeamCity returned 500'],
    }),
  ],
}
