import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { ProducedArtifactsSection } from './ProducedArtifactsSection'
import { type GeneralFormValues } from './GeneralTab'
import { fromArtifactId, OWNERSHIP_ALL_VERSIONS } from '../../lib/artifactOwnership'
import { TooltipProvider } from '../ui/tooltip'
import type { ComponentDetail } from '../../lib/types'

// FieldLabelText / FieldInfo read the field-config; stub it so the label/info
// resolve to their fallbacks deterministically (no live query flake). Mirrors
// the GeneralTab.test approach.
vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: () => ({ entry: { visibility: 'editable', required: false }, isLoading: false, isError: false }),
  useFieldLabel: (_path: string, fallback: string) => fallback,
}))

// useSupportedGroups is left un-mocked: with retry:false the query fails fast
// and the hook falls back to [] (prefix check skipped) — matching production
// fail-open behaviour and keeping the section render deterministic.

function baseComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'my-component',
    displayName: 'My Component',
    componentOwner: 'alice',
    productType: '',
    systems: [],
    clientCode: null,
    solution: false,
    parentComponentName: null,
    archived: false,
    version: 0,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as ComponentDetail
}

function withOwnership(): ComponentDetail {
  return baseComponent({
    artifactIds: [
      {
        id: 'ai-1',
        versionRange: OWNERSHIP_ALL_VERSIONS,
        groupPattern: 'com.example.alpha',
        mode: 'ALL_EXCEPT_CLAIMED',
        artifactTokens: [],
        legacyArtifactIdPattern: '(?!(?:claimed-model)$)[\\w-\\.]+',
      },
      {
        id: 'ai-2',
        versionRange: OWNERSHIP_ALL_VERSIONS,
        groupPattern: 'com.example.tools',
        mode: 'EXPLICIT',
        artifactTokens: ['claimed-model', 'claimed-api'],
      },
    ],
  })
}

function Harness({ component }: { component: ComponentDetail }) {
  const form = useForm<GeneralFormValues>({
    defaultValues: {
      name: component.name,
      displayName: component.displayName ?? '',
      componentOwner: component.componentOwner ?? '',
      productType: component.productType ?? '',
      systems: component.systems ?? [],
      labels: component.labels ?? [],
      clientCode: component.clientCode ?? '',
      solution: component.solution ?? false,
      archived: component.archived,
      parentComponentName: component.parentComponentName ?? '',
      canBeParent: component.canBeParent ?? false,
      releaseManager: component.releaseManager ?? [],
      securityChampion: component.securityChampion ?? [],
      copyright: component.copyright ?? '',
      docs: (component.docs ?? []).map((d) => ({
        docComponentKey: d.docComponentKey,
        majorVersion: d.majorVersion ?? '',
      })),
      artifactIds: (component.artifactIds ?? []).map(fromArtifactId),
    },
  })
  return <ProducedArtifactsSection form={form} component={component} canEdit />
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  )
}

// Guards that the ownership editor DISPLAYS persisted values (groupId, mode, artifact tokens) —
// not merely that fromArtifactId maps them. This is the regression net for the v4
// ArtifactIdResponse → editor binding: a field-shape drift (e.g. a CRS build that omits
// `mode`/`artifactTokens`, or an empty `component_artifact_mappings` table) would otherwise
// render blank/absent fields while every existing test stayed green. (#357)
describe('ProducedArtifactsSection artifact-ownership rendering (#357)', () => {
  it('renders the persisted groupId for every mapping', () => {
    renderWithProviders(<Harness component={withOwnership()} />)
    const groups = (screen.getAllByLabelText('Group ID') as HTMLInputElement[]).map((i) => i.value)
    expect(groups).toHaveLength(2)
    expect(groups).toEqual(expect.arrayContaining(['com.example.alpha', 'com.example.tools']))
  })

  it('reflects the persisted mode per mapping (ALL_EXCEPT_CLAIMED + EXPLICIT)', () => {
    renderWithProviders(<Harness component={withOwnership()} />)
    const selectedModes = (screen.getAllByLabelText('artifactId matching mode') as HTMLSelectElement[]).map(
      (s) => s.value,
    )
    expect(selectedModes.length).toBe(2)
    expect(selectedModes).toEqual(expect.arrayContaining(['ALL_EXCEPT_CLAIMED', 'EXPLICIT']))
  })

  it('renders persisted EXPLICIT artifact tokens as chips', () => {
    renderWithProviders(<Harness component={withOwnership()} />)
    expect(screen.getByLabelText('Remove claimed-model')).toBeTruthy()
    expect(screen.getByLabelText('Remove claimed-api')).toBeTruthy()
  })

  it('empty artifactIds (e.g. an un-migrated component_artifact_mappings table) renders the section with NO mapping rows', () => {
    // Reproduces the QA symptom: the v4 detail returns artifactIds: [] (the new table was
    // never populated for the component), so the editor shows its header + add button but no
    // Group ID / Artifact fields. A data/migration state — distinct from a binding bug above.
    renderWithProviders(<Harness component={baseComponent({ artifactIds: [] })} />)
    expect(screen.queryByLabelText('Group ID')).toBeNull()
    expect(screen.getByRole('button', { name: /Add one more groupId/i })).toBeTruthy()
  })
})
