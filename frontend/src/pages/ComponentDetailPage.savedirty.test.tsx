import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ComponentDetailPage } from './ComponentDetailPage'
import type { ComponentDetail } from '@/lib/types'

// Acceptance #3 at the PAGE/save-bar level. Unlike combinedSave.test.tsx (which
// mocks the data hooks to static values — and the data router memoises the route
// element, so a re-render can't re-seed), this suite keeps the REAL
// useComponent / useUpdateComponent and mocks only the api layer. That exercises
// the production cache path: api.patch resolves → useUpdateComponent.onSuccess
// setQueryData(['component', id], saved) → useQuery re-renders the page → the
// Build section re-seeds against the saved snapshot → the bar returns to
// "All changes saved" with no phantom dirty.
const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, api: apiMock }
})

vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('../components/AppFooter', () => ({ AppFooter: () => <footer>footer</footer> }))
vi.mock('../hooks/useInfo', () => ({
  usePortalLinks: () => ({ data: undefined }),
  useCrsInfo: vi.fn(),
  usePortalInfo: () => ({ data: undefined }),
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
vi.mock('../components/CreateComponentDialog', () => ({ CreateComponentDialog: () => null }))
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
  id: 'comp-1', name: 'my-component', displayName: 'My Component', componentOwner: 'alice',
  productType: null, system: 'SYS1', clientCode: null, archived: false, solution: false,
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
    data: { username: 'u', roles: [{ name: 'R', permissions: ['ACCESS_COMPONENTS', 'CREATE_COMPONENTS'] }], groups: [] },
    isLoading: false, isError: false, error: null, refetch: vi.fn(),
  } as unknown as ReturnType<typeof useCurrentUser>)
})

async function openTab(name: RegExp) {
  await userEvent.setup().click(screen.getByRole('tab', { name }))
}

describe('ComponentDetailPage — save clears dirty (Acceptance #3, real cache path)', () => {
  it('returns the bar to "All changes saved" after a successful PATCH re-seeds the snapshot', async () => {
    // GET seeds the editor; PATCH echoes back the saved component (java 21, v10).
    apiMock.get.mockResolvedValue(baseComponent)
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

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter(
      [
        { path: '/components', element: <div data-testid="list-page" /> },
        { path: '/components/:id', element: <ComponentDetailPage /> },
      ],
      { initialEntries: ['/components/comp-1'] },
    )
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>,
    )

    // Wait for the real useQuery to resolve and the editor to render.
    await screen.findByRole('tab', { name: /^Build/ })
    await openTab(/^Build/)

    // Edit Build → dirty bar.
    fireEvent.change(screen.getByTestId('enum-build-javaVersion'), { target: { value: '21' } })
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeDefined())

    // Save → review → confirm. The real onSuccess does setQueryData, which
    // re-renders the page with the saved component (no router navigation).
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^confirm$/i }))

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledOnce())
    // The PATCH body carries the single combined request with the bumped version.
    const body = apiMock.patch.mock.calls[0]![1] as { version: number; baseConfiguration?: { build?: { javaVersion?: string } } }
    expect(body.version).toBe(9)
    expect(body.baseConfiguration?.build?.javaVersion).toBe('21')

    // Bar returns to clean (anyDirty=false) with the saved value still shown.
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeDefined())
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect((screen.getByTestId('enum-build-javaVersion') as HTMLInputElement).value).toBe('21')
  })
})
