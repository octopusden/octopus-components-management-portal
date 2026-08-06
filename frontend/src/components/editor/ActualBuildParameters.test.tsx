import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActualBuildParameters } from './ActualBuildParameters'
import type { ActualRange, ActualDisagreement } from '../../lib/types'

const range = (versionRange: string, value: string): ActualRange => ({ versionRange, value })
const disagreement = (subRange: string, actualValue: string): ActualDisagreement => ({ subRange, actualValue })

describe('ActualBuildParameters — ranges', () => {
  it('renders each range and its value', () => {
    render(<ActualBuildParameters ranges={[range('[2.0,3.0)', '17'), range('[3.0,)', '21')]} warnings={[]} />)
    expect(screen.getByText('[2.0,3.0)')).toBeDefined()
    expect(screen.getByText('17')).toBeDefined()
    expect(screen.getByText('[3.0,)')).toBeDefined()
    expect(screen.getByText('21')).toBeDefined()
  })

  it('has no add/edit/delete control for a rendered range', () => {
    render(<ActualBuildParameters ranges={[range('[2.0,3.0)', '17')]} warnings={[]} />)
    expect(screen.queryByRole('button', { name: /add|edit|delete/i })).toBeNull()
  })

  it('renders nothing when there are no ranges, no warnings, and data is available', () => {
    const { container } = render(<ActualBuildParameters ranges={[]} warnings={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ActualBuildParameters — disagreement summary', () => {
  it('collapses several disagreements into one summary stating the count', () => {
    render(
      <ActualBuildParameters
        ranges={[]}
        warnings={[disagreement('[2.0,3.0)', '17'), disagreement('[3.0,4.0)', '21'), disagreement('[4.0,5.0)', '11')]}
      />,
    )
    expect(screen.getByText(/3 disagreeing ranges/i)).toBeDefined()
    expect(screen.queryByText('[2.0,3.0)')).toBeNull()
  })

  it('de-duplicates identical (subRange, actualValue) entries before counting', () => {
    render(
      <ActualBuildParameters
        ranges={[]}
        warnings={[disagreement('[2.0,3.0)', '17'), disagreement('[2.0,3.0)', '17'), disagreement('[3.0,4.0)', '21')]}
      />,
    )
    expect(screen.getByText(/2 disagreeing ranges/i)).toBeDefined()
  })

  it('expanding the summary lists each disagreement verbatim', async () => {
    render(
      <ActualBuildParameters ranges={[]} warnings={[disagreement('[2.0,3.0)', '17'), disagreement('[3.0,4.0)', '21')]} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /disagreeing ranges/i }))
    expect(screen.getByText('[2.0,3.0)')).toBeDefined()
    expect(screen.getByText('17')).toBeDefined()
    expect(screen.getByText('[3.0,4.0)')).toBeDefined()
    expect(screen.getByText('21')).toBeDefined()
  })

  it('shows no summary at all when there are no warnings', () => {
    render(<ActualBuildParameters ranges={[range('[2.0,3.0)', '17')]} warnings={[]} />)
    expect(screen.queryByText(/disagreeing ranges/i)).toBeNull()
  })
})

describe('ActualBuildParameters — unavailable', () => {
  it('renders a distinct alert when data is unavailable', () => {
    render(<ActualBuildParameters ranges={[]} warnings={[]} actualDataUnavailable />)
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText(/ACTUAL data unavailable/i)).toBeDefined()
  })

  it('the unavailable alert is not the disagreement summary', () => {
    render(<ActualBuildParameters ranges={[]} warnings={[]} actualDataUnavailable />)
    expect(screen.queryByText(/disagreeing ranges/i)).toBeNull()
  })
})
