import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FieldConfigEditor } from './FieldConfigEditor'
import { useFieldConfig, useUpdateFieldConfig } from '../../hooks/useAdminConfig'

vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: vi.fn(),
  useUpdateFieldConfig: vi.fn(),
}))

const mockUseFieldConfig = vi.mocked(useFieldConfig)
const mockUseUpdateFieldConfig = vi.mocked(useUpdateFieldConfig)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const mutate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockUseUpdateFieldConfig.mockReturnValue({
    mutate,
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useUpdateFieldConfig>)
})

function renderEditor(data: Record<string, unknown> = {}) {
  mockUseFieldConfig.mockReturnValue({
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useFieldConfig>)
  return render(<FieldConfigEditor />, { wrapper: makeWrapper() })
}

// ---------------------------------------------------------------------------
// Loading + Error states
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — states', () => {
  it('renders loading skeleton when isLoading is true', () => {
    mockUseFieldConfig.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useFieldConfig>)
    render(<FieldConfigEditor />, { wrapper: makeWrapper() })
    // Skeleton divs — check loading state is rendered (no table headers)
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

// ---------------------------------------------------------------------------
// Catalog rows rendered
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — catalog rows', () => {
  it('renders Component Fields and Build Fields section headings', () => {
    renderEditor({})
    expect(screen.getByText('Component Fields')).toBeDefined()
    expect(screen.getByText('Build Fields')).toBeDefined()
  })

  it('renders all expected component field rows', () => {
    renderEditor({})
    // groupId remains in the catalog (locked). R1: `group` is no longer mandatory
    // and is migration-owned; the row is retained pending the R3 admin UX rework.
    const componentFields = ['name', 'displayName', 'solution', 'componentOwner', 'system', 'productType', 'clientCode', 'groupId', 'distributionExplicit', 'distributionExternal']
    for (const field of componentFields) {
      // Each field label appears in the table (may appear in multiple cells/elements)
      const elements = screen.getAllByText(field)
      expect(elements.length).toBeGreaterThan(0)
    }
  })

  it('renders all expected build field rows', () => {
    renderEditor({})
    const buildFields = ['buildSystem', 'javaVersion', 'gradleVersion']
    for (const field of buildFields) {
      const elements = screen.getAllByText(field)
      expect(elements.length).toBeGreaterThan(0)
    }
  })

  it('renders (locked) badge next to locked fields', () => {
    renderEditor({})
    // ui-swift-sloth §3.5: groupId joins `name` as a locked row, so the
    // badge now appears at least twice.
    const badges = screen.getAllByText('(locked)')
    expect(badges.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Locked rows have disabled controls
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — locked rows', () => {
  it('name field visibility select is disabled', () => {
    renderEditor({})
    // The locked row for "name" should have a disabled combobox
    const comboboxes = screen.getAllByRole('combobox')
    // Find the one corresponding to the "name" row — it's the first in Component Fields
    // All locked visibility selects are disabled
    const disabledComboboxes = comboboxes.filter((el) => el.hasAttribute('disabled') || el.getAttribute('data-disabled') !== null)
    expect(disabledComboboxes.length).toBeGreaterThan(0)
  })

  it('name field required checkbox is disabled', () => {
    renderEditor({})
    // Use exact label to avoid matching 'displayName required'
    const checkbox = screen.getByRole('checkbox', { name: 'name required' })
    expect(checkbox).toBeDisabled()
  })

  it('groupId row is locked: visibility select + required checkbox disabled (ui-swift-sloth §3.5)', () => {
    renderEditor({})
    // Visibility combobox for groupId — locked → disabled.
    const groupIdVisibility = screen.getByRole('combobox', { name: /groupId visibility/ })
    expect(
      groupIdVisibility.hasAttribute('disabled') ||
        groupIdVisibility.getAttribute('data-disabled') !== null,
    ).toBe(true)
    const groupIdRequired = screen.getByRole('checkbox', { name: 'groupId required' })
    expect(groupIdRequired).toBeDisabled()
  })

  it('locked rows force visibility=editable + required=true regardless of stored config (PR #44 P3)', () => {
    // Fresh DB / empty field-config OR stale config with the wrong values:
    // locked rows MUST display + serialise the contract values, not whatever
    // the stored data happens to be. Previously the disabled cells just sat
    // on whatever defaults `readEntry` produced (visibility=editable,
    // required=false) so a fresh-DB Save wrote `required: false` for both
    // `name` and `groupId`, contradicting the backend contract.
    renderEditor({
      component: {
        // Stored stale: groupId hidden + not-required. The editor must
        // ignore both and show the locked contract values.
        groupId: { visibility: 'hidden', required: false },
        // Also exercise the `name` row with a similarly bad stored shape.
        name: { visibility: 'readonly', required: false },
      },
    })

    // Visibility cells reflect the FORCED value, not the stored value.
    const groupIdVisibility = screen.getByRole('combobox', { name: /groupId visibility/ })
    expect(groupIdVisibility.getAttribute('data-visibility')).toBe('editable')
    const nameVisibility = screen.getByRole('combobox', { name: /name visibility/ })
    expect(nameVisibility.getAttribute('data-visibility')).toBe('editable')

    // Required cells reflect the FORCED value too.
    const groupIdRequired = screen.getByRole('checkbox', { name: 'groupId required' }) as HTMLInputElement
    expect(groupIdRequired.checked).toBe(true)
    const nameRequired = screen.getByRole('checkbox', { name: 'name required' }) as HTMLInputElement
    expect(nameRequired.checked).toBe(true)
  })

  it('Save serialises locked-row contract values even with stale stored config (PR #44 P3)', () => {
    renderEditor({
      component: {
        groupId: { visibility: 'hidden', required: false, defaultValue: 'org.example' },
        name: { visibility: 'hidden', required: false },
      },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    const payload = mutate.mock.calls[0]![0] as {
      component: Record<string, { visibility: string; required: boolean; defaultValue?: string }>
    }
    expect(payload.component.groupId).toMatchObject({ visibility: 'editable', required: true })
    // Editable cells survive the forcing — defaultValue is admin-owned, not
    // contract-owned, so it must round-trip from stored data.
    expect(payload.component.groupId!.defaultValue).toBe('org.example')
    expect(payload.component.name).toMatchObject({ visibility: 'editable', required: true })
  })
})

// ---------------------------------------------------------------------------
// Visibility-cell accessibility + data-attribute hooks (PR-2 / §7.0.5)
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — visibility a11y + data hooks', () => {
  it('emits data-visibility on each visibility SelectTrigger reflecting current value', () => {
    renderEditor({
      component: {
        displayName: { visibility: 'editable' },
        clientCode:  { visibility: 'readonly' },
        solution:    { visibility: 'hidden' },
      },
    })
    expect(
      screen.getByRole('combobox', { name: /displayName visibility/ })
        .getAttribute('data-visibility'),
    ).toBe('editable')
    expect(
      screen.getByRole('combobox', { name: /clientCode visibility/ })
        .getAttribute('data-visibility'),
    ).toBe('readonly')
    expect(
      screen.getByRole('combobox', { name: /solution visibility/ })
        .getAttribute('data-visibility'),
    ).toBe('hidden')
  })

  it('uses field-specific aria-label so multiple visibility comboboxes can be targeted by name', () => {
    renderEditor({})
    // Two different fields → two distinguishable accessible names.
    const displayNameCombo = screen.getByRole('combobox', { name: /displayName visibility/ })
    const clientCodeCombo = screen.getByRole('combobox', { name: /clientCode visibility/ })
    expect(displayNameCombo).not.toBe(clientCodeCombo)
  })
})

// ---------------------------------------------------------------------------
// Reads existing server data (sectioned shape)
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — reads server data', () => {
  it('initialises draft from sectioned shape', () => {
    renderEditor({
      component: {
        displayName: { visibility: 'readonly', required: false, defaultValue: 'My Component' },
      },
    })
    // Default value input for displayName should show 'My Component'
    const inputs = screen.getAllByPlaceholderText('—')
    // Find the one whose value is 'My Component'
    const target = inputs.find((el) => (el as HTMLInputElement).value === 'My Component')
    expect(target).toBeDefined()
  })

  it('initialises draft from flat shape (backward-compat)', () => {
    renderEditor({
      fields: {
        'component.clientCode': { visibility: 'hidden', defaultValue: 'CC-001' },
      },
    })
    const inputs = screen.getAllByPlaceholderText('—')
    const target = inputs.find((el) => (el as HTMLInputElement).value === 'CC-001')
    expect(target).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Save writes sectioned output (ADR-011)
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — save', () => {
  it('Save button calls mutate', () => {
    renderEditor({})
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('save payload has sectioned shape with component and build keys', () => {
    renderEditor({})
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mutate).toHaveBeenCalledTimes(1)
    const payload = mutate.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).toHaveProperty('component')
    expect(payload).toHaveProperty('build')
    expect(typeof payload.component).toBe('object')
    expect(typeof payload.build).toBe('object')
  })

  it('save payload includes all catalog fields in correct sections', () => {
    renderEditor({})
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    const payload = mutate.mock.calls[0]![0] as {
      component: Record<string, unknown>
      build: Record<string, unknown>
    }
    // Component section fields
    expect(payload.component).toHaveProperty('name')
    expect(payload.component).toHaveProperty('displayName')
    expect(payload.component).toHaveProperty('clientCode')
    expect(payload.component).toHaveProperty('productType')
    expect(payload.component).toHaveProperty('groupId')
    // Build section fields
    expect(payload.build).toHaveProperty('buildSystem')
    expect(payload.build).toHaveProperty('javaVersion')
    expect(payload.build).toHaveProperty('gradleVersion')
  })

  it('save payload component fields do NOT appear in build section and vice versa', () => {
    renderEditor({})
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    const payload = mutate.mock.calls[0]![0] as {
      component: Record<string, unknown>
      build: Record<string, unknown>
    }
    expect(payload.component).not.toHaveProperty('buildSystem')
    expect(payload.build).not.toHaveProperty('name')
    expect(payload.build).not.toHaveProperty('displayName')
  })

  it('Reset button resets draft to server data without calling mutate', () => {
    renderEditor({
      component: { displayName: { defaultValue: 'Original' } },
    })
    // Change an input
    const inputs = screen.getAllByPlaceholderText('—')
    const originalInput = inputs.find((el) => (el as HTMLInputElement).value === 'Original')
    expect(originalInput).toBeDefined()
    fireEvent.change(originalInput!, { target: { value: 'Modified' } })

    // Reset
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(mutate).not.toHaveBeenCalled()
    // After reset the value should be back to 'Original'
    const inputs2 = screen.getAllByPlaceholderText('—')
    const resetInput = inputs2.find((el) => (el as HTMLInputElement).value === 'Original')
    expect(resetInput).toBeDefined()
  })

  it('shows save error when mutation fails', () => {
    mockUseUpdateFieldConfig.mockReturnValue({
      mutate,
      isPending: false,
      error: new Error('Save failed reason'),
    } as unknown as ReturnType<typeof useUpdateFieldConfig>)
    renderEditor({})
    expect(screen.getByText(/Save failed/)).toBeDefined()
    expect(screen.getByText(/Save failed reason/)).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Searchable column + new jira/vcs sections (item 10)
// ---------------------------------------------------------------------------

describe('FieldConfigEditor — searchable column', () => {
  it('renders a Searchable column header (once per section table)', () => {
    renderEditor({})
    expect(screen.getAllByText('Searchable').length).toBeGreaterThan(0)
  })

  it('renders the Jira Fields and VCS Fields section headings', () => {
    renderEditor({})
    expect(screen.getByText('Jira Fields')).toBeDefined()
    expect(screen.getByText('VCS Fields')).toBeDefined()
  })

  it('renders the new relationship + jira + vcs catalog rows', () => {
    renderEditor({})
    for (const field of [
      'parentComponentName',
      'canBeParent',
      'groupKey',
      'projectKey',
      'technical',
      'vcsPath',
      'branch',
    ]) {
      expect(screen.getAllByText(field).length).toBeGreaterThan(0)
    }
  })

  it('emits data-searchable reflecting the stored searchable value', () => {
    renderEditor({
      component: { solution: { searchable: 'Main' } },
    })
    expect(
      screen
        .getByRole('combobox', { name: /solution searchable/ })
        .getAttribute('data-searchable'),
    ).toBe('Main')
  })

  it('defaults searchable from DEFAULT_SEARCHABILITY when no entry is stored', () => {
    renderEditor({})
    // system → Main (an always-visible filter); solution → Extended.
    expect(
      screen
        .getByRole('combobox', { name: /^system searchable$/ })
        .getAttribute('data-searchable'),
    ).toBe('Main')
    expect(
      screen
        .getByRole('combobox', { name: /solution searchable/ })
        .getAttribute('data-searchable'),
    ).toBe('Extended')
  })

  it('maps a legacy filterable:false entry to searchable None', () => {
    renderEditor({
      component: { clientCode: { filterable: false } },
    })
    expect(
      screen
        .getByRole('combobox', { name: /clientCode searchable/ })
        .getAttribute('data-searchable'),
    ).toBe('None')
  })

  it('save payload carries searchable on entries and includes jira + vcs sections', () => {
    renderEditor({})
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    const payload = mutate.mock.calls[0]![0] as {
      component: Record<string, { searchable?: string }>
      build: Record<string, unknown>
      jira: Record<string, unknown>
      vcs: Record<string, unknown>
    }
    expect(payload).toHaveProperty('jira')
    expect(payload).toHaveProperty('vcs')
    expect(payload.jira).toHaveProperty('projectKey')
    expect(payload.jira).toHaveProperty('technical')
    expect(payload.vcs).toHaveProperty('vcsPath')
    expect(payload.vcs).toHaveProperty('branch')
    // Each entry now serialises its search placement.
    expect(payload.component.solution!.searchable).toBe('Extended')
    expect(payload.component.system!.searchable).toBe('Main')
  })
})
