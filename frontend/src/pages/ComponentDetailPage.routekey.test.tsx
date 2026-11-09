import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ComponentDetailPage } from './ComponentDetailPage'
import { ApiError } from '../lib/api'
import type { ComponentDetail } from '@/lib/types'

// The route segment may be a component key while sub-endpoints are UUID-only.
// Real data hooks, api layer mocked — asserts the exact request paths.
const KEY = 'demo-component-key'
const UUID = 'uuid-123'

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
const toastSpy = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, api: apiMock }
})

vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }))
vi.mock('../components/AppFooter', () => ({ AppFooter: () => <footer>footer</footer> }))
vi.mock('../hooks/useInfo', () => ({
  usePortalLinks: () => ({ data: undefined }),
  usePortalConfig: () => ({ data: undefined }),
  useCrsInfo: vi.fn(),
  usePortalInfo: () => ({ data: undefined }),
  useOnboardingVideoStatus: () => ({ data: undefined }),
}))
// The always-rendered header labels editor calls useLabelsDictionary; mock it so the test never depends on the broad apiMock.get shape.
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
      }, [component, form])
      return <button data-testid="edit-display-name">edit general</button>
    }),
  }
})
vi.mock('../components/editor/MiscTab', async () => {
  const actual = await vi.importActual<typeof import('../components/editor/MiscTab')>('../components/editor/MiscTab')
  return { ...actual, MiscTab: () => <div data-testid="misc-tab" /> }
})
vi.mock('../components/editor/FieldOverrideInline', () => ({ FieldOverrideInline: () => null }))
vi.mock('../components/editor/FieldOverrides', () => ({ FieldOverrides: () => <div /> }))
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
import { TooltipProvider } from '../components/ui/tooltip'

const baseComponent: ComponentDetail = {
  id: UUID, name: KEY, displayName: 'Demo Component', componentOwner: 'alice',
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useCurrentUser).mockReturnValue({
    data: {
      username: 'u',
      roles: [{ name: 'R', permissions: ['ACCESS_COMPONENTS', 'CREATE_COMPONENTS', 'DELETE_COMPONENTS'] }],
      groups: [],
    },
    isLoading: false, isError: false, error: null, refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCurrentUser>)
  apiMock.get.mockImplementation((path: string) => {
    // The detail resolves by key AND by UUID (a post-409 refetch path).
    if (path === `/components/${KEY}` || path === `/components/${UUID}`) return Promise.resolve(baseComponent)
    if (path === `/components/${UUID}/archive-readiness`) return Promise.resolve({ ready: true, entries: [] })
    if (path === `/components/${UUID}/supported-versions`) return Promise.resolve({ all: true, ranges: [], warnings: [] })
    if (path.endsWith('/field-overrides')) return Promise.resolve([])
    return Promise.resolve([])
  })
  apiMock.patch.mockResolvedValue(undefined)
  apiMock.delete.mockResolvedValue(undefined)
})

const getPathCalls = (path: string) => apiMock.get.mock.calls.filter(([p]) => p === path)

function renderDetailPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/components', element: <div data-testid="list-page" /> },
      { path: '/components/:id', element: <ComponentDetailPage /> },
    ],
    { initialEntries: [`/components/${KEY}`] },
  )
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return client
}

/** No UUID-only sub-endpoint may ever be requested with the component KEY, for any method. */
function expectNoKeySubResourceRequest() {
  const methods = ['get', 'post', 'put', 'patch', 'delete'] as const
  const offenders = methods.flatMap((method) =>
    apiMock[method].mock.calls
      .map(([path]) => path)
      .filter((path): path is string => typeof path === 'string' && path.startsWith(`/components/${KEY}/`)),
  )
  expect(offenders).toEqual([])
}

async function openTab(name: RegExp) {
  await userEvent.setup().click(screen.getByRole('tab', { name }))
}

describe('ComponentDetailPage — opened by component key (idOrName route)', () => {
  it('resolves the detail by key, then fetches field-overrides by the resolved UUID', async () => {
    renderDetailPage()
    await screen.findByRole('tab', { name: /^Build/ })
    expect(apiMock.get).toHaveBeenCalledWith(`/components/${KEY}`)
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith(`/components/${UUID}/field-overrides`)
    })
    expectNoKeySubResourceRequest()
  })

  it('PATCHes by UUID on save and re-seeds the route-key cache entry (bar returns clean)', async () => {
    const saved: ComponentDetail = {
      ...baseComponent, version: 10,
      configurations: [
        {
          id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null, isSyntheticBase: false,
          build: { buildSystem: 'GRADLE', javaVersion: '21' }, escrow: null, jira: { projectKey: 'PROJ' },
          vcsEntries: [], mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
        },
      ],
    }
    apiMock.patch.mockResolvedValue(saved)

    renderDetailPage()
    await screen.findByRole('tab', { name: /^Build/ })
    await openTab(/^Build/)

    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '21' } })
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^confirm$/i }))

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledOnce())
    expect(apiMock.patch.mock.calls[0]![0]).toBe(`/components/${UUID}`)
    expectNoKeySubResourceRequest()

    // The page is subscribed to ['component', KEY] — the alias seed is what returns the bar clean.
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeDefined())
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('refetches by UUID (not the route key) on an optimistic-lock 409 and mirrors into the route-key entry', async () => {
    apiMock.patch.mockRejectedValue(
      new ApiError(409, 'conflict', JSON.stringify({ errorCode: 'OPTIMISTIC_LOCK', errorMessage: 'stale' })),
    )

    renderDetailPage()
    await screen.findByRole('tab', { name: /^Build/ })
    const uuidFetchesBeforeSave = getPathCalls(`/components/${UUID}`).length
    const keyFetchesBeforeSave = getPathCalls(`/components/${KEY}`).length
    await openTab(/^Build/)

    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '21' } })
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^confirm$/i }))

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Save conflict' })),
    )
    await waitFor(() => {
      expect(getPathCalls(`/components/${UUID}`).length).toBeGreaterThan(uuidFetchesBeforeSave)
    })
    expect(getPathCalls(`/components/${KEY}`).length).toBe(keyFetchesBeforeSave)
    expectNoKeySubResourceRequest()
    // Still on the editor, not the error page.
    expect(screen.getByRole('tab', { name: /^Build/ })).toBeDefined()
  })

  it('DELETEs (Archive) by UUID, including the archive-readiness precheck', async () => {
    renderDetailPage()
    await screen.findByRole('tab', { name: /^Build/ })

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith(`/components/${UUID}/archive-readiness`))

    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Archive' })
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(confirm)

    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledOnce())
    expect(apiMock.delete.mock.calls[0]![0]).toBe(`/components/${UUID}`)
    expectNoKeySubResourceRequest()
    await screen.findByTestId('list-page')
  })

  it('keeps the editor and unsaved work mounted when a background refetch fails', async () => {
    // PR review: a transient refetch failure must not unmount the editor —
    // the error page is only for a component that never resolved.
    const client = renderDetailPage()
    await screen.findByRole('tab', { name: /^Build/ })
    await openTab(/^Build/)

    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '21' } })
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())

    const keyFetches = getPathCalls(`/components/${KEY}`).length
    apiMock.get.mockImplementation((path: string) =>
      path === `/components/${KEY}` || path === `/components/${UUID}`
        ? Promise.reject(new ApiError(500, 'boom', '{}'))
        : Promise.resolve([]),
    )
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['component', KEY] })
    })
    // The query state is already error, but the React commit rides TanStack's
    // notifyManager macrotask — flush it so the assertions see the final DOM.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // The refetch fired and failed, but the editor survived with its draft.
    expect(getPathCalls(`/components/${KEY}`).length).toBe(keyFetches + 1)
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Build/ })).toBeInTheDocument()
    expect(screen.queryByText('boom')).toBeNull()
  })
})
