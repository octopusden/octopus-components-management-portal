import { useMemo } from 'react'
import type { FieldOverride } from '../../lib/types'
import { compareVersionRanges } from '../../lib/versionRange'
import { useOverridesDraft } from './overridesDraft'

/**
 * The four `distribution.*` marker attributes CRS supports per-range (issue #146).
 * `distribution.explicit` / `.external` / `.securityGroups.read` are per-component
 * only (CRS #387) and are deliberately absent here.
 */
export const DISTRIBUTION_MARKER_PATHS = [
  'distribution.maven',
  'distribution.fileUrl',
  'distribution.docker',
  'distribution.packages',
] as const

export type DistributionMarkerPath = (typeof DISTRIBUTION_MARKER_PATHS)[number]

const DISTRIBUTION_MARKER_SET = new Set<string>(DISTRIBUTION_MARKER_PATHS)

export interface DistributionOverrides {
  /** Effective (draft-applied) per-range overrides, grouped and sorted by range. */
  byPath: Record<DistributionMarkerPath, FieldOverride[]>
  /** Count across all four distribution marker paths. */
  total: number
  /** Queue an override removal into the shared draft (rides the combined Save). */
  queueDelete: (id: string) => void
}

/**
 * Thin sibling to `useDistributionSection`: projects the page-level override
 * draft down to the four per-range `distribution.*` marker paths so the
 * Distribution tab can surface / add / edit / delete per-range variants without
 * leaving the tab. All mutations queue into the same `OverridesDraft` the
 * combined Save flushes, so no separate save plumbing is involved.
 */
export function useDistributionOverrides(): DistributionOverrides {
  const { effectiveOverrides, queueDelete } = useOverridesDraft()

  const byPath = useMemo(() => {
    const m: Record<DistributionMarkerPath, FieldOverride[]> = {
      'distribution.maven': [],
      'distribution.fileUrl': [],
      'distribution.docker': [],
      'distribution.packages': [],
    }
    for (const o of effectiveOverrides) {
      if (DISTRIBUTION_MARKER_SET.has(o.overriddenAttribute)) {
        m[o.overriddenAttribute as DistributionMarkerPath].push(o)
      }
    }
    for (const path of DISTRIBUTION_MARKER_PATHS) {
      m[path].sort((a, b) => compareVersionRanges(a.versionRange, b.versionRange))
    }
    return m
  }, [effectiveOverrides])

  const total = useMemo(
    () => DISTRIBUTION_MARKER_PATHS.reduce((n, p) => n + byPath[p].length, 0),
    [byPath],
  )

  return { byPath, total, queueDelete }
}
