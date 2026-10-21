import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TemplatesPanel } from './TemplatesPanel'
import { api } from '../../lib/api'
import { copyToClipboard } from '../../lib/clipboard'
import type { AdminComponentProfiles } from '../../hooks/useAdminComponentProfiles'
import type { TemplateRun } from '../../hooks/useTemplateRun'

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } }
})
vi.mock('../../lib/clipboard', () => ({ copyToClipboard: vi.fn(async () => undefined) }))
vi.mock('../../hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('../../hooks/useOwners', () => ({ useOwners: () => ({ data: ['jdoe'] }) }))
vi.mock('../../hooks/useFieldOptions', () => ({ useFieldOptions: () => ({ options: [], isLoading: false }) }))
vi.mock('../../hooks/useLabels', () => ({ useLabels: () => ({ data: [], isLoading: false }) }))
vi.mock('../../hooks/useSupportedGroups', () => ({ useSupportedGroups: () => ({ groups: [], isLoading: false }) }))
vi.mock('../../hooks/useInfo', () => ({ usePortalLinks: () => ({ data: { gitBaseUrl: 'ssh://git@git.example.com' } }) }))
const mockApi = vi.mocked(api)

const CLIENT_PLUGIN_YAML = 'client-plugin:\n  kind: template\n  fields:\n    name: "{{ CLIENT_CODE | lower }}-plugin"\n'

const ADMIN: AdminComponentProfiles = {
  configVersion: 'a1b2c3d',
  lastLoad: { status: 'applied', problems: [], entries: [] },
  entries: [
    {
      id: 'regular-external',
      kind: 'regular',
      status: 'live',
      problems: [],
      configuration: 'regular-external:\n  kind: regular\n',
      profile: {
        id: 'regular-external',
        kind: 'regular',
        title: 'Regular external component',
        description: 'Delivered to the client',
        classification: { external: true, explicit: 'ask', solution: false },
        rules: [],
        usable: true,
      },
    },
    {
      id: 'client-plugin',
      kind: 'template',
      status: 'live',
      problems: [],
      configuration: CLIENT_PLUGIN_YAML,
      template: {
        id: 'client-plugin',
        version: 3,
        title: 'Client plugin',
        description: 'A plugin built for one client',
        classification: { external: true, explicit: 'false', solution: false },
        overridable: ['baseConfiguration.vcsEntries[0].vcsPath'],
        parameters: [
          { name: 'CLIENT_CODE', label: 'Client code', type: 'select', required: true, multiple: false, default: ['ABC'], options: ['ABC', 'XYZ'] },
          { name: 'PLUGIN_CODE', label: 'Plugin code', type: 'text', required: true, multiple: false, default: [], pattern: '^[A-Z]+$', maxLength: 16 },
        ],
      },
    },
    {
      id: 'broken-plugin',
      kind: undefined,
      status: 'failed',
      problems: ['parameters.CODE: unknown type "txt"', 'fields.name: uses PLUGIN, which is not defined'],
      configuration: 'broken-plugin:\n  kind: templat\n',
    },
  ],
}

const RUN: TemplateRun = {
  valid: true,
  parameterProblems: [],
  problems: [],
  component: { name: 'abc-plugin', baseConfiguration: { build: { buildSystem: 'GRADLE' }, jira: { projectKey: 'ABC' } } } as NonNullable<TemplateRun['component']>,
  sources: { name: ['CLIENT_CODE'] },
  overridden: [],
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TemplatesPanel />
    </QueryClientProvider>,
  )
}

const rowOf = (id: string) => screen.getByTestId(`profile-entry-${id}`)

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.get.mockResolvedValue(ADMIN)
})

describe('TemplatesPanel', () => {
  it('reads every configured entry from the registry', async () => {
    renderPanel()
    await screen.findByTestId('profile-entry-client-plugin')
    expect(mockApi.get).toHaveBeenCalledWith('/admin/component-profiles')
  })

  it('lists each entry with its kind and status, and a live one with its title and version', async () => {
    renderPanel()
    const plugin = await screen.findByTestId('profile-entry-client-plugin')
    expect(within(plugin).getByText('Client plugin')).toBeInTheDocument()
    expect(within(plugin).getByText('template')).toBeInTheDocument()
    expect(within(plugin).getByText('Version 3')).toBeInTheDocument()
    expect(within(plugin).getByText('live')).toBeInTheDocument()
    expect(within(rowOf('regular-external')).getByText('regular')).toBeInTheDocument()
  })

  it('shows a failed entry with every problem and the configuration it read', async () => {
    renderPanel()
    const broken = await screen.findByTestId('profile-entry-broken-plugin')
    expect(within(broken).getByText('failed')).toBeInTheDocument()
    expect(within(broken).getByText('unknown')).toBeInTheDocument()
    expect(within(broken).getByText('parameters.CODE: unknown type "txt"')).toBeInTheDocument()
    expect(within(broken).getByText('fields.name: uses PLUGIN, which is not defined')).toBeInTheDocument()
    expect(within(broken).getByText(/kind: templat/)).toBeInTheDocument()
  })

  it('shows the last load, the configuration version, and how templates change', async () => {
    renderPanel()
    await screen.findByTestId('profile-entry-client-plugin')
    expect(screen.getByText(/Last load: applied/)).toBeInTheDocument()
    expect(screen.getByText('a1b2c3d')).toBeInTheDocument()
    expect(screen.getByText(/reviewed change to service-config/)).toBeInTheDocument()
  })

  it('says when the last reload was not applied, with the reasons', async () => {
    mockApi.get.mockResolvedValue({ ...ADMIN, lastLoad: { status: 'failed', problems: ['no regular profile'], entries: [] } })
    renderPanel()
    expect(await screen.findByText(/Last load: failed/)).toBeInTheDocument()
    expect(screen.getByText('no regular profile')).toBeInTheDocument()
    expect(screen.getByText(/still in use/)).toBeInTheDocument()
  })

  it('shows a live template’s parameters, classification, overridable fields and configuration', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Details of Client plugin' }))
    const details = screen.getByTestId('template-details-client-plugin')
    expect(within(details).getAllByRole('row').map((r) => r.textContent)).toEqual([
      expect.stringContaining('Parameter'),
      expect.stringMatching(/Client code.*CLIENT_CODE.*select.*required.*ABC.*options: ABC, XYZ/),
      expect.stringMatching(/Plugin code.*PLUGIN_CODE.*text.*required.*pattern: \^\[A-Z\]\+\$.*max length: 16/),
    ])
    expect(within(details).getByText('External · not explicit')).toBeInTheDocument()
    expect(within(details).getByText('baseConfiguration.vcsEntries[0].vcsPath')).toBeInTheDocument()
    expect(within(details).getByText(/CLIENT_CODE \| lower/)).toBeInTheDocument()
  })

  it('copies the configuration text as shown', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Details of Client plugin' }))
    await userEvent.click(screen.getByRole('button', { name: 'Copy configuration' }))
    expect(copyToClipboard).toHaveBeenCalledWith(CLIENT_PLUGIN_YAML)
  })

  it('tries a template with sample values: one dry run, each field’s sources, no create and nothing editable', async () => {
    mockApi.post.mockResolvedValue(RUN)
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Details of Client plugin' }))
    const details = screen.getByTestId('template-details-client-plugin')
    const code = within(within(details).getByTestId('template-parameter-PLUGIN_CODE')).getByRole('textbox')
    fireEvent.change(code, { target: { value: 'pay' } })
    expect(within(details).getByRole('button', { name: 'Run' })).toBeDisabled()
    fireEvent.change(code, { target: { value: 'PAY' } })
    await userEvent.click(within(details).getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(1))
    expect(mockApi.post).toHaveBeenCalledWith('/component-templates/client-plugin/components?dryRun=true', {
      parameters: { CLIENT_CODE: ['ABC'], PLUGIN_CODE: ['PAY'] },
      overrides: {},
    })
    expect(await within(details).findByText('from Client code')).toBeInTheDocument()
    expect(within(details).queryByRole('button', { name: /create/i })).toBeNull()
    expect(within(details).queryByTestId('review-field-baseConfiguration.vcsEntries[0].vcsPath')?.querySelector('input') ?? null).toBeNull()
  })

  it('shows the Portal rule problems on a Try it result too', async () => {
    mockApi.post.mockResolvedValue({ ...RUN, component: { ...RUN.component!, baseConfiguration: { build: { buildSystem: 'GRADLE' } } } })
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Details of Client plugin' }))
    const details = screen.getByTestId('template-details-client-plugin')
    fireEvent.change(within(within(details).getByTestId('template-parameter-PLUGIN_CODE')).getByRole('textbox'), { target: { value: 'PAY' } })
    await userEvent.click(within(details).getByRole('button', { name: 'Run' }))
    expect(await within(details).findByText('Jira Project Key is required')).toBeInTheDocument()
  })
})
