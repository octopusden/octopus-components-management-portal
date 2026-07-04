import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ComponentDetailPage } from './ComponentDetailPage'
import type { User } from '@/lib/auth'
import type { ComponentDetail, FieldOverride } from '@/lib/types'

// Item D step 4: the field-override draft is wired into the ONE combined save.
// This suite renders the REAL FieldOverrides table (Overrides tab), queues a
// delete, and asserts it (a) arms the single SaveBar, (b) shows in the unified
// Review diff, and (c) rides the single component PATCH as the desired set.
// Inline editors are stubbed (driven via the table here); GeneralTab is stubbed
// to expose a display-name edit so we can prove General + overrides co-merge.

const mockOverrides = vi.fn<() => FieldOverride[]>()

vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../hooks/useComponent', () => ({
  useComponent: vi.fn(),
  useUpdateComponent: vi.fn(),
  useDeleteComponent: vi.fn(),
  useFieldOverrides: () => ({ data: mockOverrides() }),
}))
vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('../components/AppFooter', () => ({ AppFooter: () => <footer>footer</footer> }))
vi.mock('../hooks/useInfo', () => ({
  usePortalLinks: () => ({ data: undefined }),
  usePortalConfig: () => ({ data: undefined }),
  useCrsInfo: vi.fn(),
  usePortalInfo: () => ({ data: undefined }),
}))
// The always-rendered header labels editor calls useLabelsDictionary; mock it so
// the page test never fires a real api.get('/components/meta/labels/dictionary').
vi.mock('../hooks/useLabelsDictionary', () => ({
  useLabelsDictionary: () => ({ data: [], isLoading: false }),
}))
vi.mock('../hooks/useFieldConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useFieldConfig')>()
  return {
    ...actual,
    useFieldConfigEntry: () => ({ entry: { visibility: 'editable', required: false }, isLoading: false, isError: false }),
    useFieldConfigOptions: () => ({ options: [], isLoading: false }),
  }
})
vi.mock('../hooks/useAdminConfig', () => ({
  useFieldConfig: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('../components/editor/GeneralTab', async () => {
  const actual = await vi.importActual<typeof import('../components/editor/GeneralTab')>('../components/editor/GeneralTab')
  return {
    ...actual,
    GeneralTab: vi.fn(({ component, form }) => {
      useEffect(() => {
        form.setValue('system', component.system ?? '')
        form.setValue('displayName', component.displayName ?? '')
        form.setValue('name', component.name)
      }, [component, form])
      return (
        <button
          data-testid="edit-display-name"
          onClick={() => form.setValue('displayName', 'New General Name', { shouldDirty: true })}
        >
          edit general
        </button>
      )
    }),
  }
})
vi.mock('../components/editor/MiscTab', async () => {
  const actual = await vi.importActual<typeof import('../components/editor/MiscTab')>('../components/editor/MiscTab')
  return { ...actual, MiscTab: () => <div data-testid="misc-tab" /> }
})
// Inline editors not needed — we drive overrides via the real FieldOverrides table.
vi.mock('../components/editor/FieldOverrideInline', () => ({ FieldOverrideInline: () => null }))
vi.mock('../components/editor/ComponentHistoryTab', () => ({ ComponentHistoryTab: () => <div /> }))
vi.mock('../components/editor/ConfigurationsTab', () => ({ ConfigurationsTab: () => <div /> }))
vi.mock('../components/editor/AsCodeTab', () => ({ AsCodeTab: () => <div /> }))
vi.mock('../components/editor/WhoCanEditPanel', () => ({ WhoCanEditPanel: () => <div /> }))
vi.mock('../hooks/useValidationProblems', () => ({
  useValidationProblems: () => ({ byComponent: new Map(), isLoading: false }),
}))
vi.mock('../components/ui/EnumSelect', () => ({
  EnumSelect: ({ value, onValueChange, id }: { value: string; onValueChange: (v: string) => void; id?: string }) => (
    <input id={id} data-testid={id ? `enum-${id}` : 'enum'} value={value} onChange={(e) => onValueChange(e.target.value)} />
  ),
}))

import { useCurrentUser } from '../hooks/useCurrentUser'
import { useComponent, useUpdateComponent, useDeleteComponent } from '../hooks/useComponent'
import { TooltipProvider } from '../components/ui/tooltip'

const baseComponent: ComponentDetail = {
  id: 'comp-1', name: 'my-component', displayName: 'My Component', componentOwner: 'alice',
  productType: null, systems: ['SYS1'], clientCode: null, archived: false, solution: false,
  parentComponentName: null, version: 9, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z',
  labels: [], docs: [], artifactIds: [], securityGroups: [], teamcityProjects: [], canEdit: true,
  configurations: [
    {
      id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null, isSyntheticBase: false,
      build: { buildSystem: 'GRADLE', javaVersion: '17' }, escrow: null, jira: { projectKey: 'PROJ' },
      vcsEntries: [], mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
    },
  ],
}

const seededOverride: FieldOverride = {
  id: 'fo-1', overriddenAttribute: 'build.javaVersion', versionRange: '[1.0,2.0)',
  rowType: 'SCALAR_OVERRIDE', value: '21', markerChildren: null, createdAt: null, updatedAt: null,
}

const idleMutation = {
  mutate: vi.fn(), mutateAsync: vi.fn(() => Promise.resolve()), reset: vi.fn(),
  isPending: false, isSuccess: false, isError: false, isIdle: true, data: undefined, error: null,
  status: 'idle' as const, variables: undefined, submittedAt: 0, failureCount: 0, failureReason: null,
  isPaused: false, context: undefined,
}

function adminUser(): User {
  return { username: 'u', roles: [{ name: 'R', permissions: ['ACCESS_COMPONENTS', 'CREATE_COMPONENTS', 'EDIT_METADATA'] }], groups: [] }
}

function renderPage(mutateAsync = vi.fn(() => Promise.resolve())) {
  vi.mocked(useCurrentUser).mockReturnValue({ data: adminUser(), isLoading: false, isError: false, error: null, refetch: vi.fn() } as unknown as ReturnType<typeof useCurrentUser>)
  vi.mocked(useComponent).mockReturnValue({ data: baseComponent, isLoading: false, error: null } as unknown as ReturnType<typeof useComponent>)
  vi.mocked(useUpdateComponent).mockReturnValue({ ...idleMutation, mutateAsync } as unknown as ReturnType<typeof useUpdateComponent>)
  vi.mocked(useDeleteComponent).mockReturnValue({ ...idleMutation } as unknown as ReturnType<typeof useDeleteComponent>)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/components', element: <div data-testid="list-page" /> },
      { path: '/components/:id', element: <ComponentDetailPage /> },
    ],
    { initialEntries: ['/components/comp-1'] },
  )
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const click = (el: Element) => fireEvent.click(el)
async function openTab(name: RegExp) {
  await userEvent.setup().click(screen.getByRole('tab', { name }))
}
async function deleteSeededOverride() {
  await openTab(/Overrides/)
  click(await screen.findByRole('button', { name: 'Delete override' }))
  await screen.findByText('Delete Override') // confirm dialog
  click(screen.getByRole('button', { name: /^delete$/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOverrides.mockReturnValue([seededOverride])
})

describe('ComponentDetailPage — field overrides in the combined save (item D)', () => {
  it('starts clean, then queuing an override delete arms the single SaveBar', async () => {
    renderPage()
    expect(screen.getByText('All changes saved')).toBeDefined()
    await deleteSeededOverride()
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())
  })

  it('sends ONE PATCH carrying the General edit AND the desired override set; Review lists both', async () => {
    const mutateAsync = vi.fn(() => Promise.resolve())
    renderPage(mutateAsync)

    // General edit (stub) + override delete (real table) accumulate in one draft.
    click(screen.getByTestId('edit-display-name'))
    await deleteSeededOverride()

    // One SaveBar → one Review dialog listing both changes → one Confirm.
    click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByText(/Override.*build\.javaVersion/)).toBeDefined()
    expect(screen.getByText(/\(removed\)/)).toBeDefined()
    click(await screen.findByRole('button', { name: /^confirm$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    const body = (mutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(body.version).toBe(9)
    expect(body.displayName).toBe('New General Name')
    // Desired full set after deleting the only override → empty list (not "untouched").
    expect(body.fieldOverrides).toEqual([])
  })

  it('Discard reverts the queued override delete (row returns, bar clean)', async () => {
    renderPage()
    await deleteSeededOverride()
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())

    click(screen.getByRole('button', { name: /discard/i }))

    await waitFor(() => expect(screen.getByText('All changes saved')).toBeDefined())
    // The override row is back in the table.
    expect(screen.getByRole('button', { name: 'Delete override' })).toBeDefined()
  })
})

// Issue #146 (P3): the same combined-save flow, driven from the REAL Docker
// tab (split out of Distribution in the editor UI-reorg). A per-range
// distribution override delete is NOT reflected in base section state, so this
// is the highest-risk regression: prove it arms the bar, shows in Review, rides
// the one PATCH, and is restored by Discard.
const seededDockerOverride: FieldOverride = {
  id: 'fo-dk', overriddenAttribute: 'distribution.docker', versionRange: '[1.0,2.0)',
  rowType: 'MARKER', value: null,
  markerChildren: { dockerImages: [{ imageName: 'acme/app', flavor: null }] },
  createdAt: null, updatedAt: null,
}

describe('ComponentDetailPage — per-range distribution variant in the combined save (#146)', () => {
  beforeEach(() => mockOverrides.mockReturnValue([seededDockerOverride]))

  async function deleteDockerVariant() {
    await openTab(/Docker/)
    click(await screen.findByRole('button', { name: /delete per-range variant/i }))
  }

  it('deleting a per-range docker variant from the Docker tab arms the SaveBar', async () => {
    renderPage()
    expect(screen.getByText('All changes saved')).toBeDefined()
    await deleteDockerVariant()
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())
  })

  it('sends ONE PATCH with the desired override set (empty after the delete); Review shows the removal', async () => {
    const mutateAsync = vi.fn(() => Promise.resolve())
    renderPage(mutateAsync)
    await deleteDockerVariant()

    click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByText(/\(removed\)/)).toBeDefined()
    click(await screen.findByRole('button', { name: /^confirm$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce())
    const body = (mutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(body.version).toBe(9)
    expect(body.fieldOverrides).toEqual([])
  })

  it('Discard restores the deleted per-range variant (row + delete button return, bar clean)', async () => {
    renderPage()
    await deleteDockerVariant()
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())

    click(screen.getByRole('button', { name: /discard/i }))

    await waitFor(() => expect(screen.getByText('All changes saved')).toBeDefined())
    expect(await screen.findByRole('button', { name: /delete per-range variant/i })).toBeDefined()
  })
})
