import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JiraTab } from './JiraTab'
import { useJiraSection } from './useJiraSection'
import { OverridesDraftProvider } from './overridesDraft'
import { TooltipProvider } from '../ui/tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import type { ComponentDetail, ComponentConfiguration, FieldOverride } from '../../lib/types'

// FieldOverrideInline → a testid stub so "+ Add override" affordance presence is
// assertable without dragging in the version-range editor internals.
vi.mock('./FieldOverrideInline', () => ({
  FieldOverrideInline: ({ overriddenAttribute }: { overriddenAttribute: string }) => (
    <div data-testid={`field-override-inline-${overriddenAttribute}`} />
  ),
}))

// Field-config axes are driven by mutable maps so each test sets per-path
// visibility / editable-axis and per-user editability.
let fcEntries: Record<string, { visibility?: string; editable?: string }> = {}
let editableMap: Record<string, boolean> = {}

vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: (path: string) => ({
    entry: fcEntries[path] ?? { visibility: 'editable', required: false },
    isLoading: false,
    isError: false,
  }),
  useFieldLabel: (_path: string, fallback: string) => fallback,
  useFieldEditable: (path: string) => editableMap[path] ?? true,
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
    securityGroups: [], teamcityProjects: [], skipCommitCheck: false, configurations: [makeBaseRow()],
    ...overrides,
  }
}

/** Component whose BASE row declares a hotfix branch → hotfixes enabled. */
function withHotfix(overrides: Partial<ComponentConfiguration> = {}): ComponentDetail {
  return makeComponent({
    configurations: [
      makeBaseRow({
        vcsEntries: [{ id: 'v1', vcsPath: 'p/r', branch: 'master', tag: null, hotfixBranch: 'hotfix/$major.$minor', name: null, repositoryType: null, sortOrder: 0 }],
        ...overrides,
      }),
    ],
  })
}

const captured: { section?: ReturnType<typeof useJiraSection> } = {}
function Harness({
  component,
  canEdit = true,
  conflictError = null,
  serverOverrides = [],
}: {
  component: ComponentDetail
  canEdit?: boolean
  conflictError?: string | null
  serverOverrides?: FieldOverride[]
}) {
  const section = useJiraSection(component, { releasesInDefaultBranch: 'editable' })
  captured.section = section
  return (
    <TooltipProvider>
      <OverridesDraftProvider componentId={component.id} serverOverrides={serverOverrides}>
        <JiraTab component={component} section={section} canEdit={canEdit} conflictError={conflictError} />
      </OverridesDraftProvider>
    </TooltipProvider>
  )
}
function renderTab(props: Parameters<typeof Harness>[0]) {
  captured.section = undefined
  return render(<Harness {...props} />)
}

beforeEach(() => {
  fcEntries = {}
  editableMap = {}
})

describe('JiraTab — inline override coverage', () => {
  // All nine overridable jira paths keep their "+ Add override" affordance
  // (hotfix visible only when hotfixes are enabled).
  const overridablePaths = [
    'jira.projectKey', 'jira.technical', 'jira.minorVersionFormat', 'jira.releaseVersionFormat',
    'jira.buildVersionFormat', 'jira.lineVersionFormat', 'jira.versionPrefix', 'jira.versionFormat',
    'jira.hotfixVersionFormat',
  ]

  it.each(overridablePaths)('renders FieldOverrideInline under %s', (path) => {
    renderTab({ component: withHotfix() })
    expect(screen.getByTestId(`field-override-inline-${path}`)).toBeInTheDocument()
  })
})

describe('JiraTab — three-group layout', () => {
  it('renders the Jira project / Version formats / Flags group headers', () => {
    renderTab({ component: makeComponent() })
    expect(screen.getByRole('heading', { name: 'Jira project' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Version formats' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Flags' })).toBeDefined()
  })

  it('leaves an empty preview slot for the P-2b ladder', () => {
    renderTab({ component: makeComponent() })
    expect(screen.getByTestId('version-preview-slot')).toBeEmptyDOMElement()
  })
})

describe('JiraTab — Line/Minor mirror pattern', () => {
  it('Minor mirrors Line by default (read-only box + "Set separate" button)', () => {
    renderTab({ component: makeComponent({ configurations: [makeBaseRow({ jira: { lineVersionFormat: 'L' } })] }) })
    // Mirror box shows the leading Line value; no editable minor input.
    expect(screen.getByLabelText('Minor Version Format (mirrored)')).toHaveValue('L')
    expect(screen.getByText('from Line')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Set separate minor format' })).toBeDefined()
  })

  it('"Set separate minor format" reveals an editable minor input', async () => {
    renderTab({ component: makeComponent({ configurations: [makeBaseRow({ jira: { lineVersionFormat: 'L' } })] }) })
    await userEvent.click(screen.getByRole('button', { name: 'Set separate minor format' }))
    expect(screen.getByLabelText('Minor Version Format')).toHaveValue('L') // seeded from Line
    expect(screen.getByRole('button', { name: 'Remove separate format' })).toBeDefined()
    expect(captured.section!.state.minorSeparate).toBe(true)
  })

  it('loads a stored separate Minor as an editable input', () => {
    renderTab({ component: makeComponent({ configurations: [makeBaseRow({ jira: { lineVersionFormat: 'L', minorVersionFormat: 'M' } })] }) })
    expect(screen.getByLabelText('Minor Version Format')).toHaveValue('M')
    expect(screen.getByRole('button', { name: 'Remove separate format' })).toBeDefined()
  })
})

describe('JiraTab — Release/Build mirror pattern', () => {
  it('Build mirrors Release when unset ("same as release" + set button)', () => {
    renderTab({ component: makeComponent({ configurations: [makeBaseRow({ jira: { releaseVersionFormat: 'R' } })] }) })
    expect(screen.getByLabelText('Build Version Format (mirrored)')).toHaveValue('R')
    expect(screen.getByText('same as release')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Set separate build format' })).toBeDefined()
  })

  it('loads a stored separate Build as an editable input', () => {
    renderTab({ component: makeComponent({ configurations: [makeBaseRow({ jira: { releaseVersionFormat: 'R', buildVersionFormat: 'B' } })] }) })
    expect(screen.getByLabelText('Build Version Format')).toHaveValue('B')
  })
})

describe('JiraTab — mirror blocked by per-range overrides', () => {
  const minorOverride: FieldOverride = {
    id: 'o1', overriddenAttribute: 'jira.minorVersionFormat', versionRange: '[2.0,)',
    rowType: 'SCALAR_OVERRIDE', value: '$major', markerChildren: null, createdAt: null, updatedAt: null,
  }

  it('forces the Minor field expanded and disables Remove when overrides exist', () => {
    renderTab({
      component: makeComponent({ configurations: [makeBaseRow({ jira: { lineVersionFormat: 'L' } })] }),
      serverOverrides: [minorOverride],
    })
    // Expanded (editable input present) even though the base value mirrors Line.
    expect(screen.getByLabelText('Minor Version Format')).toBeDefined()
    const remove = screen.getByRole('button', { name: 'Remove separate format' })
    expect(remove).toBeDisabled()
    expect(screen.getByText(/per-range overrides exist/i)).toBeDefined()
  })
})

describe('JiraTab — Hotfix visibility (task D)', () => {
  it('shows the Hotfix Version Format when hotfixes are enabled', () => {
    renderTab({ component: withHotfix({ jira: { lineVersionFormat: 'L' } }) })
    expect(screen.getByLabelText('Hotfix Version Format')).toBeDefined()
  })

  it('hides the Hotfix Version Format when hotfixes are disabled, even with a stored value', () => {
    renderTab({ component: makeComponent({ jiraHotfixVersionFormat: '$major.$minor.$service-$fix' }) })
    expect(screen.queryByLabelText('Hotfix Version Format')).toBeNull()
  })
})

describe('JiraTab — Technical (admin-gated)', () => {
  it('non-admin: switch disabled + "admin only" lock pill', () => {
    fcEntries['jira.technical'] = { visibility: 'editable', editable: 'adminOnly' }
    editableMap['jira.technical'] = false
    renderTab({ component: makeComponent() })
    expect(screen.getByRole('switch', { name: /technical/i })).toBeDisabled()
    expect(screen.getByText('admin only')).toBeDefined()
  })

  it('admin: switch enabled and no lock pill', () => {
    fcEntries['jira.technical'] = { visibility: 'editable', editable: 'adminOnly' }
    editableMap['jira.technical'] = true
    renderTab({ component: makeComponent() })
    expect(screen.getByRole('switch', { name: /technical/i })).not.toBeDisabled()
    expect(screen.queryByText('admin only')).toBeNull()
  })

  it('shows the SubComponent Fix Version/s info banner when Technical is ON', () => {
    renderTab({ component: makeComponent({ configurations: [makeBaseRow({ jira: { technical: true } })] }) })
    expect(screen.getByText(/SubComponent Fix Version\/s/i)).toBeDefined()
  })
})

describe('JiraTab — Skip Commit Check (new toggle)', () => {
  it('renders a "new" pill and is editable by default (non-Whiskey)', () => {
    renderTab({ component: makeComponent() })
    expect(screen.getByText('new')).toBeDefined()
    expect(screen.getByRole('switch', { name: /skip commit check/i })).not.toBeDisabled()
  })

  it('is disabled with a hint for Whiskey components', () => {
    renderTab({ component: makeComponent({ configurations: [makeBaseRow({ build: { buildSystem: 'WHISKEY' } })] }) })
    expect(screen.getByRole('switch', { name: /skip commit check/i })).toBeDisabled()
    expect(screen.getByText(/not applicable for whiskey/i)).toBeDefined()
  })

  it('has no per-range override affordance (component-level)', () => {
    renderTab({ component: makeComponent() })
    expect(screen.queryByTestId('field-override-inline-jira.skipCommitCheck')).toBeNull()
  })
})

describe('JiraTab — field-config visibility / editability', () => {
  it('does not render a field-config-hidden field', () => {
    fcEntries['jira.versionPrefix'] = { visibility: 'hidden' }
    renderTab({ component: makeComponent() })
    expect(screen.queryByLabelText('Jira Version Prefix')).toBeNull()
  })

  it('disables a readonly field via effective editability', () => {
    fcEntries['jira.versionPrefix'] = { visibility: 'readonly' }
    editableMap['jira.versionPrefix'] = false
    renderTab({ component: makeComponent() })
    expect(screen.getByLabelText('Jira Version Prefix')).toBeDisabled()
  })
})

describe('JiraTab — 409 inline conflict', () => {
  it('renders the conflict message + invalid state under Project Key', () => {
    renderTab({ component: makeComponent(), conflictError: 'Project Key + Prefix must be unique.' })
    expect(screen.getByText('Project Key + Prefix must be unique.')).toBeDefined()
    expect(screen.getByLabelText('Project Key')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows no conflict text when there is none', () => {
    renderTab({ component: makeComponent() })
    expect(screen.getByLabelText('Project Key')).not.toHaveAttribute('aria-invalid')
  })
})

describe('JiraTab — Jira display name shown only when divergent', () => {
  const NOTE = /shown because it differs/i

  it('hides the Jira Display Name field when it is unset', () => {
    renderTab({ component: makeComponent() })
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('hides the Jira Display Name field when it equals the component display name', () => {
    renderTab({ component: makeComponent({ jiraDisplayName: 'My Component' }) })
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('shows the Jira Display Name field (pre-filled) when it diverges', () => {
    renderTab({ component: makeComponent({ jiraDisplayName: 'Divergent Jira Name' }) })
    expect(screen.getByText(NOTE)).toBeDefined()
    expect(screen.getByDisplayValue('Divergent Jira Name')).toBeDefined()
  })

  it('does NOT send jiraDisplayName in the slice when only the project key changed', async () => {
    renderTab({ component: makeComponent({ jiraDisplayName: 'Divergent Jira Name' }) })
    await userEvent.type(screen.getByPlaceholderText('JIRA project key'), 'X')
    expect('jiraDisplayName' in captured.section!.slice.request).toBe(false)
  })
})

describe('JiraTab — slice', () => {
  it('project key edits land in baseConfiguration.jira', async () => {
    renderTab({ component: makeComponent({ configurations: [makeBaseRow({ jira: { projectKey: 'OLD' } })] }) })
    const input = screen.getByPlaceholderText('JIRA project key')
    await userEvent.clear(input)
    await userEvent.type(input, 'NEW')
    expect(captured.section!.slice.request.baseConfiguration?.jira?.projectKey).toBe('NEW')
  })

  it('editing the mirrored Line materializes it into both line and minor', async () => {
    renderTab({ component: makeComponent({ configurations: [makeBaseRow({ jira: { lineVersionFormat: 'L' } })] }) })
    const line = screen.getByLabelText('Line Version Format')
    await userEvent.clear(line)
    await userEvent.type(line, 'L2')
    const jira = captured.section!.slice.request.baseConfiguration?.jira
    expect(jira?.lineVersionFormat).toBe('L2')
    expect(jira?.minorVersionFormat).toBe('L2')
  })
})

describe('JiraTab field descriptions (FieldInfo)', () => {
  const EXPECTED_PATHS = [
    'jira.projectKey', 'jira.technical', 'component.releasesInDefaultBranch',
    'jira.hotfixVersionFormat', 'jira.versionPrefix', 'jira.minorVersionFormat', 'jira.releaseVersionFormat',
    'jira.buildVersionFormat', 'jira.lineVersionFormat', 'jira.versionFormat', 'jira.skipCommitCheck',
  ]

  it('renders exactly one info icon per described field', () => {
    renderTab({ component: withHotfix({ jira: { lineVersionFormat: 'L' } }) })
    for (const path of EXPECTED_PATHS) {
      expect(document.querySelectorAll(`[data-field-path="${path}"]`), `info icon for ${path}`).toHaveLength(1)
    }
  })

  it('opens the registry description for Project Key on focus', async () => {
    renderTab({ component: makeComponent() })
    const trigger = document.querySelector('[data-field-path="jira.projectKey"]') as HTMLElement
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(fieldDescriptions['jira.projectKey']!)
  })
})
