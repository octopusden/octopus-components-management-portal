import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VcsTab } from './VcsTab'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'
import type { UseMutationResult } from '@tanstack/react-query'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'

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
    // Per-row labels only render when at least one entry exists — the
    // FieldInfo completeness assertion below depends on this fixture row.
    vcsEntries: [
      {
        id: 'vcs-1',
        name: 'main',
        vcsPath: 'ssh://git@example.com/repo.git',
        repositoryType: 'GIT',
        tag: 'v$version',
        branch: 'master',
        hotfixBranch: null,
      },
    ],
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

function makeMutation() {
  return {
    mutateAsync: vi.fn(),
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
        <VcsTab component={component} updateMutation={mutation} toast={toast} canEdit={canEdit} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('VcsTab field descriptions (FieldInfo)', () => {
  // Exact set of registry paths this tab must expose an info icon for.
  // Per-entry paths render once per entry row; the fixture has one row.
  const EXPECTED_PATHS = [
    'vcs.externalRegistry',
    'vcs.entries',
    'vcs.name',
    'vcs.vcsPath',
    'vcs.repositoryType',
    'vcs.branch',
    'vcs.tag',
    'vcs.hotfixBranch',
  ]

  it('renders exactly one info icon per described field (one entry row)', () => {
    renderTab(makeComponent())
    for (const path of EXPECTED_PATHS) {
      expect(
        document.querySelectorAll(`[data-field-path="${path}"]`),
        `info icon for ${path}`,
      ).toHaveLength(1)
    }
  })

  it('repeats the per-entry icons for every entry row', () => {
    const component = makeComponent({
      configurations: [
        makeBaseRow({
          vcsEntries: [
            { id: 'vcs-1', name: 'a', vcsPath: 'ssh://one', repositoryType: 'GIT', tag: null, branch: null, hotfixBranch: null },
            { id: 'vcs-2', name: 'b', vcsPath: 'ssh://two', repositoryType: 'GIT', tag: null, branch: null, hotfixBranch: null },
          ],
        }),
      ],
    })
    renderTab(component)
    expect(document.querySelectorAll('[data-field-path="vcs.vcsPath"]')).toHaveLength(2)
    // Section-level icons stay single regardless of row count.
    expect(document.querySelectorAll('[data-field-path="vcs.entries"]')).toHaveLength(1)
  })

  it('opens the registry description for VCS Path on focus', async () => {
    renderTab(makeComponent())
    const trigger = document.querySelector('[data-field-path="vcs.vcsPath"]') as HTMLElement
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(fieldDescriptions['vcs.vcsPath'])
  })
})
