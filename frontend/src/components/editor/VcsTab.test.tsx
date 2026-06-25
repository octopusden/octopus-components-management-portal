import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VcsTab } from './VcsTab'
import { useVcsSection } from './useVcsSection'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

function makeBaseRow(overrides: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null,
    isSyntheticBase: false, build: null, escrow: null, jira: null,
    vcsEntries: [
      { id: 'vcs-1', sortOrder: 0, name: 'main', vcsPath: 'ssh://git@example.com/repo.git', repositoryType: 'GIT', tag: 'v$version', branch: 'master', hotfixBranch: null },
    ],
    mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
    ...overrides,
  }
}

function makeComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1', name: 'my-component', displayName: 'My Component', componentOwner: 'alice',
    productType: null, system: null, clientCode: null, solution: false, parentComponentName: null,
    archived: false, version: 5, createdAt: null, updatedAt: null, labels: [], docs: [], artifactIds: [],
    securityGroups: [], teamcityProjects: [], configurations: [makeBaseRow()],
    ...overrides,
  }
}

const mockUseAdminFieldConfig = vi.fn()
vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: () => mockUseAdminFieldConfig(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAdminFieldConfig.mockReturnValue({ data: undefined, isLoading: false, isError: false })
})

const captured: { section?: ReturnType<typeof useVcsSection> } = {}
function Harness({ component, canEdit = true }: { component: ComponentDetail; canEdit?: boolean }) {
  const section = useVcsSection(component)
  captured.section = section
  return (
    <TooltipProvider>
      <VcsTab section={section} canEdit={canEdit} />
    </TooltipProvider>
  )
}
function renderTab(component: ComponentDetail, canEdit = true) {
  captured.section = undefined
  return render(<Harness component={component} canEdit={canEdit} />)
}

describe('VcsTab — slice (combined save)', () => {
  it('carries external registry + entries in the slice', () => {
    renderTab(makeComponent({ vcsExternalRegistry: 'reg' }))
    expect(captured.section!.slice.request.vcsExternalRegistry).toBe('reg')
    expect(captured.section!.slice.request.baseConfiguration?.vcsEntries?.[0]?.vcsPath).toBe('ssh://git@example.com/repo.git')
  })

  it('editing external registry marks the slice dirty', async () => {
    renderTab(makeComponent({ vcsExternalRegistry: '' }))
    expect(captured.section!.slice.isDirty).toBe(false)
    await userEvent.type(screen.getByPlaceholderText('External registry URL'), 'x')
    expect(captured.section!.slice.isDirty).toBe(true)
  })
})

describe('VcsTab — field-config label overrides', () => {
  it('renders the config label override instead of the hardcoded label', () => {
    mockUseAdminFieldConfig.mockReturnValue({
      data: { vcs: { externalRegistry: { label: 'Example Label' } } },
      isLoading: false, isError: false,
    })
    renderTab(makeComponent())
    expect(screen.getByText('Example Label')).toBeDefined()
    expect(screen.queryByText('External Registry')).toBeNull()
  })
})

describe('VcsTab field descriptions (FieldInfo)', () => {
  const EXPECTED_PATHS = [
    'vcs.externalRegistry', 'vcs.entries', 'vcs.name', 'vcs.vcsPath',
    'vcs.repositoryType', 'vcs.branch', 'vcs.tag', 'vcs.hotfixBranch',
  ]

  it('renders exactly one info icon per described field (one entry row)', () => {
    renderTab(makeComponent())
    for (const path of EXPECTED_PATHS) {
      expect(document.querySelectorAll(`[data-field-path="${path}"]`), `info icon for ${path}`).toHaveLength(1)
    }
  })

  it('repeats the per-entry icons for every entry row', () => {
    renderTab(makeComponent({
      configurations: [makeBaseRow({
        vcsEntries: [
          { id: 'vcs-1', sortOrder: 0, name: 'a', vcsPath: 'ssh://one', repositoryType: 'GIT', tag: null, branch: null, hotfixBranch: null },
          { id: 'vcs-2', sortOrder: 1, name: 'b', vcsPath: 'ssh://two', repositoryType: 'GIT', tag: null, branch: null, hotfixBranch: null },
        ],
      })],
    }))
    expect(document.querySelectorAll('[data-field-path="vcs.vcsPath"]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-field-path="vcs.entries"]')).toHaveLength(1)
  })

  it('opens the registry description for VCS Path on focus', async () => {
    renderTab(makeComponent())
    const trigger = document.querySelector('[data-field-path="vcs.vcsPath"]') as HTMLElement
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(fieldDescriptions['vcs.vcsPath']!)
  })
})
