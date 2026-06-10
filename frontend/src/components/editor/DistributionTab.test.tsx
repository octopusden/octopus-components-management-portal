import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DistributionTab } from './DistributionTab'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: () => null,
}))

vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  useFieldConfigEntry: () => ({ entry: { visibility: 'editable', required: false }, isLoading: false, isError: false }),
  // FieldLabelText dependency — label overrides are exercised by the
  // Escrow/Build/Vcs tab tests; here the fallback text is enough.
  useFieldLabel: (_path: string, fallback: string) => fallback,
}))

function baseComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'my-component',
    displayName: 'My Component',
    componentOwner: 'alice',
    systems: [],
    productType: null,
    clientCode: null,
    solution: false,
    parentComponentName: null,
    archived: false,
    version: 3,
    createdAt: null,
    updatedAt: null,
    distributionExplicit: false,
    distributionExternal: false,
    securityGroups: [],
    configurations: [
      {
        id: 'cfg-1',
        versionRange: '(,0),[0,)',
        rowType: 'BASE',
        overriddenAttribute: null,
        isSyntheticBase: false,
        build: null,
        escrow: null,
        jira: null,
        vcsEntries: [],
        mavenArtifacts: [],
        fileUrlArtifacts: [],
        dockerImages: [],
        packages: [],
        requiredTools: [],
      },
    ],
    ...overrides,
  } as ComponentDetail
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // TooltipProvider mirrors the app-root provider (App.tsx) required by the
  // FieldInfo description tooltips rendered next to the field labels.
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  )
}

function makeMutation(mutateAsyncFn = vi.fn().mockResolvedValue({})) {
  return {
    mutateAsync: mutateAsyncFn,
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    error: null,
    data: undefined,
    reset: vi.fn(),
    variables: undefined,
    context: undefined,
    failureCount: 0,
    failureReason: null,
    status: 'idle' as const,
    submittedAt: 0,
  } as unknown as Parameters<typeof DistributionTab>[0]['updateMutation']
}

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
// Regression: clicking "Add" on a sub-section creates a blank local row, but
// hitting "Save" must NOT send blank required-field rows to CRS — those would
// 400 on the server. The save handler trims and filters by the row's required
// identity fields. This locks the contract.
// ---------------------------------------------------------------------------

describe('DistributionTab — blank-row filter on save', () => {
  it('drops a freshly-added blank Maven row and does not include it in the payload', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    renderWithProviders(
      <DistributionTab component={baseComponent()} updateMutation={makeMutation(mutateAsync)} toast={vi.fn()} canEdit={true} />,
    )

    // Two "Add" sections share the same "Add" label — Maven is the first.
    const addButtons = screen.getAllByRole('button', { name: /^Add$/ })
    fireEvent.click(addButtons[0]!) // Maven Add

    fireEvent.click(screen.getByRole('button', { name: /Save Distribution/i }))

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    const payload = mutateAsync.mock.calls[0]![0] as {
      baseConfiguration?: { mavenArtifacts?: unknown[] }
    }
    expect(payload.baseConfiguration?.mavenArtifacts ?? []).toEqual([])
  })

  it('drops a freshly-added blank Docker row', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    renderWithProviders(
      <DistributionTab component={baseComponent()} updateMutation={makeMutation(mutateAsync)} toast={vi.fn()} canEdit={true} />,
    )

    // Click the third Add button (Docker section is the third sub-section).
    const addButtons = screen.getAllByRole('button', { name: /^Add$/ })
    fireEvent.click(addButtons[2]!)

    fireEvent.click(screen.getByRole('button', { name: /Save Distribution/i }))

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    const payload = mutateAsync.mock.calls[0]![0] as {
      baseConfiguration?: { dockerImages?: unknown[] }
    }
    expect(payload.baseConfiguration?.dockerImages ?? []).toEqual([])
  })

  it('preserves a Maven row when both required identity fields are populated', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    renderWithProviders(
      <DistributionTab component={baseComponent()} updateMutation={makeMutation(mutateAsync)} toast={vi.fn()} canEdit={true} />,
    )

    const addButtons = screen.getAllByRole('button', { name: /^Add$/ })
    fireEvent.click(addButtons[0]!)

    fireEvent.change(screen.getByPlaceholderText('org.example.alpha'), {
      target: { value: 'com.example' },
    })
    fireEvent.change(screen.getByPlaceholderText('my-component-*'), {
      target: { value: 'my-app' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Save Distribution/i }))

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    const payload = mutateAsync.mock.calls[0]![0] as {
      baseConfiguration?: { mavenArtifacts?: Array<{ groupPattern: string; artifactPattern: string }> }
    }
    expect(payload.baseConfiguration?.mavenArtifacts).toHaveLength(1)
    expect(payload.baseConfiguration?.mavenArtifacts?.[0]?.groupPattern).toBe('com.example')
    expect(payload.baseConfiguration?.mavenArtifacts?.[0]?.artifactPattern).toBe('my-app')
  })
})

describe('DistributionTab — canEdit gating', () => {
  it('disables Save and every section Add button when canEdit is false', () => {
    renderWithProviders(
      <DistributionTab component={baseComponent()} updateMutation={makeMutation(vi.fn())} toast={vi.fn()} canEdit={false} />,
    )
    expect(screen.getByRole('button', { name: /Save Distribution/i })).toBeDisabled()
    const addButtons = screen.getAllByRole('button', { name: /^Add$/ })
    expect(addButtons.length).toBeGreaterThan(0)
    for (const btn of addButtons) expect(btn).toBeDisabled()
  })
})

describe('DistributionTab field descriptions (FieldInfo)', () => {
  /** Base row with one populated entry per artifact array so every per-row
   *  label (and its info icon) actually renders. */
  function populatedComponent(): ComponentDetail {
    return baseComponent({
      securityGroups: [{ id: 'sg-1', groupType: 'read', groupName: 'group-a' }],
      configurations: [
        {
          ...(baseComponent().configurations![0] as ComponentConfiguration),
          mavenArtifacts: [
            { id: 'm-1', sortOrder: 0, groupPattern: 'com.example', artifactPattern: 'app-*', extension: null, classifier: null },
          ],
          fileUrlArtifacts: [{ id: 'f-1', sortOrder: 0, url: 'https://example.com/a.zip', artifactId: null, classifier: null }],
          dockerImages: [{ id: 'd-1', sortOrder: 0, imageName: 'my-org/my-image', flavor: null }],
          packages: [{ id: 'p-1', sortOrder: 0, packageType: 'rpm', packageName: 'my-pkg' }],
        },
      ],
    })
  }

  // Exact set of registry paths this tab must expose an info icon for —
  // the two component-level toggles, the five section headings, and the
  // per-row fields of each artifact type (one populated row per array).
  const EXPECTED_PATHS = [
    'component.distributionExplicit',
    'component.distributionExternal',
    'distribution.mavenArtifacts',
    'distribution.fileUrlArtifacts',
    'distribution.dockerImages',
    'distribution.packages',
    'distribution.securityGroups',
    'distribution.maven.groupPattern',
    'distribution.maven.artifactPattern',
    'distribution.maven.extension',
    'distribution.maven.classifier',
    'distribution.fileUrl.url',
    'distribution.fileUrl.artifactId',
    'distribution.fileUrl.classifier',
    'distribution.docker.imageName',
    'distribution.docker.flavor',
    'distribution.package.type',
    'distribution.package.name',
    'distribution.securityGroup.type',
    'distribution.securityGroup.name',
  ]

  it('renders exactly one info icon per described field (one row per array)', () => {
    renderWithProviders(
      <DistributionTab component={populatedComponent()} updateMutation={makeMutation(vi.fn())} toast={vi.fn()} canEdit={true} />,
    )
    for (const path of EXPECTED_PATHS) {
      expect(
        document.querySelectorAll(`[data-field-path="${path}"]`),
        `info icon for ${path}`,
      ).toHaveLength(1)
    }
  })

  it('repeats per-row icons for every artifact row while section icons stay single', () => {
    const component = populatedComponent()
    const base = component.configurations![0] as ComponentConfiguration
    base.mavenArtifacts = [
      { id: 'm-1', sortOrder: 0, groupPattern: 'com.example', artifactPattern: 'app-*', extension: null, classifier: null },
      { id: 'm-2', sortOrder: 1, groupPattern: 'com.example.two', artifactPattern: 'lib-*', extension: null, classifier: null },
    ]
    renderWithProviders(
      <DistributionTab component={component} updateMutation={makeMutation(vi.fn())} toast={vi.fn()} canEdit={true} />,
    )
    expect(document.querySelectorAll('[data-field-path="distribution.maven.groupPattern"]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-field-path="distribution.mavenArtifacts"]')).toHaveLength(1)
  })

  it('opens the registry description for the Explicit toggle on focus', async () => {
    renderWithProviders(
      <DistributionTab component={baseComponent()} updateMutation={makeMutation(vi.fn())} toast={vi.fn()} canEdit={true} />,
    )
    const trigger = document.querySelector(
      '[data-field-path="component.distributionExplicit"]',
    ) as HTMLElement
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(fieldDescriptions['component.distributionExplicit']!)
  })
})
