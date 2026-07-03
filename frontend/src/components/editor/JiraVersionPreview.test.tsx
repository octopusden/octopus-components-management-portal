import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JiraVersionPreview, type JiraVersionPreviewProps } from './JiraVersionPreview'

/** Brief §4 example defaults (1.2.3 / pgw / hotfix 1.2.3-187), mirrored pairs. */
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
  it('renders each row with the expected value (1.2.3 / pgw / hotfix 1.2.3-187)', () => {
    renderPreview()
    expect(rowValue('release')).toBe('pgw-1.2.3')
    expect(rowValue('rc')).toBe('pgw-1.2.3_RC')
    expect(rowValue('minor')).toBe('pgw-1.2')
    expect(rowValue('line')).toBe('1.2')
    expect(rowValue('build')).toBe('1.2.3')
    expect(rowValue('hotfix-build')).toBe('1.2.3-187')
    expect(rowValue('hotfix-jira')).toBe('pgw-1.2.3-187')
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
    expect(screen.getByText(/computed by the server at release time/i)).toBeInTheDocument()
  })
})

describe('JiraVersionPreview — captions & tags', () => {
  it('mirrored Minor/Build show the "= line format" / "= release format" tags', () => {
    renderPreview()
    expect(within(row('minor')).getByText('= line format')).toBeInTheDocument()
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
    expect(rowValue('build')).toBe('1.2.3.0')
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
    expect(screen.getByLabelText('hotfix version')).toHaveValue('1.2.3-187')
    expect(rowValue('hotfix-build')).toBe('1.2.3-187')
  })
})

describe('JiraVersionPreview — approx badges', () => {
  it('marks rows whose template references $fix/$build as approximate', () => {
    renderPreview()
    // Hotfix template references $fix → approx.
    expect(within(row('hotfix-build')).getByText(/approx/i)).toBeInTheDocument()
    expect(within(row('hotfix-jira')).getByText(/approx/i)).toBeInTheDocument()
    // Release/Line/Minor use only $major/$minor/$service → not approx.
    expect(within(row('release')).queryByText(/approx/i)).toBeNull()
    expect(within(row('line')).queryByText(/approx/i)).toBeNull()
  })

  it('adds the approx badge to Build when its separate template references $fix', () => {
    renderPreview({ buildSeparate: true, buildVersionFormat: '$major.$minor.$service.$fix' })
    expect(within(row('build')).getByText(/approx/i)).toBeInTheDocument()
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
