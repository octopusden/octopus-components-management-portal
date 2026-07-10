import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { formatVersionRange } from '../../lib/versionRange'
import { coalescePerRangeOverrides, type PerRangeGroup } from './perRangeGrouping'
import type { FieldOverride } from '../../lib/types'

/** One-line human summary of a `vcs.settings` override's replacement entries —
 *  the tag / branch each entry pins, which is what a per-range VCS override
 *  typically changes (e.g. an escrow tag for a single version). */
function summarize(o: FieldOverride): string {
  const entries = o.markerChildren?.vcsEntries
  if (!entries?.length) return ''
  return entries
    .map((e) => {
      const bits = [e.tag, e.branch].filter((x): x is string => !!x)
      const label = bits.join(' · ')
      return e.name ? (label ? `${e.name}: ${label}` : e.name) : label
    })
    .filter((s) => s !== '')
    .join(', ')
}

export interface VcsPerRangeProps {
  overrides: FieldOverride[]
  canEdit: boolean
  onAdd: () => void
  /** Edit a coalesced group (a run of contiguous same-value overrides shown as
   *  one row). A single-member group edits that one override; a multi-member
   *  group edits the merged range and collapses on save. */
  onEdit: (group: PerRangeGroup) => void
  /** Delete every override in the coalesced group. */
  onDelete: (group: PerRangeGroup) => void
}

/**
 * Per-range VCS overrides block shown under the VCS Entries section. Lists the
 * effective per-range `vcs.settings` overrides, coalescing contiguous same-value
 * ones into a single row (parity with the Distribution tab), and offers
 * add/edit/delete — all of which queue into the shared override draft so they
 * ride the editor's one combined Save. This surfaces per-version VCS overrides
 * (e.g. a `[1.0.49]` escrow tag) that previously only appeared on the
 * Configurations tab.
 */
export function VcsPerRange({ overrides, canEdit, onAdd, onEdit, onDelete }: VcsPerRangeProps) {
  const groups = coalescePerRangeOverrides(overrides)
  return (
    <div className="rounded-md border border-dashed p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Per-range overrides{groups.length > 0 ? ` (${groups.length})` : ''}
        </span>
        <Button variant="ghost" size="sm" type="button" onClick={onAdd} disabled={!canEdit} className="h-7">
          <Plus className="h-3 w-3" />
          Add override
        </Button>
      </div>
      {groups.map((group) => {
        const summary = summarize(group.representative)
        return (
          <div key={group.members.map((m) => m.id).join('|')} data-testid="vcs-per-range-row" className="flex items-center justify-between gap-2 rounded border px-2 py-1">
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="shrink-0 font-mono text-xs">{formatVersionRange(group.displayRange)}</span>
              {summary ? (
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={summary}>
                  {summary}
                </span>
              ) : (
                // No VCS entries for this range — the override replaces the base
                // list with nothing. Spell it out so the row isn't a bare range.
                <span className="min-w-0 flex-1 truncate text-xs italic text-muted-foreground">
                  Not specified
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                aria-label={`Edit override ${group.displayRange}`}
                onClick={() => onEdit(group)}
                disabled={!canEdit}
                className="h-7"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                aria-label={`Delete override ${group.displayRange}`}
                onClick={() => onDelete(group)}
                disabled={!canEdit}
                className="h-7 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
