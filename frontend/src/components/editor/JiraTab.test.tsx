import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { JiraTab } from './JiraTab'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
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

function renderTab(component: ComponentDetail, canEdit = true) {
  const toast = vi.fn()
  const mutation = makeMutation()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      {/* TooltipProvider mirrors the app-root provider required by FieldInfo. */}
      <TooltipProvider>
        <JiraTab component={component} updateMutation={mutation} toast={toast} canEdit={canEdit} />
      </TooltipProvider>
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
    'jira.hotfixVersionFormat',
  ]

  it.each(overridablePaths)('renders FieldOverrideInline under %s', (path) => {
    renderTab(makeComponent())
    expect(screen.getByTestId(`field-override-inline-${path}`)).toBeInTheDocument()
  })
})

describe('JiraTab — Jira display name shown only when divergent', () => {
  const NOTE = /shown because it differs/i

  it('hides the Jira Display Name field when it is unset', () => {
    renderTab(makeComponent())
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('hides the Jira Display Name field when it equals the component display name', () => {
    // makeComponent().displayName === 'My Component'
    renderTab(makeComponent({ jiraDisplayName: 'My Component' }))
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('shows the Jira Display Name field (pre-filled) when it diverges', () => {
    renderTab(makeComponent({ jiraDisplayName: 'Divergent Jira Name' }))
    expect(screen.getByText(NOTE)).toBeDefined()
    expect(screen.getByDisplayValue('Divergent Jira Name')).toBeDefined()
  })

  it('does NOT send jiraDisplayName on a save that did not change it', async () => {
    const mutateFn = vi.fn().mockResolvedValue({})
    const mutation = makeMutation(mutateFn)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // Divergent so the field renders, but the user only edits the project key.
    const component = makeComponent({ jiraDisplayName: 'Divergent Jira Name' })
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <JiraTab component={component} updateMutation={mutation} toast={vi.fn()} canEdit />
        </TooltipProvider>
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /save jira/i }))
    expect(mutateFn).toHaveBeenCalled()
    const payload = mutateFn.mock.calls[0]![0] as Record<string, unknown>
    expect('jiraDisplayName' in payload).toBe(false)
  })
})

describe('JiraTab field descriptions (FieldInfo)', () => {
  // Exact set of registry paths this tab must expose an info icon for.
  // releasesInDefaultBranch keeps its component.* field-config path even
  // though it renders on the Jira tab.
  const EXPECTED_PATHS = [
    'jira.projectKey',
    'jira.displayName',
    'jira.technical',
    'component.releasesInDefaultBranch',
    'jira.hotfixVersionFormat',
    'jira.versionPrefix',
    'jira.majorVersionFormat',
    'jira.releaseVersionFormat',
    'jira.buildVersionFormat',
    'jira.lineVersionFormat',
    'jira.versionFormat',
  ]

  it('renders exactly one info icon per described field', () => {
    // jira.displayName only renders when it diverges from the component displayName, so use a
    // divergent fixture here to exercise its FieldInfo alongside the always-present fields.
    renderTab(makeComponent({ jiraDisplayName: 'Divergent Jira Name' }))
    for (const path of EXPECTED_PATHS) {
      expect(
        document.querySelectorAll(`[data-field-path="${path}"]`),
        `info icon for ${path}`,
      ).toHaveLength(1)
    }
  })

  it('opens the registry description for Project Key on focus', async () => {
    renderTab(makeComponent())
    const trigger = document.querySelector('[data-field-path="jira.projectKey"]') as HTMLElement
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(fieldDescriptions['jira.projectKey']!)
  })
})
