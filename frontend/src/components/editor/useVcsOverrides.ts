import { useMemo } from 'react'
import type { FieldOverride } from '../../lib/types'
import { compareVersionRanges } from '../../lib/versionRange'
import { useOverridesDraft } from './overridesDraft'

/**
 * The single `vcs.settings` marker attribute CRS supports per-range: a per-range
 * override replaces the component's VCS entry list (name / path / branch / tag /
 * hotfix branch) for the versions it covers. This is the collection-field analog
 * of the four `distribution.*` marker paths (see useDistributionOverrides).
 */
export const VCS_MARKER_PATH = 'vcs.settings'

export interface VcsOverrides {
  /** Effective (draft-applied) per-range VCS overrides, sorted by range. */
  overrides: FieldOverride[]
  /** Queue an override removal into the shared draft (rides the combined Save). */
  queueDelete: (id: string) => void
}

/**
 * Thin sibling to `useVcsSection`: projects the page-level override draft down to
 * the `vcs.settings` marker path so the VCS tab can surface / add / edit / delete
 * per-range VCS overrides without leaving the tab (parity with the Distribution
 * tab). All mutations queue into the same `OverridesDraft` the combined Save
 * flushes, so no separate save plumbing is involved.
 */
export function useVcsOverrides(): VcsOverrides {
  const { effectiveOverrides, queueDelete } = useOverridesDraft()

  const overrides = useMemo(
    () =>
      effectiveOverrides
        .filter((o) => o.overriddenAttribute === VCS_MARKER_PATH)
        .sort((a, b) => compareVersionRanges(a.versionRange, b.versionRange)),
    [effectiveOverrides],
  )

  return { overrides, queueDelete }
}
