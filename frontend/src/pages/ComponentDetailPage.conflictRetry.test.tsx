import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ComponentDetailPage } from './ComponentDetailPage'
import type { User } from '@/lib/auth'
import type { ComponentDetail, FieldOverride } from '@/lib/types'

// PR-272 review follow-up: a retry after an OPTIMISTIC_LOCK 409 must not pair
// the freshly refreshed component version with a stale override baseline — the
// desired-full-set PATCH would then delete a row another user added between the
// two saves. This suite keeps the REAL useFieldOverrides query mounted (only
// the section-level data hooks are mocked) and drives the combined save twice
// around a 409 whose background override refetch fails, exactly the window the
// reviewer called out.

const harn = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, api: { ...actual.api, get: harn.apiGet } }
})
vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../hooks/useComponent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useComponent')>()
  return {
    ...actual,
    // useComponent and useFieldOverrides stay REAL: both subscriptions must
    // react to the 409 handler's cache writes exactly like production.
    useUpdateComponent: vi.fn(),
    useDeleteComponent: vi.fn(),
    useSupportedVersions: () => ({ data: undefined, isLoading: false }),
    useUpdateSupportedVersions: () => ({ mutateAsync: vi.fn(() => Promise.resolve()), isPending: false }),
  }
})
vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast: harn.toast }) }))
vi.mock('../components/AppFooter', () => ({ AppFooter: () => <footer>footer</footer> }))
vi.mock('../hooks/useInfo', () => ({
  usePortalLinks: () => ({ data: undefined }),
  usePortalConfig: () => ({ data: undefined }),
  useCrsInfo: vi.fn(),
  usePortalInfo: () => ({ data: undefined }),
  useOnboardingVideoStatus: () => ({ data: undefined }),
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
import { useUpdateComponent, useDeleteComponent } from '../hooks/useComponent'
import { TooltipProvider } from '../components/ui/tooltip'
import { ApiError } from '../lib/api'

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

// What the 409 handler's refresh sees: someone else saved (and added an
// override row) between our two attempts.
const freshComponent: ComponentDetail = { ...baseComponent, version: 12 }

const seededOverride: FieldOverride = {
  id: 'fo-1', overriddenAttribute: 'build.javaVersion', versionRange: '[1.0,2.0)',
  rowType: 'SCALAR_OVERRIDE', value: '21', markerChildren: null, createdAt: null, updatedAt: null,
}

const concurrentOverride: FieldOverride = {
  id: 'fo-2', overriddenAttribute: 'build.requiredTools', versionRange: '[1.0,2.0)',
  rowType: 'SCALAR_OVERRIDE', value: '["gradle"]', markerChildren: null, createdAt: null, updatedAt: null,
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

let queryClient: QueryClient
let respondOverrides: () => Promise<FieldOverride[]>

function renderPage(mutateAsync: ReturnType<typeof vi.fn>) {
  vi.mocked(useCurrentUser).mockReturnValue({ data: adminUser(), isLoading: false, isError: false, error: null, refetch: vi.fn() } as unknown as ReturnType<typeof useCurrentUser>)
  vi.mocked(useUpdateComponent).mockReturnValue({ ...idleMutation, mutateAsync } as unknown as ReturnType<typeof useUpdateComponent>)
  vi.mocked(useDeleteComponent).mockReturnValue({ ...idleMutation } as unknown as ReturnType<typeof useDeleteComponent>)
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  // Seed the visible component snapshot exactly like a real page load; the
  // overrides entry is seeded by the real query's mount fetch (respondOverrides).
  // staleTime: Infinity keeps the seeded entries from refetching on mount, so
  // the only component GETs are the 409 handler's refreshes.
  queryClient.setQueryData(['component', 'comp-1'], baseComponent)
  const router = createMemoryRouter(
    [
      { path: '/components', element: <div data-testid="list-page" /> },
      { path: '/components/:id', element: <ComponentDetailPage /> },
    ],
    { initialEntries: ['/components/comp-1'] },
  )
  render(
    <QueryClientProvider client={queryClient}>
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
async function saveAndConfirm() {
  click(screen.getByRole('button', { name: /save changes/i }))
  click(await screen.findByRole('button', { name: /^confirm$/i }))
}
/** Wait for the 409 handler's fire-and-forget override refetch to settle, so
 * the retry never races an in-flight background fetch. */
async function waitForBackgroundOverrideRefetch(overrideCallCount: () => number) {
  await waitFor(() => {
    expect(queryClient.getQueryData<ComponentDetail>(['component', 'comp-1'])?.version).toBe(12)
    expect(harn.apiGet).toHaveBeenCalledWith('/components/comp-1/field-overrides')
    expect(queryClient.getQueryState(['field-overrides', 'comp-1'])?.fetchStatus).toBe('idle')
    expect(overrideCallCount()).toBe(2)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  harn.toast.mockReset()
  harn.apiGet.mockReset()
  respondOverrides = () => Promise.resolve([seededOverride])
  harn.apiGet.mockImplementation((url: string) => {
    if (url === '/components/comp-1') return Promise.resolve(freshComponent)
    if (url === '/components/comp-1/field-overrides') return respondOverrides()
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })
})

describe('ComponentDetailPage — 409 retry must not send a stale override baseline (PR-272)', () => {
  it('re-baselines the override draft before a retry (keeps a concurrently added row)', async () => {
    let overrideCalls = 0
    const calls = () => overrideCalls
    respondOverrides = () => {
      overrideCalls += 1
      if (overrideCalls === 1) return Promise.resolve([seededOverride]) // page mount
      if (overrideCalls === 2) return Promise.reject(new Error('network')) // the 409 handler's background refetch
      return Promise.resolve([seededOverride, concurrentOverride]) // the review gate's refetch
    }
    const mutateAsync = vi.fn(() => Promise.resolve(freshComponent))
    mutateAsync.mockRejectedValueOnce(
      new ApiError(409, 'conflict', JSON.stringify({ errorCode: 'OPTIMISTIC_LOCK', errorMessage: 'stale version' })),
    )
    renderPage(mutateAsync)

    // Queue an override delete → the combined PATCH carries the desired FULL set.
    await deleteSeededOverride()
    await saveAndConfirm()

    // The 409 refreshed the component to v12 and fired a background override
    // refetch — which FAILED, so the visible baseline is still the mount-time one.
    await waitForBackgroundOverrideRefetch(calls)

    // Retry. Review must open only after a fresh override baseline has landed,
    // and the retried PATCH must pair v12 with a desired set that still
    // contains the OTHER user's row.
    click(screen.getByRole('button', { name: /save changes/i }))
    click(await screen.findByRole('button', { name: /^confirm$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    const body = (mutateAsync.mock.calls[1] as unknown as [Record<string, unknown>])[0]
    expect(body.version).toBe(12)
    expect(body.fieldOverrides).toEqual([
      expect.objectContaining({ id: 'fo-2', overriddenAttribute: 'build.requiredTools' }),
    ])
  })

  it('blocks the retry while the override baseline cannot be refreshed (no second PATCH)', async () => {
    let overrideCalls = 0
    const calls = () => overrideCalls
    respondOverrides = () => {
      overrideCalls += 1
      if (overrideCalls === 1) return Promise.resolve([seededOverride]) // page mount
      return Promise.reject(new Error('network down')) // background refetch AND the gate's refetch
    }
    const mutateAsync = vi.fn(() => Promise.reject(new Error('must not be called')))
    mutateAsync.mockRejectedValueOnce(
      new ApiError(409, 'conflict', JSON.stringify({ errorCode: 'OPTIMISTIC_LOCK', errorMessage: 'stale version' })),
    )
    renderPage(mutateAsync)

    await deleteSeededOverride()
    await saveAndConfirm()
    await waitForBackgroundOverrideRefetch(calls)

    click(screen.getByRole('button', { name: /save changes/i }))

    // The gate's refetch also fails → Review must NOT open and no PATCH fires.
    await waitFor(() =>
      expect(harn.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Cannot review changes', variant: 'destructive' }),
      ),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mutateAsync).toHaveBeenCalledTimes(1)
  })
})
