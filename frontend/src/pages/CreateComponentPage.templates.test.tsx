import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { CreateComponentPage } from './CreateComponentPage'
import { api, ApiError } from '../lib/api'
import type { ComponentProfile } from '../hooks/useComponentProfiles'
import type { ComponentTemplate } from '../hooks/useComponentTemplate'
import type { TemplateRun } from '../hooks/useTemplateRun'
import shippedProfiles from '../test-fixtures/component-profiles.contract.json'
import { TooltipProvider } from '../components/ui/tooltip'
import type { ComponentDetail } from '../lib/types'

// ── mocks (as in CreateComponentPage.test.tsx; the template endpoints go through the real hooks) ──
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } }
})
const mockApi = vi.mocked(api)
const mockUseComponent = vi.fn()
vi.mock('../hooks/useComponent', () => ({
  useComponent: (id: string) => mockUseComponent(id),
  useCreateComponent: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}))
vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('../hooks/useVersionPreview', () => ({ useVersionPreview: vi.fn(() => ({ data: undefined, isLoading: false })) }))
vi.mock('../hooks/useFieldOptions', () => ({
  useFieldOptions: vi.fn(() => ({ options: ['MAVEN', 'GRADLE', 'PROVIDED'], isLoading: false })),
}))
vi.mock('../hooks/useSupportedGroups', () => ({ useSupportedGroups: () => ({ groups: [], isLoading: false }) }))
vi.mock('../hooks/useInfo', () => ({ usePortalLinks: () => ({ data: { gitBaseUrl: 'ssh://git@git.example.com' } }) }))
vi.mock('../hooks/useEmployees', () => ({
  lookupEmployee: vi.fn(async (query: string) => [{ username: query.trim(), active: true }]),
  useEmployeeStatuses: vi.fn(() => ({ data: {} })),
}))
vi.mock('../hooks/useAdminConfig', () => ({
  useFieldConfig: () => ({ data: undefined, isLoading: false, isError: false }),
  useComponentDefaults: () => ({ data: {}, isSuccess: true, isError: false, isLoading: false }),
}))
vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: undefined, isLoading: false }) }))
vi.mock('../hooks/useOwners', () => ({ useOwners: () => ({ data: ['jdoe'] }) }))
vi.mock('../hooks/useLabels', () => ({ useLabels: () => ({ data: ['sql'], isLoading: false }) }))
vi.mock('../components/editor/UnsavedChangesGuard', () => ({
  UnsavedChangesGuard: ({ when }: { when: boolean }) =>
    React.createElement('div', { 'data-testid': 'unsaved-guard', 'data-when': String(when) }),
}))

const VCS_PATH = 'baseConfiguration.vcsEntries[0].vcsPath'
const TEMPLATE_PATH = '/component-templates/client-plugin'
const RUN_PATH = `${TEMPLATE_PATH}/components`

const TEMPLATE_ENTRY: ComponentProfile = {
  id: 'client-plugin',
  kind: 'template',
  version: 3,
  title: 'Client plugin',
  description: 'A plugin built for one client',
  classification: { external: true, explicit: 'false', solution: false },
  rules: [],
  usable: true,
}

const TEMPLATE: ComponentTemplate = {
  id: 'client-plugin',
  version: 3,
  title: 'Client plugin',
  description: 'A plugin built for one client',
  classification: { external: true, explicit: 'false', solution: false },
  overridable: [VCS_PATH],
  parameters: [
    { name: 'CLIENT_CODE', label: 'Client code', type: 'select', required: true, multiple: false, default: ['ABC'], options: ['ABC', 'XYZ'] },
    {
      name: 'PLUGIN_CODE',
      label: 'Plugin code',
      type: 'text',
      required: true,
      multiple: false,
      default: [],
      pattern: '^[A-Z][A-Z0-9]{2,15}$',
      message: '3–16 uppercase letters or digits, starting with a letter.',
    },
  ],
}

function run(overrides: Partial<TemplateRun> = {}): TemplateRun {
  return {
    valid: true,
    parameterProblems: [],
    problems: [],
    component: {
      name: 'abc-plugin-pay',
      componentOwner: 'jdoe',
      baseConfiguration: {
        build: { buildSystem: 'GRADLE' },
        vcsEntries: [{ vcsPath: 'ssh://git@git.example.com/abc/plugin.git', branch: 'master', tag: 'v$version' }],
        jira: { projectKey: 'ABC', versionFormat: '$versionPrefix-$baseVersionFormat' },
      },
    } as NonNullable<TemplateRun['component']>,
    sources: { name: ['CLIENT_CODE', 'PLUGIN_CODE'], [VCS_PATH]: ['CLIENT_CODE'] },
    overridden: [],
    ...overrides,
  }
}

let listing: ComponentProfile[] = []
const mockUseComponentProfiles = vi.fn(() => ({
  data: listing,
  isLoading: false,
  isError: false,
  isSuccess: true,
  isFetching: false,
  isFetchedAfterMount: true,
  refetch: vi.fn(),
}))
vi.mock('../hooks/useComponentProfiles', () => ({ useComponentProfiles: () => mockUseComponentProfiles() }))

function renderWizard(initialEntry = '/components/new') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/components', element: <div data-testid="list-page" /> },
      { path: '/components/new', element: <CreateComponentPage /> },
      { path: '/components/:id', element: <div data-testid="detail-page" /> },
    ],
    { initialEntries: [initialEntry] },
  )
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const tile = (name: string) => screen.getByRole('radio', { name })
const railSteps = () => within(screen.getByRole('navigation', { name: 'Wizard steps' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))
const nextButton = () => screen.getByRole('button', { name: /^next$/i })
const createButton = () => screen.getByRole('button', { name: /create component/i })
const dryRuns = () => mockApi.post.mock.calls.filter(([path]) => path === `${RUN_PATH}?dryRun=true`)

async function pickTemplate() {
  renderWizard()
  await userEvent.click(tile('Client plugin'))
  await screen.findByText('Plugin code')
}

async function typePluginCode(code: string) {
  const input = within(screen.getByTestId('template-parameter-PLUGIN_CODE')).getByRole('textbox')
  fireEvent.change(input, { target: { value: code } })
}

async function reachReview(result: TemplateRun = run()) {
  mockApi.post.mockResolvedValueOnce(result)
  await pickTemplate()
  await typePluginCode('PAY')
  await userEvent.click(nextButton())
  await screen.findByRole('heading', { name: 'General' })
}

beforeEach(() => {
  vi.clearAllMocks()
  listing = [...(shippedProfiles.profiles as ComponentProfile[]), TEMPLATE_ENTRY]
  mockUseComponent.mockReturnValue({ data: undefined, isLoading: false, error: null })
  mockApi.get.mockImplementation(async (path: string) => {
    if (path === TEMPLATE_PATH) return TEMPLATE
    throw new Error(`unexpected GET ${path}`)
  })
})

describe('Create component — template tiles', () => {
  it('shows a template tile with its version and a Template marker', async () => {
    renderWizard()
    const t = await screen.findByRole('radio', { name: 'Client plugin' })
    expect(within(t).getByText('Template')).toBeInTheDocument()
    expect(within(t).getByText('Version 3')).toBeInTheDocument()
  })

  it('shows a template the user may not use disabled, with the reason', async () => {
    listing = [...listing.slice(0, -1), { ...TEMPLATE_ENTRY, usable: false, unusableReason: 'Not for you' }]
    renderWizard()
    expect(await screen.findByRole('radio', { name: 'Client plugin' })).toBeDisabled()
    expect(screen.getByText('Not for you')).toBeInTheDocument()
  })

  it('offers no template for a clone', async () => {
    mockUseComponent.mockReturnValue({
      data: { id: 'c-1', name: 'svc-alpha', componentOwner: 'jdoe', distributionExternal: true, distributionExplicit: false, configurations: [] } as unknown as ComponentDetail,
      isLoading: false,
      error: null,
    })
    renderWizard('/components/new?from=c-1')
    await screen.findByRole('navigation', { name: 'Wizard steps' })
    await userEvent.click(screen.getByRole('button', { name: 'Profile' }))
    expect(screen.queryByRole('radio', { name: 'Client plugin' })).toBeNull()
  })

  it('shows template tiles beside the classification choices when the registry has no regular profile', async () => {
    listing = [TEMPLATE_ENTRY]
    renderWizard()
    expect(await screen.findByRole('radio', { name: 'Client plugin' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Distribution' })).toBeInTheDocument()
  })
})

describe('Create component — Parameters', () => {
  it('replaces the steps with Parameters and Review & create', async () => {
    await pickTemplate()
    expect(railSteps()).toEqual(['Profile', 'Parameters', 'Review & create'])
  })

  it('returns to the regular steps, with what was typed there, when a regular profile is picked again', async () => {
    renderWizard()
    await userEvent.click(await screen.findByRole('button', { name: /^next$/i }))
    const key = screen.getByPlaceholderText('my-component')
    fireEvent.change(key, { target: { value: 'payments' } })
    await userEvent.click(screen.getByRole('button', { name: 'Profile' }))
    await userEvent.click(tile('Client plugin'))
    await screen.findByText('Plugin code')
    await userEvent.click(screen.getByRole('button', { name: 'Profile' }))
    await userEvent.click(tile('Regular external component'))
    expect(railSteps()).toContain('General')
    await userEvent.click(screen.getByRole('button', { name: 'General' }))
    expect(screen.getByPlaceholderText('my-component')).toHaveValue('payments')
  })

  it('still guards what was typed in the regular steps while a template is picked', async () => {
    renderWizard()
    await userEvent.click(await screen.findByRole('button', { name: /^next$/i }))
    fireEvent.change(screen.getByPlaceholderText('my-component'), { target: { value: 'payments' } })
    await userEvent.click(screen.getByRole('button', { name: 'Profile' }))
    await userEvent.click(tile('Client plugin'))
    await screen.findByText('Plugin code')
    expect(screen.getByTestId('unsaved-guard')).toHaveAttribute('data-when', 'true')
  })

  it('does not guard a template picked from an untouched wizard', async () => {
    await pickTemplate()
    expect(screen.getByTestId('unsaved-guard')).toHaveAttribute('data-when', 'false')
  })

  it('shows an error with Retry when the template cannot be loaded', async () => {
    mockApi.get.mockRejectedValue(new ApiError(500, 'boom'))
    renderWizard()
    await userEvent.click(tile('Client plugin'))
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(nextButton()).toBeDisabled()
  })

  it('keeps Next disabled while a parameter check fails, and sends nothing while typing', async () => {
    await pickTemplate()
    expect(nextButton()).toBeDisabled()
    await typePluginCode('pay')
    expect(screen.getByText('3–16 uppercase letters or digits, starting with a letter.')).toBeInTheDocument()
    expect(nextButton()).toBeDisabled()
    await typePluginCode('PAY')
    expect(nextButton()).toBeEnabled()
    expect(mockApi.post).not.toHaveBeenCalled()
  })

  it('sends one dry run on Next, with the values and no Jira task key or comment', async () => {
    await reachReview()
    expect(dryRuns()).toHaveLength(1)
    expect(dryRuns()[0]![1]).toEqual({ parameters: { CLIENT_CODE: ['ABC'], PLUGIN_CODE: ['PAY'] }, overrides: {} })
  })

  it('stays on Parameters with the message on the parameter when the dry run reports a parameter problem', async () => {
    mockApi.post.mockResolvedValueOnce(
      run({ valid: false, component: undefined, parameterProblems: [{ parameter: 'PLUGIN_CODE', check: 'P5', message: 'Not allowed' }] }),
    )
    await pickTemplate()
    await typePluginCode('PAY')
    await userEvent.click(nextButton())
    expect(await within(screen.getByTestId('template-parameter-PLUGIN_CODE')).findByText('Not allowed')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'General' })).toBeNull()
  })

  it('cannot open Review from the rail after a parameter changed, until Next runs again', async () => {
    await reachReview()
    await userEvent.click(screen.getByRole('button', { name: 'Parameters' }))
    await typePluginCode('PAY2')
    await userEvent.click(screen.getByRole('button', { name: 'Review & create' }))
    expect(screen.queryByRole('heading', { name: 'General' })).toBeNull()
    expect(screen.getByTestId('template-parameter-PLUGIN_CODE')).toBeInTheDocument()
  })
})

describe('Create component — Review & create from a template', () => {
  it('keeps Create disabled while a problem stands', async () => {
    await reachReview(run({ valid: false, problems: [{ fields: ['name'], parameters: ['PLUGIN_CODE'], templateProblem: false, message: 'name: taken' }] }))
    fireEvent.change(screen.getByLabelText(/Jira task key/i), { target: { value: 'CD-1234' } })
    expect(createButton()).toBeDisabled()
  })

  it('keeps Create disabled while the Jira task key is empty', async () => {
    await reachReview()
    expect(createButton()).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Jira task key/i), { target: { value: 'CD-1234' } })
    expect(createButton()).toBeEnabled()
  })

  it('shows a Portal rule problem on the rendered component, naming its parameter', async () => {
    const offHost = run()
    offHost.component!.baseConfiguration!.vcsEntries![0]!.vcsPath = 'ssh://git@elsewhere.org/abc.git'
    await reachReview(offHost)
    expect(screen.getByText('VCS host must be git.example.com (the ecosystem Bitbucket)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Client code' })).toBeInTheDocument()
  })

  it('runs the dry run again with the override when an edited field is left', async () => {
    await reachReview()
    mockApi.post.mockResolvedValueOnce(run({ overridden: [VCS_PATH] }))
    const input = within(screen.getByTestId(`review-field-${VCS_PATH}`)).getByRole('textbox')
    fireEvent.change(input, { target: { value: 'ssh://git@git.example.com/abc/other.git' } })
    expect(dryRuns()).toHaveLength(1)
    fireEvent.blur(input)
    await waitFor(() => expect(dryRuns()).toHaveLength(2))
    expect(dryRuns()[1]![1]).toMatchObject({ overrides: { [VCS_PATH]: ['ssh://git@git.example.com/abc/other.git'] } })
  })

  it('creates the component and shows the success panel', async () => {
    await reachReview()
    mockApi.post.mockResolvedValueOnce({ id: 'new-id', name: 'abc-plugin-pay' })
    fireEvent.change(screen.getByLabelText(/Jira task key/i), { target: { value: 'CD-1234' } })
    fireEvent.change(screen.getByLabelText(/Comment/i), { target: { value: 'first plugin' } })
    await userEvent.click(createButton())
    expect(await screen.findByText('Component created')).toBeInTheDocument()
    expect(mockApi.post).toHaveBeenLastCalledWith(`${RUN_PATH}?dryRun=false`, {
      parameters: { CLIENT_CODE: ['ABC'], PLUGIN_CODE: ['PAY'] },
      overrides: {},
      jiraTaskKey: 'CD-1234',
      changeComment: 'first plugin',
    })
  })

  it('stays on Review with the problems when the registry rejects the create', async () => {
    await reachReview()
    const rejected = run({ valid: false, problems: [{ fields: ['name'], parameters: ['PLUGIN_CODE'], templateProblem: false, message: 'name: taken meanwhile' }] })
    mockApi.post.mockRejectedValueOnce(new ApiError(422, 'rejected', JSON.stringify(rejected)))
    fireEvent.change(screen.getByLabelText(/Jira task key/i), { target: { value: 'CD-1234' } })
    await userEvent.click(createButton())
    expect(await screen.findByText('taken meanwhile')).toBeInTheDocument()
    expect(screen.queryByText('Component created')).toBeNull()
  })

  it('returns to the Profile step without the template when the registry says it is gone', async () => {
    await reachReview()
    mockApi.post.mockRejectedValueOnce(new ApiError(404, "Component template 'client-plugin' not found"))
    fireEvent.change(screen.getByLabelText(/Jira task key/i), { target: { value: 'CD-1234' } })
    await userEvent.click(createButton())
    expect(await screen.findByText(/Component template 'client-plugin' not found/)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Client plugin' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Regular external component' })).toBeInTheDocument()
  })

  it('shows a refusal at the top of Review', async () => {
    await reachReview()
    mockApi.post.mockRejectedValueOnce(new ApiError(403, 'You do not have permission to create components'))
    fireEvent.change(screen.getByLabelText(/Jira task key/i), { target: { value: 'CD-1234' } })
    await userEvent.click(createButton())
    expect(await screen.findByText('You do not have permission to create components')).toBeInTheDocument()
  })
})
