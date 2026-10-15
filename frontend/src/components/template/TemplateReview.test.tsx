import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TemplateReview, type TemplateReviewProps } from './TemplateReview'
import type { TemplateRun } from '../../hooks/useTemplateRun'
import type { ReviewProblem } from '../../lib/component/templateReview'

vi.mock('../../hooks/useOwners', () => ({ useOwners: vi.fn(() => ({ data: ['jdoe'] })) }))
vi.mock('../../hooks/useFieldOptions', () => ({ useFieldOptions: vi.fn(() => ({ options: [], isLoading: false })) }))
vi.mock('../../hooks/useLabels', () => ({ useLabels: vi.fn(() => ({ data: ['sql', 'ui'], isLoading: false })) }))

const VCS_PATH = 'baseConfiguration.vcsEntries[0].vcsPath'

const RUN: TemplateRun = {
  valid: false,
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
}

const onParameter = vi.fn()
const onOverride = vi.fn()
const onOverrideCommit = vi.fn()

function renderReview(props: Partial<TemplateReviewProps> = {}) {
  return render(
    <TemplateReview
      template={{ id: 'client-plugin', title: 'Client plugin', version: 3, overridable: [VCS_PATH] }}
      run={RUN}
      problems={[]}
      parameterLabels={{ CLIENT_CODE: 'Client code', PLUGIN_CODE: 'Plugin code' }}
      overrides={{}}
      overrideErrors={{}}
      onParameter={onParameter}
      onOverride={onOverride}
      onOverrideCommit={onOverrideCommit}
      {...props}
    />,
  )
}

const rowOf = (path: string) => screen.getByTestId(`review-field-${path}`)

beforeEach(() => vi.clearAllMocks())

describe('TemplateReview', () => {
  it('shows every rendered field under its group', () => {
    renderReview()
    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument()
    expect(within(rowOf('name')).getByText('abc-plugin-pay')).toBeInTheDocument()
    expect(within(rowOf('baseConfiguration.jira.projectKey')).getByText('ABC')).toBeInTheDocument()
  })

  it('shows a problem on its field with links back to the parameters it came from', () => {
    const problems: ReviewProblem[] = [
      { path: 'name', message: 'component abc-plugin-pay already exists', parameters: ['CLIENT_CODE', 'PLUGIN_CODE'], templateProblem: false },
    ]
    renderReview({ problems })
    const row = rowOf('name')
    expect(within(row).getByText('component abc-plugin-pay already exists')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Plugin code' }))
    expect(onParameter).toHaveBeenCalledWith('PLUGIN_CODE')
  })

  it('shows a template problem naming the template and its version, with no parameter link', () => {
    renderReview({
      problems: [{ path: 'baseConfiguration.jira.versionFormat', message: 'Full Version Format is required', parameters: [], templateProblem: true }],
    })
    const row = rowOf('baseConfiguration.jira.versionFormat')
    expect(within(row).getByText(/Template problem: report Client plugin \(client-plugin, version 3\) to an administrator/)).toBeInTheDocument()
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('shows a problem that names no field at the top', () => {
    renderReview({ problems: [{ path: undefined, message: 'Copyright is required by the catalog', parameters: [], templateProblem: true }] })
    expect(screen.getByRole('alert')).toHaveTextContent('Copyright is required by the catalog')
  })

  it('says more problems may follow once the registry reports one', () => {
    renderReview({ problems: [{ path: 'name', message: 'taken', parameters: [], templateProblem: false }] })
    expect(screen.getByText(/one problem at a time/)).toBeInTheDocument()
  })

  it('lets only overridable fields be edited', () => {
    renderReview()
    expect(within(rowOf(VCS_PATH)).getByRole('textbox')).toHaveValue('ssh://git@git.example.com/abc/plugin.git')
    expect(within(rowOf('name')).queryByRole('textbox')).toBeNull()
  })

  it('reports an edit while typing and commits it only when the field is left', () => {
    renderReview()
    const input = within(rowOf(VCS_PATH)).getByRole('textbox')
    fireEvent.change(input, { target: { value: 'https://elsewhere' } })
    expect(onOverride).toHaveBeenCalledWith(VCS_PATH, ['https://elsewhere'])
    expect(onOverrideCommit).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onOverrideCommit).toHaveBeenCalledWith(VCS_PATH)
  })

  it('marks an edited field as changed from the template, with its check message, and can undo the edit', () => {
    renderReview({
      overrides: { [VCS_PATH]: ['https://elsewhere'] },
      overrideErrors: { [VCS_PATH]: 'VCS Path must be an ssh:// URL, e.g. ssh://git@host/path/repo.git' },
    })
    const row = rowOf(VCS_PATH)
    expect(within(row).getByRole('textbox')).toHaveValue('https://elsewhere')
    expect(within(row).getByText('changed from template')).toBeInTheDocument()
    expect(within(row).getByText('VCS Path must be an ssh:// URL, e.g. ssh://git@host/path/repo.git')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Use the template value' }))
    expect(onOverride).toHaveBeenCalledWith(VCS_PATH, null)
  })

  it('edits nothing in read-only mode', () => {
    renderReview({ readOnly: true })
    expect(within(rowOf(VCS_PATH)).queryByRole('textbox')).toBeNull()
  })

  it('names the parameters each field came from when asked, as Try it does', () => {
    renderReview({ readOnly: true, showSources: true })
    expect(within(rowOf('name')).getByText('from Client code, Plugin code')).toBeInTheDocument()
    expect(within(rowOf('baseConfiguration.jira.projectKey')).getByText('set by the template')).toBeInTheDocument()
  })
})
