import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { JiraTab } from './JiraTab'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'
import type { UseMutationResult } from '@tanstack/react-query'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'

// Visible stub: each FieldOverrideInline renders a div tagged with the
// overriddenAttribute so tests can assert per-field inline coverage.
vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: ({ overriddenAttribute }: { overriddenAttribute: string }) => (
    <div data-testid={`field-override-inline-${overriddenAttribute}`} />
  ),
}))

vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: () => ({
    entry: {
      visibility: 'visible',
      label: null,
      options: null,
      searchable: null,
      required: null,
      defaultValue: null,
      description: null,
      overridable: null,
      locked: null,
    },
  }),
}))

vi.mock('../../hooks/useOptimisticConflict', () => ({
  useOptimisticConflict: () => () => null,
}))

function makeBaseRow(overrides: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
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
    ...overrides,
  }
}

function makeComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
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
    version: 5,
    createdAt: null,
    updatedAt: null,
    configurations: [makeBaseRow()],
    ...overrides,
  } as ComponentDetail
}

function makeMutation(mutateFn = vi.fn()) {
  return {
    mutateAsync: mutateFn,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
    variables: undefined,
    status: 'idle',
    reset: vi.fn(),
    mutate: vi.fn(),
    context: undefined,
    failureCount: 0,
    failureReason: null,
    isIdle: true,
    isPaused: false,
    submittedAt: 0,
  } as unknown as UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
}

function renderTab(component: ComponentDetail) {
  const toast = vi.fn()
  const mutation = makeMutation()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <JiraTab component={component} updateMutation={mutation} toast={toast} />
    </QueryClientProvider>,
  )
}

describe('JiraTab — inline override coverage', () => {
  const overridablePaths = [
    'jira.projectKey',
    'jira.technical',
    'jira.majorVersionFormat',
    'jira.releaseVersionFormat',
    'jira.buildVersionFormat',
    'jira.lineVersionFormat',
    'jira.versionPrefix',
    'jira.versionFormat',
  ]

  it.each(overridablePaths)('renders FieldOverrideInline under %s', (path) => {
    renderTab(makeComponent())
    expect(screen.getByTestId(`field-override-inline-${path}`)).toBeInTheDocument()
  })
})
