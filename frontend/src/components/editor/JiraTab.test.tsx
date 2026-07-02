import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JiraTab } from './JiraTab'
import { useJiraSection } from './useJiraSection'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: ({ overriddenAttribute }: { overriddenAttribute: string }) => (
    <div data-testid={`field-override-inline-${overriddenAttribute}`} />
  ),
}))

vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: () => ({ entry: { visibility: 'editable', required: false } }),
  useFieldLabel: (_path: string, fallback: string) => fallback,
}))

function makeBaseRow(overrides: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null,
    isSyntheticBase: false, build: null, escrow: null, jira: null, vcsEntries: [],
    mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
    ...overrides,
  }
}

function makeComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1', name: 'my-component', displayName: 'My Component', componentOwner: 'alice',
    productType: null, system: null, clientCode: null, solution: false, parentComponentName: null,
    archived: false, version: 5, createdAt: null, updatedAt: null, labels: [], docs: [], artifactIds: [],
    securityGroups: [], teamcityProjects: [], configurations: [makeBaseRow()],
    ...overrides,
  }
}

const captured: { section?: ReturnType<typeof useJiraSection> } = {}
function Harness({ component, canEdit = true }: { component: ComponentDetail; canEdit?: boolean }) {
  const section = useJiraSection(component, { releasesInDefaultBranch: 'editable' })
  captured.section = section
  return (
    <TooltipProvider>
      <JiraTab component={component} section={section} canEdit={canEdit} />
    </TooltipProvider>
  )
}
function renderTab(component: ComponentDetail, canEdit = true) {
  captured.section = undefined
  return render(<Harness component={component} canEdit={canEdit} />)
}

describe('JiraTab — inline override coverage', () => {
  const overridablePaths = [
    'jira.projectKey', 'jira.technical', 'jira.minorVersionFormat', 'jira.releaseVersionFormat',
    'jira.buildVersionFormat', 'jira.lineVersionFormat', 'jira.versionPrefix', 'jira.versionFormat',
    'jira.hotfixVersionFormat',
  ]

  it.each(overridablePaths)('renders FieldOverrideInline under %s', (path) => {
    renderTab(makeComponent())
    expect(screen.getByTestId(`field-override-inline-${path}`)).toBeInTheDocument()
  })
})

describe('JiraTab — Jira display name shown only when divergent', () => {
  const NOTE = /shown because it differs/i

  it('hides the Jira Display Name field when it is unset', () => {
    renderTab(makeComponent())
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('hides the Jira Display Name field when it equals the component display name', () => {
    renderTab(makeComponent({ jiraDisplayName: 'My Component' }))
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('shows the Jira Display Name field (pre-filled) when it diverges', () => {
    renderTab(makeComponent({ jiraDisplayName: 'Divergent Jira Name' }))
    expect(screen.getByText(NOTE)).toBeDefined()
    expect(screen.getByDisplayValue('Divergent Jira Name')).toBeDefined()
  })

  it('does NOT send jiraDisplayName in the slice when only the project key changed', async () => {
    renderTab(makeComponent({ jiraDisplayName: 'Divergent Jira Name' }))
    await userEvent.type(screen.getByPlaceholderText('JIRA project key'), 'X')
    expect('jiraDisplayName' in captured.section!.slice.request).toBe(false)
  })
})

describe('JiraTab — slice', () => {
  it('project key edits land in baseConfiguration.jira', async () => {
    renderTab(makeComponent({ configurations: [makeBaseRow({ jira: { projectKey: 'OLD' } })] }))
    const input = screen.getByPlaceholderText('JIRA project key')
    await userEvent.clear(input)
    await userEvent.type(input, 'NEW')
    expect(captured.section!.slice.request.baseConfiguration?.jira?.projectKey).toBe('NEW')
  })
})

describe('JiraTab field descriptions (FieldInfo)', () => {
  const EXPECTED_PATHS = [
    'jira.projectKey', 'jira.displayName', 'jira.technical', 'component.releasesInDefaultBranch',
    'jira.hotfixVersionFormat', 'jira.versionPrefix', 'jira.minorVersionFormat', 'jira.releaseVersionFormat',
    'jira.buildVersionFormat', 'jira.lineVersionFormat', 'jira.versionFormat',
  ]

  it('renders exactly one info icon per described field', () => {
    renderTab(makeComponent({ jiraDisplayName: 'Divergent Jira Name' }))
    for (const path of EXPECTED_PATHS) {
      expect(document.querySelectorAll(`[data-field-path="${path}"]`), `info icon for ${path}`).toHaveLength(1)
    }
  })

  it('opens the registry description for Project Key on focus', async () => {
    renderTab(makeComponent())
    const trigger = document.querySelector('[data-field-path="jira.projectKey"]') as HTMLElement
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(fieldDescriptions['jira.projectKey']!)
  })
})
