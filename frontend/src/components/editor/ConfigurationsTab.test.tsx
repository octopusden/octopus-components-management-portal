import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConfigurationsTab } from './ConfigurationsTab'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

function makeConfig(overrides: Partial<ComponentConfiguration> = {}): ComponentConfiguration {
  return {
    id: 'cfg-1',
    versionRange: '(,0),[0,)',
    rowType: 'BASE',
    overriddenAttribute: null,
    isSyntheticBase: false,
    build: null,
    escrow: null,
    jira: null,
    vcsEntries: [],
    mavenArtifacts: [],
    fileUrlArtifacts: [],
    dockerImages: [],
    packages: [],
    requiredTools: [],
    ...overrides,
  }
}

function makeComponent(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 'c-1',
    name: 'my-component',
    displayName: 'My Component',
    componentOwner: 'alice',
    productType: null,
    systems: [],
    clientCode: null,
    solution: false,
    parentComponentName: null,
    archived: false,
    version: 1,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as ComponentDetail
}

describe('ConfigurationsTab — empty state', () => {
  it('renders "No configuration rows" when configurations is undefined', () => {
    const component = makeComponent({ configurations: undefined })
    render(<ConfigurationsTab component={component} />)
    expect(screen.getByText('No configuration rows')).toBeDefined()
  })

  it('renders "No configuration rows" when configurations is empty array', () => {
    const component = makeComponent({ configurations: [] })
    render(<ConfigurationsTab component={component} />)
    expect(screen.getByText('No configuration rows')).toBeDefined()
  })
})

describe('ConfigurationsTab — table rendering', () => {
  const baseRow = makeConfig({
    id: 'cfg-base',
    rowType: 'BASE',
    versionRange: '(,0),[0,)',
    build: { buildSystem: 'GRADLE', javaVersion: '17' },
    jira: { projectKey: 'PROJ' },
    vcsEntries: [
      { id: 'v1', vcsPath: '/repo/main', sortOrder: 0 },
      { id: 'v2', vcsPath: '/repo/hotfix', sortOrder: 1 },
    ],
    mavenArtifacts: [
      { id: 'm1', groupPattern: 'com.example', artifactPattern: 'lib', sortOrder: 0 },
    ],
  })

  const scalarRow = makeConfig({
    id: 'cfg-scalar',
    rowType: 'SCALAR_OVERRIDE',
    versionRange: '[2.0,3.0)',
    overriddenAttribute: 'build.javaVersion',
    build: { javaVersion: '21' },
  })

  const markerRow = makeConfig({
    id: 'cfg-marker',
    rowType: 'MARKER',
    versionRange: '[1.0,2.0)',
    overriddenAttribute: 'distribution.maven',
    mavenArtifacts: [
      { id: 'm2', groupPattern: 'org.example', artifactPattern: 'override', sortOrder: 0 },
      { id: 'm3', groupPattern: 'org.example', artifactPattern: 'extra', sortOrder: 1 },
    ],
  })

  const component = makeComponent({
    configurations: [scalarRow, markerRow, baseRow],
  })

  it('renders all three rows', () => {
    render(<ConfigurationsTab component={component} />)
    expect(screen.getByText('BASE')).toBeDefined()
    expect(screen.getByText('SCALAR_OVERRIDE')).toBeDefined()
    expect(screen.getByText('MARKER')).toBeDefined()
  })

  it('BASE row appears first in the table', () => {
    render(<ConfigurationsTab component={component} />)
    const rows = screen.getAllByRole('row')
    // rows[0] is the header; rows[1] should be BASE
    expect(rows[1]!.textContent).toContain('BASE')
  })

  it('rowType badges have different variant attributes', () => {
    const { container } = render(<ConfigurationsTab component={component} />)
    const badges = container.querySelectorAll('[data-variant]')
    const variants = Array.from(badges).map((b) => b.getAttribute('data-variant'))
    // BASE → default, SCALAR_OVERRIDE → secondary, MARKER → outline
    expect(variants).toContain('default')
    expect(variants).toContain('secondary')
    expect(variants).toContain('outline')
  })

  it('BASE row payload summary lists populated aspects and child counts', () => {
    render(<ConfigurationsTab component={component} />)
    // build and jira are populated; vcsEntries: 2, maven: 1
    expect(screen.getByText(/build.*jira/i)).toBeDefined()
    expect(screen.getByText(/vcsEntries: 2/)).toBeDefined()
    expect(screen.getByText(/maven: 1/)).toBeDefined()
  })

  it('SCALAR_OVERRIDE row shows "= <value>" format in payload summary', () => {
    render(<ConfigurationsTab component={component} />)
    expect(screen.getByText('= 21')).toBeDefined()
  })

  it('MARKER row shows "<N> entries" in payload summary', () => {
    render(<ConfigurationsTab component={component} />)
    expect(screen.getByText('2 entries')).toBeDefined()
  })

  it('displays em-dash for null overriddenAttribute on BASE row', () => {
    render(<ConfigurationsTab component={component} />)
    // The BASE row overriddenAttribute cell should show the em-dash character
    const cells = screen.getAllByText('—')
    expect(cells.length).toBeGreaterThan(0)
  })
})

describe('ConfigurationsTab — isSyntheticBase flag', () => {
  it('renders "synthetic" badge when isSyntheticBase is true', () => {
    const component = makeComponent({
      configurations: [makeConfig({ isSyntheticBase: true })],
    })
    render(<ConfigurationsTab component={component} />)
    expect(screen.getByText('synthetic')).toBeDefined()
  })

  it('does not render "synthetic" badge when isSyntheticBase is false', () => {
    const component = makeComponent({
      configurations: [makeConfig({ isSyntheticBase: false })],
    })
    render(<ConfigurationsTab component={component} />)
    expect(screen.queryByText('synthetic')).toBeNull()
  })
})

describe('ConfigurationsTab — sort order', () => {
  it('SCALAR_OVERRIDE rows are sorted by overriddenAttribute then versionRange', () => {
    const component = makeComponent({
      configurations: [
        makeConfig({
          id: 's2',
          rowType: 'SCALAR_OVERRIDE',
          versionRange: '[2.0,3.0)',
          overriddenAttribute: 'build.javaVersion',
          build: { javaVersion: '21' },
        }),
        makeConfig({
          id: 's1',
          rowType: 'SCALAR_OVERRIDE',
          versionRange: '[1.0,2.0)',
          overriddenAttribute: 'build.javaVersion',
          build: { javaVersion: '17' },
        }),
        makeConfig({ id: 'base', rowType: 'BASE' }),
      ],
    })
    render(<ConfigurationsTab component={component} />)
    const rows = screen.getAllByRole('row')
    // rows[0] header, rows[1] BASE, rows[2] first scalar, rows[3] second scalar
    expect(rows[1]!.textContent).toContain('BASE')
    expect(rows[2]!.textContent).toContain('[1.0,2.0)')
    expect(rows[3]!.textContent).toContain('[2.0,3.0)')
  })
})

describe('ConfigurationsTab — build.requiredTools marker', () => {
  it('renders "<N> tools" for build.requiredTools marker', () => {
    const component = makeComponent({
      configurations: [
        makeConfig({
          id: 'marker-tools',
          rowType: 'MARKER',
          overriddenAttribute: 'build.requiredTools',
          requiredTools: ['tool-a', 'tool-b', 'tool-c'],
        }),
      ],
    })
    render(<ConfigurationsTab component={component} />)
    expect(screen.getByText('3 tools')).toBeDefined()
  })
})

describe('ConfigurationsTab — scalar override edge cases', () => {
  it('renders "= false" when the typed boolean override value is false', () => {
    const component = makeComponent({
      configurations: [
        makeConfig({
          id: 'sc-bool',
          rowType: 'SCALAR_OVERRIDE',
          overriddenAttribute: 'build.deprecated',
          build: { deprecated: false },
        }),
      ],
    })
    render(<ConfigurationsTab component={component} />)
    expect(screen.getByText('= false')).toBeDefined()
  })

  it('renders "= null" when the override aspect carries the field explicitly nulled', () => {
    const component = makeComponent({
      configurations: [
        makeConfig({
          id: 'sc-null',
          rowType: 'SCALAR_OVERRIDE',
          overriddenAttribute: 'build.javaVersion',
          build: { javaVersion: null },
        }),
      ],
    })
    render(<ConfigurationsTab component={component} />)
    expect(screen.getByText('= null')).toBeDefined()
  })

  it('renders em-dash when the override aspect does not carry the field at all', () => {
    // Schema mismatch / drift: aspect object lacks the referenced field key.
    // The summary should NOT misleadingly render "= null" — em-dash signals
    // "absent" so a debugger can distinguish the two.
    const component = makeComponent({
      configurations: [
        makeConfig({
          id: 'sc-absent',
          rowType: 'SCALAR_OVERRIDE',
          overriddenAttribute: 'build.javaVersion',
          build: {}, // field absent (not "= null")
        }),
      ],
    })
    render(<ConfigurationsTab component={component} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders em-dash when overriddenAttribute has no dot', () => {
    const component = makeComponent({
      configurations: [
        makeConfig({
          id: 'sc-nodot',
          rowType: 'SCALAR_OVERRIDE',
          overriddenAttribute: 'noDotPath',
        }),
      ],
    })
    render(<ConfigurationsTab component={component} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

describe('ConfigurationsTab — unknown marker fallback', () => {
  it('renders em-dash for a marker name not in the canonical six-marker map', () => {
    const component = makeComponent({
      configurations: [
        makeConfig({
          id: 'marker-unknown',
          rowType: 'MARKER',
          overriddenAttribute: 'distribution.helmChart', // hypothetical future marker
        }),
      ],
    })
    render(<ConfigurationsTab component={component} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
