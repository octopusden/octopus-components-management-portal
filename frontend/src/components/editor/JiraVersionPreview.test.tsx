import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JiraVersionPreview, type JiraVersionPreviewProps } from './JiraVersionPreview'
import { useVersionPreview } from '../../hooks/useVersionPreview'
import type { DetailedComponentVersion } from '../../lib/types'

// The Whiskey path fetches via useVersionPreview; stub it so the render tests
// don't need a QueryClient. The client (non-Whiskey) path never calls it.
// importActual keeps jiraOverridesToPreview real (unused here, but avoids a
// half-mocked module).
vi.mock('../../hooks/useVersionPreview', async (orig) => ({
  ...(await orig<typeof import('../../hooks/useVersionPreview')>()),
  useVersionPreview: vi.fn(),
}))
const mockPreview = vi.mocked(useVersionPreview)
beforeEach(() => {
  mockPreview.mockReturnValue({ data: undefined, isLoading: false, isError: false } as ReturnType<typeof useVersionPreview>)
})

/** Brief §4 example defaults (1.2.3 / pgw / hotfix 1.2.3-87), mirrored pairs. */
function baseProps(overrides: Partial<JiraVersionPreviewProps> = {}): JiraVersionPreviewProps {
  return {
    versionPrefix: 'pgw',
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

/** The rendered value text of a ladder row. */
function rowValue(id: string): string {
  return within(screen.getByTestId(`ladder-row-${id}`)).getByTestId('ladder-value').textContent ?? ''
}
function row(id: string): HTMLElement {
  return screen.getByTestId(`ladder-row-${id}`)
}

describe('JiraVersionPreview — brief §4 ladder example', () => {
  it('renders each row with the expected value (1.2.3 / pgw / hotfix 1.2.3-87)', () => {
    renderPreview()
    expect(rowValue('release')).toBe('pgw-1.2.3')
    expect(rowValue('rc')).toBe('pgw-1.2.3_RC')
    expect(rowValue('minor')).toBe('pgw-1.2')
    expect(rowValue('line')).toBe('1.2')
    expect(rowValue('build')).toBe('1.2.3')
    // Hotfix sample is derived from the hotfix format's arity ($…-$fix → 1.2.3-87).
    expect(rowValue('hotfix-build')).toBe('1.2.3-87')
    expect(rowValue('hotfix-jira')).toBe('pgw-1.2.3-87')
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

  it('shows the dashed server-computed footer note', () => {
    renderPreview()
    expect(screen.getByText(/filled by the\s+server at build\/release time/i)).toBeInTheDocument()
  })
})

describe('JiraVersionPreview — captions & tags', () => {
  it('Minor is always tagged "in Jira"; mirrored Build keeps the "= release format" tag', () => {
    renderPreview()
    expect(within(row('minor')).getByText('in Jira')).toBeInTheDocument()
    expect(within(row('build')).getByText('= release format')).toBeInTheDocument()
  })

  it('separate Minor/Build swap to the "in Jira" / "no prefix" tags and own values', () => {
    renderPreview({
      minorSeparate: true,
      minorVersionFormat: '$major',
      buildSeparate: true,
      buildVersionFormat: '$major.$minor.$service.$fix',
    })
    expect(within(row('minor')).getByText('in Jira')).toBeInTheDocument()
    expect(rowValue('minor')).toBe('pgw-1')
    expect(within(row('build')).getByText('no prefix')).toBeInTheDocument()
    // Sample arity follows the deepest (separate build) format → $fix filled (…87).
    expect(rowValue('build')).toBe('1.2.3.87')
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

describe('JiraVersionPreview — default sample arity', () => {
  it('fills every used position for a non-$major-leading build format (no zeroed rows)', () => {
    // $service.$fix skips the leading positions; the derived sample must still
    // fill them so the shown sample and the recomputed row agree (P1 regression).
    renderPreview({ buildSeparate: true, buildVersionFormat: '$service.$fix' })
    expect(screen.getByLabelText('version')).toHaveValue('1.2.3.87')
    // Build renders $service.$fix from that sample → 3.87, not the pre-fix 0.0.
    expect(rowValue('build')).toBe('3.87')
  })
})

describe('JiraVersionPreview — hotfix dual rows', () => {
  it('shows both hotfix rows only when hotfixes are enabled', () => {
    renderPreview({ hotfixEnabled: false })
    expect(screen.queryByTestId('ladder-row-hotfix-build')).toBeNull()
    expect(screen.queryByTestId('ladder-row-hotfix-jira')).toBeNull()
    // The separate hotfix-version sample input is hidden too.
    expect(screen.queryByLabelText('hotfix version')).toBeNull()
  })

  it('computes hotfix rows from the separate hotfix sample (different arity)', () => {
    renderPreview()
    expect(screen.getByLabelText('hotfix version')).toHaveValue('1.2.3-87')
    expect(rowValue('hotfix-build')).toBe('1.2.3-87')
  })
})

describe('JiraVersionPreview — editable samples recompute', () => {
  it('recomputes the standard rows when the version sample changes', async () => {
    renderPreview()
    const sample = screen.getByLabelText('version')
    await userEvent.clear(sample)
    await userEvent.type(sample, '3.4.5')
    expect(rowValue('release')).toBe('pgw-3.4.5')
    expect(rowValue('line')).toBe('3.4')
  })

  it('recomputes only the hotfix rows when the hotfix sample changes', async () => {
    renderPreview()
    const hotfix = screen.getByLabelText('hotfix version')
    await userEvent.clear(hotfix)
    await userEvent.type(hotfix, '9.9.9-42')
    expect(rowValue('hotfix-build')).toBe('9.9.9-42')
    // Standard rows keep the original sample.
    expect(rowValue('release')).toBe('pgw-1.2.3')
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

  it('highlights the Release row when the mirrored Build field is hovered', () => {
    renderPreview({ hoveredField: 'jira.buildVersionFormat' })
    expect(row('release')).toHaveAttribute('data-highlighted', 'true')
    expect(row('build')).not.toHaveAttribute('data-highlighted')
  })

  it('highlights Release + RC + the mirrored Build row when the Release field is hovered', () => {
    renderPreview({ hoveredField: 'jira.releaseVersionFormat' })
    expect(row('release')).toHaveAttribute('data-highlighted', 'true')
    expect(row('rc')).toHaveAttribute('data-highlighted', 'true')
    // Build mirrors Release by default → it lights up too (symmetric with Line→Minor).
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

describe('JiraVersionPreview — Whiskey (server-rendered)', () => {
  const detailed: DetailedComponentVersion = {
    component: 'acme',
    minorVersion: { type: 'MINOR', version: '03.62', jiraVersion: 'pgw-03.62' },
    lineVersion: { type: 'LINE', version: '03.62', jiraVersion: '03.62' },
    buildVersion: { type: 'BUILD', version: '03.62.30.19-9', jiraVersion: 'pgw-03.62.30.19-9' },
    rcVersion: { type: 'RC', version: '03.62.30.19', jiraVersion: 'pgw-03.62.30.19_RC' },
    releaseVersion: { type: 'RELEASE', version: '03.62.30.19', jiraVersion: 'pgw-03.62.30.19' },
    hotfixVersion: { type: 'HOTFIX', version: '03.62.30.19-9', jiraVersion: 'pgw-03.62.30.19-9' },
  }

  function ok(data: DetailedComponentVersion) {
    mockPreview.mockReturnValue({ data, isLoading: false, isError: false } as ReturnType<typeof useVersionPreview>)
  }

  it('renders server-truth rows (bare for CI, jiraVersion for Jira-facing)', () => {
    ok(detailed)
    renderPreview({ whiskey: true })
    expect(rowValue('release')).toBe('pgw-03.62.30.19')
    expect(rowValue('rc')).toBe('pgw-03.62.30.19_RC')
    expect(rowValue('minor')).toBe('pgw-03.62')
    expect(rowValue('line')).toBe('03.62')
    expect(rowValue('build')).toBe('03.62.30.19-9')
    expect(rowValue('hotfix-build')).toBe('03.62.30.19-9')
    expect(rowValue('hotfix-jira')).toBe('pgw-03.62.30.19-9')
  })

  it('renders live (no saved-configuration caption) with a single version input (no hotfix input)', () => {
    ok(detailed)
    renderPreview({ whiskey: true })
    // The preview is now live from the unsaved edits — the old caption is gone.
    expect(screen.queryByText(/rendered from the saved configuration/i)).toBeNull()
    expect(screen.getByLabelText('version')).toBeInTheDocument()
    expect(screen.queryByLabelText('hotfix version')).toBeNull()
  })

  it('omits the hotfix rows when hotfixes are disabled even if the server returns one', () => {
    ok(detailed)
    renderPreview({ whiskey: true, hotfixEnabled: false })
    expect(screen.queryByTestId('ladder-row-hotfix-build')).toBeNull()
    expect(screen.queryByTestId('ladder-row-hotfix-jira')).toBeNull()
  })

  it('falls back to a notice when the server returns nothing (unparseable version / error)', () => {
    mockPreview.mockReturnValue({ data: undefined, isLoading: false, isError: true } as ReturnType<typeof useVersionPreview>)
    renderPreview({ whiskey: true })
    expect(screen.getByTestId('version-preview-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('ladder-row-release')).toBeNull()
  })
})
