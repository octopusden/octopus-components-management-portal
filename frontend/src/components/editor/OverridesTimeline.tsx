import { useMemo } from 'react'
import { cn } from '../../lib/utils'
import { StatusBanner } from '../ui/status-banner'
import { formatVersionRange, rangesOverlap } from '../../lib/versionRange'
import type { FieldOverride } from '../../lib/types'

interface OverridesTimelineProps {
  overrides: FieldOverride[]
}

// ─── Positioning math ────────────────────────────────────────────────────────
//
// This component only needs to PLACE bars on a shared version axis; the
// authoritative range/overlap semantics live in `versionRange.ts` and are
// reused for conflict detection below. For positioning we extract each range's
// finite numeric extent (lowest lower bound, highest upper bound). Open bounds
// are `null` and clamp to the axis edge at render time. Composite ranges
// (`[1,3),[5,7)`) are treated as their min..max envelope — good enough for a
// rough visual, while overlap flagging defers to `rangesOverlap` (which returns
// 'unknown' for composites and so never produces a false conflict).

interface FiniteExtent {
  lo: number | null
  hi: number | null
}

// Each dot-segment occupies a fixed-width slot so minor/patch segments sort
// after the major segment (1.10 after 1.9) without spilling into the next
// higher segment. The slot is wide enough for build-counter segments
// (Maven build numbers routinely exceed 1000); positions are visual only —
// overlap detection uses versionRange.ts, not this approximation.
const SEGMENT_SLOT = 1e7

function dotNumericToNumber(s: string): number | null {
  const trimmed = s.trim()
  if (trimmed === '' || !/^\d+(\.\d+)*$/.test(trimmed)) return null
  const parts = trimmed.split('.').map((p) => Number.parseInt(p, 10))
  let value = parts[0] ?? 0
  let scale = 1
  for (let i = 1; i < parts.length; i++) {
    scale /= SEGMENT_SLOT
    value += (parts[i] ?? 0) * scale
  }
  return value
}

// Extract the min lower bound and max upper bound across every segment of a
// (possibly composite) range. `null` means unbounded on that side.
function finiteExtent(range: string): FiniteExtent {
  const compact = range.replace(/\s+/g, '')
  const segRe = /([[(])([^,\][()]*),([^,\][()]*)([\])])/g
  let lo: number | null = null
  let hi: number | null = null
  let loUnbounded = false
  let hiUnbounded = false
  let matched = false
  let m: RegExpExecArray | null
  while ((m = segRe.exec(compact)) !== null) {
    matched = true
    const loStr = m[2]!
    const hiStr = m[3]!
    if (loStr === '') {
      loUnbounded = true
    } else {
      const v = dotNumericToNumber(loStr)
      if (v !== null && (lo === null || v < lo)) lo = v
    }
    if (hiStr === '') {
      hiUnbounded = true
    } else {
      const v = dotNumericToNumber(hiStr)
      if (v !== null && (hi === null || v > hi)) hi = v
    }
  }
  if (!matched) return { lo: null, hi: null }
  return {
    lo: loUnbounded ? null : lo,
    hi: hiUnbounded ? null : hi,
  }
}

interface TimelineBar {
  override: FieldOverride
  leftPct: number
  rightPct: number
  conflict: boolean
}

interface TimelineRow {
  attribute: string
  bars: TimelineBar[]
}

interface TimelineModel {
  rows: TimelineRow[]
  domainMin: number
  domainMax: number
  hasConflict: boolean
}

function formatTick(value: number): string {
  // Keep one decimal so the axis reads like a version (1.0 … 8.0) rather than
  // a bare integer, matching the version-range notation used everywhere else.
  return Number.isInteger(value) ? `${value}.0` : String(Number(value.toFixed(3)))
}

function buildModel(overrides: FieldOverride[]): TimelineModel | null {
  if (overrides.length === 0) return null

  // Axis domain from finite bounds across all overrides.
  let domainMin = Number.POSITIVE_INFINITY
  let domainMax = Number.NEGATIVE_INFINITY
  for (const o of overrides) {
    const { lo, hi } = finiteExtent(o.versionRange)
    if (lo !== null) {
      domainMin = Math.min(domainMin, lo)
      domainMax = Math.max(domainMax, lo)
    }
    if (hi !== null) {
      domainMin = Math.min(domainMin, hi)
      domainMax = Math.max(domainMax, hi)
    }
  }
  // No finite bound anywhere (e.g. only `(,)`): fall back to a unit domain so
  // bars still render full-width.
  if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax)) {
    domainMin = 0
    domainMax = 1
  }
  if (domainMin === domainMax) {
    // Single point: widen slightly so bars are visible rather than zero-width.
    domainMax = domainMin + 1
  }
  const span = domainMax - domainMin

  const toPct = (value: number) => ((value - domainMin) / span) * 100

  // Group by attribute, preserving first-seen order.
  const byAttr = new Map<string, FieldOverride[]>()
  for (const o of overrides) {
    const list = byAttr.get(o.overriddenAttribute)
    if (list) list.push(o)
    else byAttr.set(o.overriddenAttribute, [o])
  }

  let hasConflict = false
  const rows: TimelineRow[] = []
  for (const [attribute, group] of byAttr) {
    // Overlap detection within the attribute, reusing versionRange semantics.
    // 'unknown' (composite/qualifier) pairs are NOT flagged — defer to server.
    const conflicting = new Set<string>()
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (rangesOverlap(group[i]!.versionRange, group[j]!.versionRange) === true) {
          conflicting.add(group[i]!.id)
          conflicting.add(group[j]!.id)
        }
      }
    }
    if (conflicting.size > 0) hasConflict = true

    const bars: TimelineBar[] = group.map((o) => {
      const { lo, hi } = finiteExtent(o.versionRange)
      const leftPct = lo === null ? 0 : toPct(lo)
      const rightPct = hi === null ? 100 : toPct(hi)
      return {
        override: o,
        leftPct,
        rightPct,
        conflict: conflicting.has(o.id),
      }
    })
    rows.push({ attribute, bars })
  }

  return { rows, domainMin, domainMax, hasConflict }
}

/**
 * Read-only version timeline shown ABOVE the overrides table. One horizontal
 * track per attribute, each override drawn as a bar placed by its parsed
 * version range along a shared axis. Overlapping overrides on the same
 * attribute (the disjoint-only rule) are rendered destructive with a warning
 * banner — the visual companion to the server-side disjoint validation.
 *
 * Pure presentational: driven entirely by the `overrides` array already loaded
 * by FieldOverrides; no data fetching of its own.
 */
export function OverridesTimeline({ overrides }: OverridesTimelineProps) {
  const model = useMemo(() => buildModel(overrides), [overrides])
  if (!model) return null

  const midValue = (model.domainMin + model.domainMax) / 2

  return (
    <div className="space-y-3" data-testid="overrides-timeline">
      {model.hasConflict && (
        <StatusBanner variant="destructive" role="alert">
          Overrides on one attribute must be disjoint
        </StatusBanner>
      )}

      <div className="rounded-md border p-3">
        {/* Version axis */}
        <div
          data-testid="timeline-axis"
          className="ml-[8.5rem] flex justify-between text-xs text-muted-foreground"
        >
          <span data-testid="axis-min">{formatTick(model.domainMin)}</span>
          <span data-testid="axis-mid">{formatTick(midValue)}</span>
          <span data-testid="axis-max">{formatTick(model.domainMax)}</span>
        </div>

        <div className="mt-2 space-y-2">
          {model.rows.map((row) => (
            <div
              key={row.attribute}
              data-testid="timeline-row"
              className="flex items-center gap-2"
            >
              <div
                className="w-32 shrink-0 truncate font-mono text-xs text-muted-foreground"
                title={row.attribute}
              >
                {row.attribute}
              </div>
              {/* Track: hatched gap background, bars positioned on top */}
              <div className="relative h-6 flex-1 rounded bg-muted/30">
                <div
                  data-testid="gap-track"
                  aria-hidden="true"
                  className="absolute inset-0 rounded opacity-40 [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,var(--color-border)_4px,var(--color-border)_5px)]"
                />
                {row.bars.map((bar) => (
                  <div
                    key={bar.override.id}
                    data-testid={`bar-${bar.override.id}`}
                    data-left-pct={bar.leftPct}
                    data-right-pct={bar.rightPct}
                    data-conflict={bar.conflict}
                    title={`${row.attribute} ${formatVersionRange(bar.override.versionRange)}`}
                    className={cn(
                      'absolute top-1 bottom-1 rounded border text-[10px] leading-none',
                      bar.conflict
                        ? 'border-destructive bg-destructive/80 text-destructive-foreground'
                        : 'border-primary/40 bg-primary/70 text-primary-foreground',
                    )}
                    style={{
                      left: `${bar.leftPct}%`,
                      width: `${Math.max(bar.rightPct - bar.leftPct, 0.5)}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
