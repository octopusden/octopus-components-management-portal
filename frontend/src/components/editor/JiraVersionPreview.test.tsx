import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { JiraVersionPreview, type JiraVersionPreviewProps } from './JiraVersionPreview'
import { useVersionPreview, type VersionPreviewRequest } from '../../hooks/useVersionPreview'
import type { DetailedComponentVersion } from '../../lib/types'

// The preview renders server-truth via useVersionPreview (one call for the
// standard rows, one for the hotfix rows). Stub the hook so these render tests
// don't need a QueryClient; importActual keeps jiraOverridesToPreview real.
vi.mock('../../hooks/useVersionPreview', async (orig) => ({
  ...(await orig<typeof import('../../hooks/useVersionPreview')>()),
  useVersionPreview: vi.fn(),
}))
const mockPreview = vi.mocked(useVersionPreview)

// Returned for BOTH the main and hotfix calls (the mock is arg-agnostic). Values
// are deliberately distinct per coordinate so a mis-mapped row is caught.
const DETAILED: DetailedComponentVersion = {
  component: 'preview',
  minorVersion: { type: 'MINOR', version: '1.2', jiraVersion: 'acme-1.2' },
  lineVersion: { type: 'LINE', version: '1.2', jiraVersion: '1.2' },
  buildVersion: { type: 'BUILD', version: '1.2.3-9', jiraVersion: '1.2.3-9' },
  rcVersion: { type: 'RC', version: '1.2.3', jiraVersion: 'acme-1.2.3_RC' },
  releaseVersion: { type: 'RELEASE', version: '1.2.3', jiraVersion: 'acme-1.2.3' },
  hotfixVersion: { type: 'HOTFIX', version: '1.2.3-9', jiraVersion: 'acme-1.2.3-9' },
}

type Result = { data?: DetailedComponentVersion; isLoading?: boolean; isError?: boolean }

// The component makes TWO calls — main (hotfixEnabled:false) and hotfix
// (hotfixEnabled:true). Branch on the request so the two can be driven to
// DIFFERENT states (a swap of mainQuery.data/hotfixQuery.data would then fail).
function setPreview(main: Result, hotfix: Result = main) {
  mockPreview.mockImplementation(
    (req: VersionPreviewRequest) =>
      ({ isLoading: false, isError: false, ...(req.hotfixEnabled ? hotfix : main) }) as ReturnType<typeof useVersionPreview>,
  )
}

function ok(data: DetailedComponentVersion = DETAILED) {
  setPreview({ data })
}

beforeEach(() => {
  ok()
})

function baseProps(overrides: Partial<JiraVersionPreviewProps> = {}): JiraVersionPreviewProps {
  return {
    versionPrefix: 'acme',
    versionFormat: '$versionPrefix-$baseVersionFormat',
    lineVersionFormat: '$major.$minor',
    minorVersionFormat: '',
    minorSeparate: false,
    releaseVersionFormat: '$major.$minor.$service',
    buildVersionFormat: '',
    buildSeparate: false,
    hotfixVersionFormat: '$major.$minor.$service-$fix',
    technical: false,
    hotfixEnabled: true,
    hoveredField: null,
    onHoverField: () => {},
    ...overrides,
  }
}

function renderPreview(overrides: Partial<JiraVersionPreviewProps> = {}) {
  return render(<JiraVersionPreview {...baseProps(overrides)} />)
}

function rowValue(id: string): string {
  return within(screen.getByTestId(`ladder-row-${id}`)).getByTestId('ladder-value').textContent ?? ''
}
function row(id: string): HTMLElement {
  return screen.getByTestId(`ladder-row-${id}`)
}

describe('JiraVersionPreview — server-rendered rows', () => {
  it('renders each coordinate from the server response (jiraVersion for Jira-facing, version for CI rows)', () => {
    renderPreview()
    expect(rowValue('release')).toBe('acme-1.2.3')
    expect(rowValue('rc')).toBe('acme-1.2.3_RC')
    expect(rowValue('minor')).toBe('acme-1.2')
    expect(rowValue('line')).toBe('1.2')
    expect(rowValue('build')).toBe('1.2.3-9')
    expect(rowValue('hotfix-build')).toBe('1.2.3-9')
    expect(rowValue('hotfix-jira')).toBe('acme-1.2.3-9')
  })

  it('renders the rows in ladder order', () => {
    renderPreview()
    const ids = screen.getAllByTestId(/^ladder-row-/).map((el) => el.getAttribute('data-testid'))
    expect(ids).toEqual([
      'ladder-row-release',
      'ladder-row-rc',
      'ladder-row-minor',
      'ladder-row-line',
      'ladder-row-build',
      'ladder-row-hotfix-build',
      'ladder-row-hotfix-jira',
    ])
  })
})

describe('JiraVersionPreview — sample arity tracks the format', () => {
  it('the version input default has as many segments as the deepest format uses', () => {
    // release "$major.$minor.$service" → 3 segments.
    renderPreview()
    expect(screen.getByLabelText('version')).toHaveValue('1.2.3')
  })

  it('re-derives a deeper sample when the (separate) build format adds an index', () => {
    // build "$major.$minor.$service-$fix" is deeper (4) → the sample grows a $fix segment.
    renderPreview({ buildSeparate: true, buildVersionFormat: '$major.$minor.$service-$fix' })
    expect(screen.getByLabelText('version')).toHaveValue('1.2.3-87')
  })
})

describe('JiraVersionPreview — captions & tags', () => {
  it('Minor is tagged "in Jira"; mirrored Build keeps the "= release format" tag', () => {
    renderPreview()
    expect(within(row('minor')).getByText('in Jira')).toBeInTheDocument()
    expect(within(row('build')).getByText('= release format')).toBeInTheDocument()
  })

  it('separate Build swaps to the "no prefix" tag', () => {
    renderPreview({ buildSeparate: true, buildVersionFormat: '$major.$minor.$service.$fix' })
    expect(within(row('build')).getByText('no prefix')).toBeInTheDocument()
  })

  it('Line renders bare with a "no prefix" tag', () => {
    renderPreview()
    expect(within(row('line')).getByText('no prefix')).toBeInTheDocument()
  })

  it('switches the Release/RC/Hotfix destinations when Technical is ON', () => {
    renderPreview({ technical: true })
    expect(within(row('release')).getByText(/SubComponent Fix Version\/s/i)).toBeInTheDocument()
    expect(within(row('rc')).getByText(/SubComponent Fix Version\/s/i)).toBeInTheDocument()
    expect(within(row('hotfix-jira')).getByText(/SubComponent Fix Version\/s/i)).toBeInTheDocument()
  })
})

describe('JiraVersionPreview — hotfix rows', () => {
  it('shows the hotfix rows + separate hotfix input only when hotfixes are enabled', () => {
    renderPreview()
    expect(screen.getByLabelText('hotfix version')).toBeInTheDocument()
    expect(row('hotfix-build')).toBeInTheDocument()
    expect(row('hotfix-jira')).toBeInTheDocument()
  })

  it('omits the hotfix rows + input when hotfixes are disabled', () => {
    renderPreview({ hotfixEnabled: false })
    expect(screen.queryByTestId('ladder-row-hotfix-build')).toBeNull()
    expect(screen.queryByTestId('ladder-row-hotfix-jira')).toBeNull()
    expect(screen.queryByLabelText('hotfix version')).toBeNull()
  })
})

describe('JiraVersionPreview — loading & empty', () => {
  it('shows the loading notice while the standard rows are pending', () => {
    setPreview({ isLoading: true })
    renderPreview()
    expect(screen.getByTestId('version-preview-loading')).toBeInTheDocument()
  })

  it('falls back to a notice when the server returns nothing (unparseable version / 4xx)', () => {
    setPreview({ isError: true })
    renderPreview()
    expect(screen.getByTestId('version-preview-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('ladder-row-release')).toBeNull()
  })

  it('a failed main version hides the hotfix block entirely (no contradictory "no preview" + hotfix rows)', () => {
    // main fails, hotfix would succeed — the hotfix block must NOT render alongside
    // the "No preview" notice (the two run as independent queries).
    setPreview({ isError: true }, { data: DETAILED })
    renderPreview()
    expect(screen.getByTestId('version-preview-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('ladder-row-hotfix-build')).toBeNull()
    expect(screen.queryByLabelText('hotfix version')).toBeNull()
  })

  it('a failed hotfix sample shows a scoped hotfix notice, not silence, with the main rows intact', () => {
    setPreview({ data: DETAILED }, { isError: true })
    renderPreview()
    expect(rowValue('release')).toBe('acme-1.2.3')
    expect(screen.getByTestId('hotfix-preview-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('ladder-row-hotfix-build')).toBeNull()
  })

  it('renders the hotfix rows from a DIFFERENT (hotfix) sample than the main rows', () => {
    const hotfixData: DetailedComponentVersion = {
      ...DETAILED,
      hotfixVersion: { type: 'HOTFIX', version: '9.9.9-42', jiraVersion: 'acme-9.9.9-42' },
    }
    setPreview({ data: DETAILED }, { data: hotfixData })
    renderPreview()
    // Main build row from the main call; hotfix row from the hotfix call — proving
    // the two queries are not crossed.
    expect(rowValue('build')).toBe('1.2.3-9')
    expect(rowValue('hotfix-build')).toBe('9.9.9-42')
  })
})

describe('JiraVersionPreview — hover linking (field → row)', () => {
  it('highlights the Line and Minor rows when the Line field is hovered (mirrored)', () => {
    renderPreview({ hoveredField: 'jira.lineVersionFormat' })
    expect(row('line')).toHaveAttribute('data-highlighted', 'true')
    expect(row('minor')).toHaveAttribute('data-highlighted', 'true')
    expect(row('release')).not.toHaveAttribute('data-highlighted')
  })

  it('highlights the leading Line row when the mirrored Minor field is hovered', () => {
    renderPreview({ hoveredField: 'jira.minorVersionFormat' })
    expect(row('line')).toHaveAttribute('data-highlighted', 'true')
    expect(row('minor')).not.toHaveAttribute('data-highlighted')
  })

  it('highlights Release + RC + the mirrored Build row when the Release field is hovered', () => {
    renderPreview({ hoveredField: 'jira.releaseVersionFormat' })
    expect(row('release')).toHaveAttribute('data-highlighted', 'true')
    expect(row('rc')).toHaveAttribute('data-highlighted', 'true')
    expect(row('build')).toHaveAttribute('data-highlighted', 'true')
  })

  it('does NOT light the separate Build row when the Release field is hovered', () => {
    renderPreview({ hoveredField: 'jira.releaseVersionFormat', buildSeparate: true, buildVersionFormat: '$major.$minor' })
    expect(row('release')).toHaveAttribute('data-highlighted', 'true')
    expect(row('build')).not.toHaveAttribute('data-highlighted')
  })

  it('highlights all prefix-wrapped rows when the Version Prefix field is hovered', () => {
    renderPreview({ hoveredField: 'jira.versionPrefix' })
    for (const id of ['release', 'rc', 'minor', 'hotfix-jira']) {
      expect(row(id)).toHaveAttribute('data-highlighted', 'true')
    }
    expect(row('line')).not.toHaveAttribute('data-highlighted')
    expect(row('build')).not.toHaveAttribute('data-highlighted')
  })

  it('highlights the Release row when the mirrored Build field is hovered', () => {
    renderPreview({ hoveredField: 'jira.buildVersionFormat' })
    expect(row('release')).toHaveAttribute('data-highlighted', 'true')
    expect(row('build')).not.toHaveAttribute('data-highlighted')
  })

  it('highlights the separate Minor row (not Line) when the Minor field is hovered', () => {
    renderPreview({ hoveredField: 'jira.minorVersionFormat', minorSeparate: true, minorVersionFormat: '$major' })
    expect(row('minor')).toHaveAttribute('data-highlighted', 'true')
    expect(row('line')).not.toHaveAttribute('data-highlighted')
  })
})

describe('JiraVersionPreview — hover linking (row → field)', () => {
  it('reports the Release field when the Release or RC row is hovered', () => {
    const onHoverField = vi.fn()
    renderPreview({ onHoverField })
    fireEvent.mouseEnter(row('release'))
    expect(onHoverField).toHaveBeenLastCalledWith('jira.releaseVersionFormat')
    fireEvent.mouseEnter(row('rc'))
    expect(onHoverField).toHaveBeenLastCalledWith('jira.releaseVersionFormat')
  })

  it('reports the leading Line field when a mirrored Minor row is hovered', () => {
    const onHoverField = vi.fn()
    renderPreview({ onHoverField })
    fireEvent.mouseEnter(row('minor'))
    expect(onHoverField).toHaveBeenLastCalledWith('jira.lineVersionFormat')
  })

  it('reports the leading Release field when a mirrored Build row is hovered', () => {
    const onHoverField = vi.fn()
    renderPreview({ onHoverField })
    fireEvent.mouseEnter(row('build'))
    expect(onHoverField).toHaveBeenLastCalledWith('jira.releaseVersionFormat')
  })

  it('reports the separate Minor/Build fields when those rows are hovered separately', () => {
    const onHoverField = vi.fn()
    renderPreview({
      onHoverField,
      minorSeparate: true,
      minorVersionFormat: '$major',
      buildSeparate: true,
      buildVersionFormat: '$major.$minor',
    })
    fireEvent.mouseEnter(row('minor'))
    expect(onHoverField).toHaveBeenLastCalledWith('jira.minorVersionFormat')
    fireEvent.mouseEnter(row('build'))
    expect(onHoverField).toHaveBeenLastCalledWith('jira.buildVersionFormat')
  })

  it('reports the Hotfix field for either hotfix row', () => {
    const onHoverField = vi.fn()
    renderPreview({ onHoverField })
    fireEvent.mouseEnter(row('hotfix-build'))
    expect(onHoverField).toHaveBeenLastCalledWith('jira.hotfixVersionFormat')
    fireEvent.mouseEnter(row('hotfix-jira'))
    expect(onHoverField).toHaveBeenLastCalledWith('jira.hotfixVersionFormat')
  })

  it('clears the hovered field when the pointer leaves a row', () => {
    const onHoverField = vi.fn()
    renderPreview({ onHoverField })
    fireEvent.mouseEnter(row('release'))
    fireEvent.mouseLeave(row('release'))
    expect(onHoverField).toHaveBeenLastCalledWith(null)
  })
})

describe('JiraVersionPreview — keyboard row → field linking (a11y)', () => {
  it('rows are focusable and focus reports the same field as hover', () => {
    const onHoverField = vi.fn()
    renderPreview({ onHoverField })
    const release = row('release')
    expect(release).toHaveAttribute('tabindex', '0')
    fireEvent.focus(release)
    expect(onHoverField).toHaveBeenLastCalledWith('jira.releaseVersionFormat')
    fireEvent.blur(release)
    expect(onHoverField).toHaveBeenLastCalledWith(null)
  })

  it('focusing a mirrored Minor row reports the leading Line field (keyboard parity)', () => {
    const onHoverField = vi.fn()
    renderPreview({ onHoverField })
    fireEvent.focus(row('minor'))
    expect(onHoverField).toHaveBeenLastCalledWith('jira.lineVersionFormat')
  })
})
