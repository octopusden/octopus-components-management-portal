import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FieldConfigEditor } from './FieldConfigEditor'
import { useFieldConfig } from '../../hooks/useAdminConfig'

// Field configuration is code-as-config (managed in service-config). This view
// is READ-ONLY: it renders the effective stored config with no Save/Reset and no
// editable controls (visibility/searchable show as text, defaults as text).
vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: vi.fn(),
}))

const mockUseFieldConfig = vi.mocked(useFieldConfig)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

function renderEditor(data: Record<string, unknown> = {}) {
  mockUseFieldConfig.mockReturnValue({
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useFieldConfig>)
  return render(<FieldConfigEditor />, { wrapper: makeWrapper() })
}

describe('FieldConfigEditor — states', () => {
  it('renders loading skeleton when isLoading is true', () => {
    mockUseFieldConfig.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<FieldConfigEditor />, { wrapper: makeWrapper() })
    expect(screen.queryByText('Component Fields')).toBeNull()
  })

  it('renders error message when fetch fails', () => {
    mockUseFieldConfig.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<FieldConfigEditor />, { wrapper: makeWrapper() })
    expect(screen.getByText(/Failed to load field configuration/)).toBeDefined()
    expect(screen.getByText(/Network error/)).toBeDefined()
  })
})

describe('FieldConfigEditor — read-only (no write controls)', () => {
  it('renders no Save / Reset buttons', () => {
    renderEditor({})
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull()
  })

  it('required checkboxes are disabled', () => {
    renderEditor({})
    const checkbox = screen.getByRole('checkbox', { name: 'displayName required' })
    expect(checkbox).toBeDisabled()
  })
})

describe('FieldConfigEditor — catalog rows', () => {
  it('renders all four section headings', () => {
    renderEditor({})
    expect(screen.getByText('Component Fields')).toBeDefined()
    expect(screen.getByText('Build Fields')).toBeDefined()
    expect(screen.getByText('Jira Fields')).toBeDefined()
    expect(screen.getByText('VCS Fields')).toBeDefined()
  })

  it('renders all expected field rows across sections', () => {
    renderEditor({})
    const fields = [
      'name', 'displayName', 'solution', 'componentOwner', 'system', 'productType',
      'clientCode', 'groupId', 'distributionExplicit', 'distributionExternal', 'releasesInDefaultBranch',
      'copyright', 'releaseManager', 'securityChampion', 'jiraDisplayName', 'jiraHotfixVersionFormat', 'vcsExternalRegistry',
      'buildSystem', 'javaVersion', 'gradleVersion',
      'parentComponentName', 'canBeParent', 'groupKey', 'projectKey', 'technical',
      'vcsPath', 'branch',
    ]
    for (const field of fields) {
      expect(screen.getAllByText(field).length).toBeGreaterThan(0)
    }
  })

  it('renders (locked) badge next to locked fields (name, groupId, groupKey)', () => {
    renderEditor({})
    expect(screen.getAllByText('(locked)').length).toBeGreaterThanOrEqual(3)
  })
})

describe('FieldConfigEditor — effective values (read-only display)', () => {
  it('locked rows force visibility=editable + required=true regardless of stored config', () => {
    renderEditor({
      component: {
        groupId: { visibility: 'hidden', required: false },
        name: { visibility: 'readonly', required: false },
      },
    })
    expect(screen.getByTestId('component.groupId-visibility').getAttribute('data-visibility')).toBe('editable')
    expect(screen.getByTestId('component.name-visibility').getAttribute('data-visibility')).toBe('editable')
    expect((screen.getByRole('checkbox', { name: 'groupId required' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'name required' }) as HTMLInputElement).checked).toBe(true)
  })

  it('renders stored visibility for non-locked rows (sectioned shape)', () => {
    renderEditor({
      component: {
        displayName: { visibility: 'editable' },
        clientCode: { visibility: 'readonly' },
        solution: { visibility: 'hidden' },
      },
    })
    expect(screen.getByTestId('component.displayName-visibility').getAttribute('data-visibility')).toBe('editable')
    expect(screen.getByTestId('component.clientCode-visibility').getAttribute('data-visibility')).toBe('readonly')
    expect(screen.getByTestId('component.solution-visibility').getAttribute('data-visibility')).toBe('hidden')
  })

  it('renders the stored default value as text (sectioned shape)', () => {
    renderEditor({
      component: { displayName: { visibility: 'readonly', defaultValue: 'My Component' } },
    })
    expect(screen.getByTestId('component.displayName-default').textContent).toBe('My Component')
  })

  it('renders releasesInDefaultBranch as readonly + not searchable from config', () => {
    renderEditor({ component: { releasesInDefaultBranch: { visibility: 'readonly', searchable: 'None' } } })
    expect(screen.getByTestId('component.releasesInDefaultBranch-visibility').getAttribute('data-visibility')).toBe('readonly')
    expect(screen.getByTestId('component.releasesInDefaultBranch-searchable').getAttribute('data-searchable')).toBe('None')
  })

  it('reads the flat shape (backward-compat)', () => {
    renderEditor({
      fields: { 'component.clientCode': { visibility: 'hidden', defaultValue: 'CC-001' } },
    })
    expect(screen.getByTestId('component.clientCode-visibility').getAttribute('data-visibility')).toBe('hidden')
    expect(screen.getByTestId('component.clientCode-default').textContent).toBe('CC-001')
  })
})

describe('FieldConfigEditor — searchable column (read-only)', () => {
  it('renders a Searchable column header per section', () => {
    renderEditor({})
    expect(screen.getAllByText('Searchable').length).toBeGreaterThan(0)
  })

  it('reflects the stored searchable value', () => {
    renderEditor({ component: { solution: { searchable: 'Main' } } })
    expect(screen.getByTestId('component.solution-searchable').getAttribute('data-searchable')).toBe('Main')
  })

  it('defaults searchable from DEFAULT_SEARCHABILITY when no entry is stored', () => {
    renderEditor({})
    // system → Main (always-visible filter); solution → Extended.
    expect(screen.getByTestId('component.system-searchable').getAttribute('data-searchable')).toBe('Main')
    expect(screen.getByTestId('component.solution-searchable').getAttribute('data-searchable')).toBe('Extended')
  })

  it('maps a legacy filterable:false entry to searchable None', () => {
    renderEditor({ component: { clientCode: { filterable: false } } })
    expect(screen.getByTestId('component.clientCode-searchable').getAttribute('data-searchable')).toBe('None')
  })
})
