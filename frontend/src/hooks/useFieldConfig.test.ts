import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useFieldConfigOptions,
  useFieldConfigEntry,
  useFieldLabel,
  useFieldEditable,
  isFieldEditableFor,
  labelFor,
  searchabilityFor,
  DEFAULT_SEARCHABILITY,
} from './useFieldConfig'
import { useFieldConfig } from './useAdminConfig'
import { useCurrentUser } from './useCurrentUser'
import { PERMISSIONS, type User } from '../lib/auth'

vi.mock('./useAdminConfig', () => ({
  useFieldConfig: vi.fn(),
  useUpdateFieldConfig: vi.fn(),
  useComponentDefaults: vi.fn(),
  useUpdateComponentDefaults: vi.fn(),
  useMigrateDefaults: vi.fn(),
}))
vi.mock('./useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
const mockUseFieldConfig = vi.mocked(useFieldConfig)
const mockUseCurrentUser = vi.mocked(useCurrentUser)

const adminUser: User = {
  username: 'admin',
  groups: [],
  roles: [{ name: 'ADMIN', permissions: [PERMISSIONS.EDIT_ANY_COMPONENT] }],
}
const regularUser: User = {
  username: 'bob',
  groups: [],
  roles: [{ name: 'USER', permissions: [PERMISSIONS.ACCESS_COMPONENTS] }],
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
// useFieldConfigOptions (backward-compat thin wrapper)
// ---------------------------------------------------------------------------

describe('useFieldConfigOptions', () => {
  it('returns empty options while loading', () => {
    mockUseFieldConfig.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigOptions('buildSystem'),
      { wrapper: makeWrapper() },
    )
    expect(result.current).toEqual({ options: [], isLoading: true })
  })

  it('returns empty options when field has no config', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { fields: {} },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigOptions('buildSystem'),
      { wrapper: makeWrapper() },
    )
    expect(result.current).toEqual({ options: [], isLoading: false })
  })

  it('returns options when field config has options', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { fields: { buildSystem: { options: ['MAVEN', 'GRADLE'] } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigOptions('buildSystem'),
      { wrapper: makeWrapper() },
    )
    expect(result.current).toEqual({ options: ['MAVEN', 'GRADLE'], isLoading: false })
  })

  it('returns empty options when data is null', () => {
    mockUseFieldConfig.mockReturnValue({ data: null, isLoading: false } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigOptions('buildSystem'),
      { wrapper: makeWrapper() },
    )
    expect(result.current).toEqual({ options: [], isLoading: false })
  })
})

// ---------------------------------------------------------------------------
// labelFor / useFieldLabel — config-driven display-label overrides
// ---------------------------------------------------------------------------

describe('labelFor', () => {
  it('returns the config label when set', () => {
    const data = { build: { projectVersion: { label: 'Example Label' } } }
    expect(labelFor(data, 'build.projectVersion', 'Project Version')).toBe('Example Label')
  })

  it('trims the config label', () => {
    const data = { build: { projectVersion: { label: '  Example Label  ' } } }
    expect(labelFor(data, 'build.projectVersion', 'Project Version')).toBe('Example Label')
  })

  it('falls back when the field has no config entry', () => {
    expect(labelFor({ build: {} }, 'build.projectVersion', 'Project Version')).toBe('Project Version')
    expect(labelFor(undefined, 'build.projectVersion', 'Project Version')).toBe('Project Version')
  })

  it('falls back when the config label is blank', () => {
    const data = { build: { projectVersion: { label: '   ' } } }
    expect(labelFor(data, 'build.projectVersion', 'Project Version')).toBe('Project Version')
  })

  it('resolves labels for distribution-section paths', () => {
    // Distribution paths nest deeper than one dot; the resolver splits on the
    // FIRST dot, so the remainder is the field key within the section.
    const data = { distribution: { 'maven.groupPattern': { label: 'Example Label' } } }
    expect(labelFor(data, 'distribution.maven.groupPattern', 'Group Pattern')).toBe('Example Label')
  })
})

describe('useFieldLabel', () => {
  it('returns the config label when present and the fallback otherwise', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { build: { projectVersion: { label: 'Example Label' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldLabel('build.projectVersion', 'Project Version'),
      { wrapper: makeWrapper() },
    )
    expect(result.current).toBe('Example Label')

    const { result: fallback } = renderHook(
      () => useFieldLabel('build.javaVersion', 'Java Version'),
      { wrapper: makeWrapper() },
    )
    expect(fallback.current).toBe('Java Version')
  })
})

// ---------------------------------------------------------------------------
// useFieldConfigEntry — path resolution
// ---------------------------------------------------------------------------

describe('useFieldConfigEntry', () => {
  it('returns loading state with editable defaults while loading', () => {
    mockUseFieldConfig.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('component.displayName'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.isLoading).toBe(true)
    expect(result.current.entry.visibility).toBe('editable')
    expect(result.current.entry.required).toBe(false)
  })

  // --- Sectioned shape ---

  it('resolves section-prefixed path from sectioned data', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { displayName: { visibility: 'readonly', required: true } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('component.displayName'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.entry.visibility).toBe('readonly')
    expect(result.current.entry.required).toBe(true)
    expect(result.current.isLoading).toBe(false)
  })

  it('resolves build section-prefixed path from sectioned data', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { build: { javaVersion: { visibility: 'hidden', defaultValue: '21' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('build.javaVersion'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.entry.visibility).toBe('hidden')
    expect(result.current.entry.defaultValue).toBe('21')
  })

  // --- Flat shape ---

  it('resolves section-prefixed path from flat data (fallback)', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { fields: { 'component.displayName': { visibility: 'readonly', options: ['A'] } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('component.displayName'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.entry.visibility).toBe('readonly')
    expect(result.current.entry.options).toEqual(['A'])
  })

  it('resolves bare path from flat data', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { fields: { productType: { options: ['TYPE_A', 'TYPE_B'], visibility: 'editable' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('productType'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.entry.options).toEqual(['TYPE_A', 'TYPE_B'])
    expect(result.current.entry.visibility).toBe('editable')
  })

  // --- Both shapes present — sectioned wins for section-prefixed path ---

  it('sectioned shape wins over flat for section-prefixed path when both present', () => {
    mockUseFieldConfig.mockReturnValue({
      data: {
        component: { displayName: { visibility: 'hidden' } },
        fields: { 'component.displayName': { visibility: 'readonly' } },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('component.displayName'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.entry.visibility).toBe('hidden')
  })

  // --- Bare path falls through sections ---

  it('resolves bare path from component section when no flat fields', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { productType: { options: ['TYPE_C'], visibility: 'editable' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('productType'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.entry.options).toEqual(['TYPE_C'])
  })

  it('resolves bare path from build section as fallback', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { build: { gradleVersion: { defaultValue: '8.6', visibility: 'editable' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('gradleVersion'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.entry.defaultValue).toBe('8.6')
  })

  // --- Graceful fallbacks ---

  it('returns graceful defaults for missing entry', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: {} },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('component.missing'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.entry.visibility).toBe('editable')
    expect(result.current.entry.required).toBe(false)
    expect(result.current.entry.defaultValue).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
  })

  it('returns graceful defaults when data is empty object', () => {
    mockUseFieldConfig.mockReturnValue({
      data: {},
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('component.displayName'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.entry.visibility).toBe('editable')
    expect(result.current.entry.required).toBe(false)
  })

  // --- Error propagation ---

  it('exposes isError when the underlying field-config query has failed', () => {
    mockUseFieldConfig.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('component.groupId'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.isError).toBe(true)
    // Still returns the graceful-defaults entry so consumers don't crash
    expect(result.current.entry.visibility).toBe('editable')
    expect(result.current.entry.required).toBe(false)
  })

  it('isError is false while loading', () => {
    mockUseFieldConfig.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('component.groupId'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.isError).toBe(false)
    expect(result.current.isLoading).toBe(true)
  })

  it('isError is false on successful load', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { component: { groupId: { defaultValue: 'com.example' } } },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigEntry('component.groupId'),
      { wrapper: makeWrapper() },
    )
    expect(result.current.isError).toBe(false)
    expect(result.current.entry.defaultValue).toBe('com.example')
  })
})

// ---------------------------------------------------------------------------
// isFieldEditableFor — pure effective-editability resolver (entry + user)
// ---------------------------------------------------------------------------

describe('isFieldEditableFor', () => {
  const data = {
    jira: {
      technical: { editable: 'adminOnly' },
      projectKey: {}, // no editable axis → treated as 'all'
      lineVersionFormat: { editable: 'all' },
      versionFormat: { editable: 'none' },
      displayName: { visibility: 'readonly' },
      buildVersionFormat: { visibility: 'hidden' },
    },
  }

  it('adminOnly requires the EDIT_ANY_COMPONENT permission', () => {
    expect(isFieldEditableFor(data, 'jira.technical', adminUser)).toBe(true)
    expect(isFieldEditableFor(data, 'jira.technical', regularUser)).toBe(false)
  })

  it('adminOnly fails closed when the user is unavailable (null/undefined)', () => {
    expect(isFieldEditableFor(data, 'jira.technical', null)).toBe(false)
    expect(isFieldEditableFor(data, 'jira.technical', undefined)).toBe(false)
  })

  it('editable:none is never editable, even for an admin', () => {
    expect(isFieldEditableFor(data, 'jira.versionFormat', adminUser)).toBe(false)
  })

  it('readonly / hidden visibility is not editable', () => {
    expect(isFieldEditableFor(data, 'jira.displayName', adminUser)).toBe(false)
    expect(isFieldEditableFor(data, 'jira.buildVersionFormat', adminUser)).toBe(false)
  })

  it('absent or all editable is user-independent (editable for anyone, incl. null)', () => {
    expect(isFieldEditableFor(data, 'jira.projectKey', regularUser)).toBe(true)
    expect(isFieldEditableFor(data, 'jira.projectKey', null)).toBe(true)
    expect(isFieldEditableFor(data, 'jira.lineVersionFormat', regularUser)).toBe(true)
  })

  it('an unconfigured path defaults to editable', () => {
    expect(isFieldEditableFor(data, 'jira.nope', regularUser)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// useFieldEditable — composes the entry + current user; fails closed on load
// ---------------------------------------------------------------------------

describe('useFieldEditable', () => {
  it('fails closed while the current user is still loading', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { jira: { projectKey: {} } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = renderHook(() => useFieldEditable('jira.projectKey'), { wrapper: makeWrapper() })
    expect(result.current).toBe(false)
  })

  it('fails closed while the field-config is still loading', () => {
    mockUseFieldConfig.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: regularUser, isLoading: false } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = renderHook(() => useFieldEditable('jira.projectKey'), { wrapper: makeWrapper() })
    expect(result.current).toBe(false)
  })

  it('resolves an adminOnly field from the current user permissions', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { jira: { technical: { editable: 'adminOnly' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: adminUser, isLoading: false } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = renderHook(() => useFieldEditable('jira.technical'), { wrapper: makeWrapper() })
    expect(result.current).toBe(true)
  })

  it('denies an adminOnly field to a regular user', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { jira: { technical: { editable: 'adminOnly' } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: regularUser, isLoading: false } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = renderHook(() => useFieldEditable('jira.technical'), { wrapper: makeWrapper() })
    expect(result.current).toBe(false)
  })

  it('fails closed when the field-config query errored (entry degrades to editable default)', () => {
    mockUseFieldConfig.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: regularUser, isLoading: false } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = renderHook(() => useFieldEditable('jira.technical'), { wrapper: makeWrapper() })
    expect(result.current).toBe(false)
  })

  it('allows an ordinary (all) field for a logged-in regular user', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { jira: { projectKey: {} } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    mockUseCurrentUser.mockReturnValue({ data: regularUser, isLoading: false } as unknown as ReturnType<typeof useCurrentUser>)
    const { result } = renderHook(() => useFieldEditable('jira.projectKey'), { wrapper: makeWrapper() })
    expect(result.current).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// searchabilityFor — effective Main/Extended/None placement (item 10)
// ---------------------------------------------------------------------------

describe('searchabilityFor', () => {
  it('explicit searchable wins over filterable and the default map', () => {
    // Even with a legacy filterable:false AND a default-map entry, an explicit
    // searchable is authoritative.
    expect(searchabilityFor('component.system', { searchable: 'None', filterable: false })).toBe('None')
    expect(searchabilityFor('component.clientCode', { searchable: 'Main' })).toBe('Main')
  })

  it('maps legacy filterable:false to None when no explicit searchable', () => {
    expect(searchabilityFor('component.clientCode', { filterable: false })).toBe('None')
  })

  it('falls back to DEFAULT_SEARCHABILITY when neither searchable nor filterable set', () => {
    expect(searchabilityFor('component.system', {})).toBe('Main')
    expect(searchabilityFor('component.solution', {})).toBe('Extended')
    expect(searchabilityFor('buildSystem', {})).toBe('Main')
  })

  it('falls back to Extended for an unlisted path', () => {
    expect(searchabilityFor('component.somethingNew', {})).toBe('Extended')
  })

  it('DEFAULT_SEARCHABILITY pins the always-visible (Main) filters', () => {
    expect(DEFAULT_SEARCHABILITY['component.system']).toBe('Main')
    expect(DEFAULT_SEARCHABILITY['buildSystem']).toBe('Main')
    expect(DEFAULT_SEARCHABILITY['component.labels']).toBe('Main')
    expect(DEFAULT_SEARCHABILITY['component.componentOwner']).toBe('Main')
  })
})
