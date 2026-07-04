import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { VcsTab } from './VcsTab'
import { useVcsSection } from './useVcsSection'
import { NOT_IN_LIST_SUFFIX } from './ExternalRegistrySelect'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import { PERMISSIONS, type User } from '../../lib/auth'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

function makeBaseRow(overrides: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null,
    isSyntheticBase: false, build: { buildSystem: 'WHISKEY' }, escrow: null, jira: null,
    vcsEntries: [
      { id: 'vcs-1', sortOrder: 0, name: 'main', vcsPath: 'ssh://git@example.com/repo.git', repositoryType: 'GIT', tag: 'v$version', branch: 'master', hotfixBranch: null },
    ],
    mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
    ...overrides,
  }
}

function makeComponent(overrides: Partial<ComponentDetail> = {}, baseRow?: ComponentConfiguration): ComponentDetail {
  return {
    id: 'c-1', name: 'my-component', displayName: 'My Component', componentOwner: 'alice',
    productType: null, systems: [], clientCode: null, solution: false, parentComponentName: null,
    archived: false, version: 5, createdAt: null, updatedAt: null, labels: [], docs: [], artifactIds: [],
    securityGroups: [], teamcityProjects: [], configurations: [baseRow ?? makeBaseRow()],
    ...overrides,
  }
}

const adminUser: User = {
  username: 'admin', groups: [],
  roles: [{ name: 'ADMIN', permissions: [PERMISSIONS.EDIT_ANY_COMPONENT] }],
}
const regularUser: User = {
  username: 'bob', groups: [],
  roles: [{ name: 'USER', permissions: [PERMISSIONS.ACCESS_COMPONENTS] }],
}
const adminOnlyConfig = { component: { vcsExternalRegistry: { editable: 'adminOnly' } } }

const mockUseAdminFieldConfig = vi.fn()
vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: () => mockUseAdminFieldConfig(),
}))
vi.mock('../../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../../hooks/useFieldOptions', () => ({ useFieldOptions: vi.fn() }))
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useFieldOptions } from '../../hooks/useFieldOptions'
const mockUseCurrentUser = vi.mocked(useCurrentUser)
const mockUseFieldOptions = vi.mocked(useFieldOptions)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAdminFieldConfig.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  mockUseCurrentUser.mockReturnValue({ data: adminUser } as unknown as ReturnType<typeof useCurrentUser>)
  mockUseFieldOptions.mockReturnValue({ options: [], isLoading: false })
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
})

describe('VcsTab — External Registry Whiskey-only visibility', () => {
  it('renders the External Registry field for a Whiskey component', () => {
    renderTab(makeComponent())
    expect(document.querySelector('[data-field-path="vcs.externalRegistry"]')).not.toBeNull()
  })

  it('hides the External Registry field for a non-Whiskey component', () => {
    renderTab(makeComponent({}, makeBaseRow({ build: { buildSystem: 'MAVEN' } })))
    expect(document.querySelector('[data-field-path="vcs.externalRegistry"]')).toBeNull()
  })
})

describe('VcsTab — External Registry dropdown', () => {
  it('renders a dropdown fed by field-config options', () => {
    mockUseFieldOptions.mockReturnValue({ options: ['reg-a', 'reg-b'], isLoading: false })
    renderTab(makeComponent({ vcsExternalRegistry: 'reg-a' }))
    expect(screen.getByRole('combobox')).toHaveTextContent('reg-a')
  })

  it('shows a stored value absent from the list, tagged not-in-list', () => {
    mockUseFieldOptions.mockReturnValue({ options: ['reg-a'], isLoading: false })
    renderTab(makeComponent({ vcsExternalRegistry: 'legacy-reg' }))
    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveTextContent('legacy-reg')
    expect(trigger).toHaveTextContent(NOT_IN_LIST_SUFFIX)
  })

  it('renders read-only (no dropdown) when no options are configured', () => {
    mockUseFieldOptions.mockReturnValue({ options: [], isLoading: false })
    renderTab(makeComponent({ vcsExternalRegistry: 'reg-x' }))
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByDisplayValue('reg-x')).toBeDefined()
  })
})

describe('VcsTab — External Registry admin gate', () => {
  it('shows an "admin only" pill and disables the dropdown for a non-admin', () => {
    mockUseAdminFieldConfig.mockReturnValue({ data: adminOnlyConfig, isLoading: false, isError: false })
    mockUseCurrentUser.mockReturnValue({ data: regularUser } as unknown as ReturnType<typeof useCurrentUser>)
    mockUseFieldOptions.mockReturnValue({ options: ['reg-a'], isLoading: false })
    renderTab(makeComponent({ vcsExternalRegistry: 'reg-a' }))
    expect(screen.getByText(/admin only/i)).toBeDefined()
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('no pill and an enabled dropdown for an admin', () => {
    mockUseAdminFieldConfig.mockReturnValue({ data: adminOnlyConfig, isLoading: false, isError: false })
    mockUseCurrentUser.mockReturnValue({ data: adminUser } as unknown as ReturnType<typeof useCurrentUser>)
    mockUseFieldOptions.mockReturnValue({ options: ['reg-a'], isLoading: false })
    renderTab(makeComponent({ vcsExternalRegistry: 'reg-a' }))
    expect(screen.queryByText(/admin only/i)).toBeNull()
    expect(screen.getByRole('combobox')).not.toBeDisabled()
  })

  it('honors canEdit — the dropdown is disabled in a read-only page even for an admin', () => {
    mockUseFieldOptions.mockReturnValue({ options: ['reg-a'], isLoading: false })
    renderTab(makeComponent({ vcsExternalRegistry: 'reg-a' }), false)
    expect(screen.getByRole('combobox')).toBeDisabled()
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
    renderTab(makeComponent({}, makeBaseRow({
      vcsEntries: [
        { id: 'vcs-1', sortOrder: 0, name: 'a', vcsPath: 'ssh://one', repositoryType: 'GIT', tag: null, branch: null, hotfixBranch: null },
        { id: 'vcs-2', sortOrder: 1, name: 'b', vcsPath: 'ssh://two', repositoryType: 'GIT', tag: null, branch: null, hotfixBranch: null },
      ],
    })))
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

describe('VcsTab — VCS host validation', () => {
  function renderWithGit(component: ComponentDetail, gitBaseUrl: string) {
    function H() {
      const section = useVcsSection(component)
      return (
        <TooltipProvider>
          <VcsTab section={section} canEdit gitBaseUrl={gitBaseUrl} />
        </TooltipProvider>
      )
    }
    return render(<H />)
  }

  it('flags a VCS path on a non-ecosystem host', () => {
    // makeComponent's entry points at example.com.
    renderWithGit(makeComponent(), 'https://bitbucket.example.com')
    expect(screen.getByText(/vcs host must be bitbucket\.example\.com/i)).toBeDefined()
  })

  it('shows no error when the VCS host matches the ecosystem Bitbucket', () => {
    const c = makeComponent({}, makeBaseRow({
      vcsEntries: [
        { id: 'v1', sortOrder: 0, name: 'main', vcsPath: 'ssh://git@bitbucket.example.com/r.git', repositoryType: 'GIT', tag: 't', branch: 'master', hotfixBranch: null },
      ],
    }))
    renderWithGit(c, 'https://bitbucket.example.com')
    expect(screen.queryByText(/vcs host must be/i)).toBeNull()
  })
})
