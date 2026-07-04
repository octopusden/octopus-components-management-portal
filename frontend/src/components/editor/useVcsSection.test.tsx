import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useVcsSection } from './useVcsSection'
import { useFieldConfig } from '../../hooks/useAdminConfig'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { PERMISSIONS, type User } from '../../lib/auth'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

vi.mock('../../hooks/useAdminConfig', () => ({ useFieldConfig: vi.fn() }))
vi.mock('../../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
const mockUseFieldConfig = vi.mocked(useFieldConfig)
const mockUseCurrentUser = vi.mocked(useCurrentUser)

const adminUser: User = {
  username: 'admin', groups: [],
  roles: [{ name: 'ADMIN', permissions: [PERMISSIONS.EDIT_ANY_COMPONENT] }],
}
const regularUser: User = {
  username: 'bob', groups: [],
  roles: [{ name: 'USER', permissions: [PERMISSIONS.ACCESS_COMPONENTS] }],
}

// field-config with External Registry gated adminOnly on the WRITE-SIDE key.
const adminOnlyConfig = { component: { vcsExternalRegistry: { editable: 'adminOnly' } } }

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

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}
function render(component: ComponentDetail) {
  return renderHook(() => useVcsSection(component), { wrapper: wrapper() })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseFieldConfig.mockReturnValue({ data: undefined, isLoading: false, isError: false } as unknown as ReturnType<typeof useFieldConfig>)
  mockUseCurrentUser.mockReturnValue({ data: adminUser } as unknown as ReturnType<typeof useCurrentUser>)
})

describe('useVcsSection — Whiskey-only visibility', () => {
  it('showExternalRegistry is true when the BASE build system is WHISKEY', () => {
    const { result } = render(makeComponent())
    expect(result.current.showExternalRegistry).toBe(true)
  })

  it('showExternalRegistry is false for a non-Whiskey build system', () => {
    const { result } = render(makeComponent({}, makeBaseRow({ build: { buildSystem: 'MAVEN' } })))
    expect(result.current.showExternalRegistry).toBe(false)
  })

  it('showExternalRegistry is false when there is no build aspect', () => {
    const { result } = render(makeComponent({}, makeBaseRow({ build: null })))
    expect(result.current.showExternalRegistry).toBe(false)
  })

  it('omits vcsExternalRegistry from the PATCH when the field is hidden (non-Whiskey)', () => {
    const { result } = render(
      makeComponent({ vcsExternalRegistry: 'reg' }, makeBaseRow({ build: { buildSystem: 'MAVEN' } })),
    )
    expect('vcsExternalRegistry' in result.current.slice.request).toBe(false)
  })
})

describe('useVcsSection — admin-gated editability', () => {
  it('externalRegistryEditable is true for an admin (EDIT_ANY_COMPONENT) under adminOnly', () => {
    mockUseFieldConfig.mockReturnValue({ data: adminOnlyConfig, isLoading: false, isError: false } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: adminUser } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = render(makeComponent())
    expect(result.current.externalRegistryEditable).toBe(true)
  })

  it('externalRegistryEditable is false for a non-admin under adminOnly', () => {
    mockUseFieldConfig.mockReturnValue({ data: adminOnlyConfig, isLoading: false, isError: false } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: regularUser } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = render(makeComponent())
    expect(result.current.externalRegistryEditable).toBe(false)
  })

  it('omits vcsExternalRegistry from the PATCH for a non-admin under adminOnly', () => {
    mockUseFieldConfig.mockReturnValue({ data: adminOnlyConfig, isLoading: false, isError: false } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: regularUser } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = render(makeComponent({ vcsExternalRegistry: 'reg' }))
    expect('vcsExternalRegistry' in result.current.slice.request).toBe(false)
    // baseConfiguration (unmapped) is always kept.
    expect(result.current.slice.request.baseConfiguration).toBeDefined()
  })

  it('includes vcsExternalRegistry for an admin under adminOnly', () => {
    mockUseFieldConfig.mockReturnValue({ data: adminOnlyConfig, isLoading: false, isError: false } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: adminUser } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = render(makeComponent({ vcsExternalRegistry: 'reg' }))
    expect(result.current.slice.request.vcsExternalRegistry).toBe('reg')
  })

  // Fail-closed: while field-config is still loading we must NOT flash editable
  // nor leak the field into the PATCH (a non-admin would otherwise get an
  // enabled dropdown + a leaked write for the brief loading window).
  it('is non-editable and omits the field while field-config is loading', () => {
    mockUseFieldConfig.mockReturnValue({ data: undefined, isLoading: true, isError: false } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: adminUser } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = render(makeComponent({ vcsExternalRegistry: 'reg' }))
    expect(result.current.externalRegistryEditable).toBe(false)
    expect('vcsExternalRegistry' in result.current.slice.request).toBe(false)
  })

  it('is non-editable and omits the field on a field-config error', () => {
    mockUseFieldConfig.mockReturnValue({ data: undefined, isLoading: false, isError: true } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: adminUser } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = render(makeComponent({ vcsExternalRegistry: 'reg' }))
    expect(result.current.externalRegistryEditable).toBe(false)
    expect('vcsExternalRegistry' in result.current.slice.request).toBe(false)
  })
})

describe('useVcsSection — ""-clear round trip', () => {
  it('sends "" (not null) when the registry is cleared', () => {
    const { result } = render(makeComponent({ vcsExternalRegistry: 'reg' }))
    act(() => result.current.setExternalRegistry(''))
    expect(result.current.slice.request.vcsExternalRegistry).toBe('')
    expect(result.current.slice.isDirty).toBe(true)
  })

  it('an untouched empty registry sends "" as a no-op and stays not dirty', () => {
    const { result } = render(makeComponent({ vcsExternalRegistry: '' }))
    expect(result.current.slice.request.vcsExternalRegistry).toBe('')
    expect(result.current.slice.isDirty).toBe(false)
  })
})
