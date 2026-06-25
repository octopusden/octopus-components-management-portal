import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { OverridesTimeline } from './OverridesTimeline'
import type { FieldOverride } from '../../lib/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 0
function ov(overrides: Partial<FieldOverride> = {}): FieldOverride {
  return {
    id: `fo-${nextId++}`,
    overriddenAttribute: 'build.javaVersion',
    versionRange: '[1.0,2.0)',
    rowType: 'SCALAR_OVERRIDE',
    value: 'x',
    markerChildren: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

// A rendered bar exposes its computed geometry as data-* attributes (percent of
// the axis width) so positioning can be asserted without reading inline styles.
function barGeometry(bar: HTMLElement): { left: number; right: number } {
  return {
    left: Number(bar.getAttribute('data-left-pct')),
    right: Number(bar.getAttribute('data-right-pct')),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OverridesTimeline', () => {
  describe('empty state', () => {
    it('renders nothing when there are no overrides', () => {
      const { container } = render(<OverridesTimeline overrides={[]} />)
      expect(container.firstChild).toBeNull()
    })
  })

  describe('axis domain', () => {
    it('spans the min and max finite bounds across all overrides', () => {
      render(
        <OverridesTimeline
          overrides={[
            ov({ overriddenAttribute: 'a', versionRange: '[1.0,3.0)' }),
            ov({ overriddenAttribute: 'b', versionRange: '[2.0,8.0)' }),
          ]}
        />,
      )
      const axis = screen.getByTestId('timeline-axis')
      expect(within(axis).getByTestId('axis-min').textContent).toBe('1.0')
      expect(within(axis).getByTestId('axis-max').textContent).toBe('8.0')
    })

    it('renders a midpoint tick between min and max', () => {
      render(
        <OverridesTimeline
          overrides={[ov({ versionRange: '[2.0,4.0)' })]}
        />,
      )
      const axis = screen.getByTestId('timeline-axis')
      expect(within(axis).getByTestId('axis-mid')).toBeDefined()
    })
  })

  describe('bar positioning', () => {
    it('positions a closed range proportionally within the axis domain', () => {
      // Domain is [0, 10]; bar [2,4] sits at 20%..40%.
      render(
        <OverridesTimeline
          overrides={[
            ov({ overriddenAttribute: 'a', versionRange: '[0.0,10.0)' }),
            ov({ id: 'bar', overriddenAttribute: 'b', versionRange: '[2.0,4.0)' }),
          ]}
        />,
      )
      const bar = screen.getByTestId('bar-bar')
      const { left, right } = barGeometry(bar)
      expect(left).toBeCloseTo(20, 1)
      expect(right).toBeCloseTo(40, 1)
    })

    it('extends an open upper bound to the axis max (right edge = 100%)', () => {
      render(
        <OverridesTimeline
          overrides={[
            ov({ overriddenAttribute: 'a', versionRange: '[0.0,10.0)' }),
            ov({ id: 'bar', overriddenAttribute: 'b', versionRange: '[5.0,)' }),
          ]}
        />,
      )
      const bar = screen.getByTestId('bar-bar')
      const { left, right } = barGeometry(bar)
      expect(left).toBeCloseTo(50, 1)
      expect(right).toBeCloseTo(100, 1)
    })

    it('starts an open lower bound at the axis min (left edge = 0%)', () => {
      render(
        <OverridesTimeline
          overrides={[
            ov({ overriddenAttribute: 'a', versionRange: '[0.0,10.0)' }),
            ov({ id: 'bar', overriddenAttribute: 'b', versionRange: '(,5.0]' }),
          ]}
        />,
      )
      const bar = screen.getByTestId('bar-bar')
      const { left, right } = barGeometry(bar)
      expect(left).toBeCloseTo(0, 1)
      expect(right).toBeCloseTo(50, 1)
    })

    it('spans the full axis for an unbounded range (0%..100%)', () => {
      render(
        <OverridesTimeline
          overrides={[
            ov({ overriddenAttribute: 'a', versionRange: '[0.0,10.0)' }),
            ov({ id: 'bar', overriddenAttribute: 'b', versionRange: '(,)' }),
          ]}
        />,
      )
      const bar = screen.getByTestId('bar-bar')
      const { left, right } = barGeometry(bar)
      expect(left).toBeCloseTo(0, 1)
      expect(right).toBeCloseTo(100, 1)
    })
  })

  describe('layout', () => {
    it('renders one row per attribute that has overrides', () => {
      render(
        <OverridesTimeline
          overrides={[
            ov({ overriddenAttribute: 'build.javaVersion', versionRange: '[1.0,2.0)' }),
            ov({ overriddenAttribute: 'build.javaVersion', versionRange: '[3.0,4.0)' }),
            ov({ overriddenAttribute: 'distribution.maven', versionRange: '[1.0,5.0)' }),
          ]}
        />,
      )
      expect(screen.getAllByTestId('timeline-row')).toHaveLength(2)
      expect(screen.getByText('build.javaVersion')).toBeDefined()
      expect(screen.getByText('distribution.maven')).toBeDefined()
    })

    it('renders a single attribute row with multiple bars', () => {
      render(
        <OverridesTimeline
          overrides={[
            ov({ overriddenAttribute: 'a', versionRange: '[1.0,2.0)' }),
            ov({ overriddenAttribute: 'a', versionRange: '[3.0,4.0)' }),
          ]}
        />,
      )
      const rows = screen.getAllByTestId('timeline-row')
      expect(rows).toHaveLength(1)
      expect(within(rows[0]!).getAllByTestId(/^bar-/)).toHaveLength(2)
    })
  })

  describe('overlap detection on the same attribute', () => {
    it('flags overlapping bars as destructive and shows the disjoint banner', () => {
      render(
        <OverridesTimeline
          overrides={[
            ov({ id: 'fo-x', overriddenAttribute: 'a', versionRange: '[1.0,4.0)' }),
            ov({ id: 'fo-y', overriddenAttribute: 'a', versionRange: '[3.0,6.0)' }),
          ]}
        />,
      )
      expect(screen.getByText(/must be disjoint/i)).toBeDefined()
      expect(screen.getByTestId('bar-fo-x').getAttribute('data-conflict')).toBe('true')
      expect(screen.getByTestId('bar-fo-y').getAttribute('data-conflict')).toBe('true')
    })

    it('does NOT flag disjoint ranges on the same attribute', () => {
      render(
        <OverridesTimeline
          overrides={[
            ov({ id: 'fo-x', overriddenAttribute: 'a', versionRange: '[1.0,2.0)' }),
            ov({ id: 'fo-y', overriddenAttribute: 'a', versionRange: '[3.0,4.0)' }),
          ]}
        />,
      )
      expect(screen.queryByText(/must be disjoint/i)).toBeNull()
      expect(screen.getByTestId('bar-fo-x').getAttribute('data-conflict')).toBe('false')
      expect(screen.getByTestId('bar-fo-y').getAttribute('data-conflict')).toBe('false')
    })

    it('does NOT treat identical ranges on DIFFERENT attributes as a conflict', () => {
      render(
        <OverridesTimeline
          overrides={[
            ov({ id: 'fo-x', overriddenAttribute: 'a', versionRange: '[1.0,4.0)' }),
            ov({ id: 'fo-y', overriddenAttribute: 'b', versionRange: '[1.0,4.0)' }),
          ]}
        />,
      )
      expect(screen.queryByText(/must be disjoint/i)).toBeNull()
      expect(screen.getByTestId('bar-fo-x').getAttribute('data-conflict')).toBe('false')
      expect(screen.getByTestId('bar-fo-y').getAttribute('data-conflict')).toBe('false')
    })

    it('treats an unparseable (composite) overlap as unknown — no false conflict, no banner', () => {
      // [1,3),[5,7) is a composite range; rangesOverlap can't decide, returns
      // 'unknown'. The pair must NOT be flagged.
      render(
        <OverridesTimeline
          overrides={[
            ov({ id: 'fo-x', overriddenAttribute: 'a', versionRange: '[1.0,3.0),[5.0,7.0)' }),
            ov({ id: 'fo-y', overriddenAttribute: 'a', versionRange: '[2.0,6.0)' }),
          ]}
        />,
      )
      expect(screen.queryByText(/must be disjoint/i)).toBeNull()
      expect(screen.getByTestId('bar-fo-x').getAttribute('data-conflict')).toBe('false')
      expect(screen.getByTestId('bar-fo-y').getAttribute('data-conflict')).toBe('false')
    })
  })

  describe('coverage gaps', () => {
    it('renders a hatched gap track behind each attribute row', () => {
      render(
        <OverridesTimeline
          overrides={[
            ov({ overriddenAttribute: 'a', versionRange: '[1.0,2.0)' }),
            ov({ overriddenAttribute: 'a', versionRange: '[8.0,9.0)' }),
          ]}
        />,
      )
      const rows = screen.getAllByTestId('timeline-row')
      expect(within(rows[0]!).getByTestId('gap-track')).toBeDefined()
    })
  })
})
