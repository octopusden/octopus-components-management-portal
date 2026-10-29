import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DistributionPerRange } from './DistributionPerRange'
import type { FieldOverride } from '../../lib/types'

function maven(range: string, artifact: string): FieldOverride {
  return {
    id: `m${range}`, overriddenAttribute: 'distribution.maven', versionRange: range, rowType: 'MARKER', value: null,
    markerChildren: { mavenArtifacts: [{ groupPattern: 'g', artifactPattern: artifact }] }, createdAt: null, updatedAt: null,
  }
}

// [1.0,2.0) + [2.0,3.0) + [3.0,4.0) share a value → one coalesced row; [5.0,6.0) stands alone.
const OVERRIDES = [maven('[1.0,2.0)', 'a'), maven('[2.0,3.0)', 'a'), maven('[3.0,4.0)', 'a'), maven('[5.0,6.0)', 'b')]

function renderList(activeRange?: string) {
  const noop = () => {}
  return render(
    <DistributionPerRange overrides={OVERRIDES} canEdit onAdd={noop} onEdit={noop} onDelete={noop} activeRange={activeRange} />,
  )
}
const marked = () => screen.getAllByTestId('dist-per-range-row').filter((r) => within(r).queryByText('In effect'))

describe('DistributionPerRange — winning row', () => {
  it('marks only the row holding the winning override', () => {
    renderList('[5.0,6.0)')
    expect(marked()).toHaveLength(1)
    expect(marked()[0]!.textContent).toContain('[5.0,6.0)')
  })

  it('marks a coalesced row when an interior member wins', () => {
    renderList('[2.0,3.0)')
    expect(marked()).toHaveLength(1)
    expect(marked()[0]!.textContent).toContain('g:a')
  })

  it('marks nothing without a single winning range (conflict, base, or no preview)', () => {
    renderList(undefined)
    expect(marked()).toHaveLength(0)
  })

  it('clears the mark when the preview clears', () => {
    const { rerender } = renderList('[5.0,6.0)')
    const noop = () => {}
    rerender(<DistributionPerRange overrides={OVERRIDES} canEdit onAdd={noop} onEdit={noop} onDelete={noop} />)
    expect(marked()).toHaveLength(0)
  })
})
