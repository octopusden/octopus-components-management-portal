import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DistributionTab } from './DistributionTab'
import type { ComponentDetail } from '../../lib/types'

vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: () => null,
}))

vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  useFieldConfigEntry: () => ({ entry: { visibility: 'editable', required: false }, isLoading: false }),
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
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
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
      <DistributionTab component={baseComponent()} updateMutation={makeMutation(mutateAsync)} toast={vi.fn()} />,
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
      <DistributionTab component={baseComponent()} updateMutation={makeMutation(mutateAsync)} toast={vi.fn()} />,
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
      <DistributionTab component={baseComponent()} updateMutation={makeMutation(mutateAsync)} toast={vi.fn()} />,
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
