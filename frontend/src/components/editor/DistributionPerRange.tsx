import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { formatVersionRange } from '../../lib/versionRange'
import type { FieldOverride } from '../../lib/types'

/** One-line human summary of a distribution marker override's children —
 *  mirrors FieldOverrides' `markerSummary` for the four distribution paths. */
function summarize(o: FieldOverride): string {
  const mc = o.markerChildren
  if (!mc) return ''
  const join = (xs: Array<string | null | undefined>) => xs.filter((x): x is string => !!x).join(', ')
  if (mc.mavenArtifacts?.length) return join(mc.mavenArtifacts.map((a) => `${a.groupPattern}:${a.artifactPattern}`))
  if (mc.dockerImages?.length) return join(mc.dockerImages.map((d) => (d.flavor ? `${d.imageName}:${d.flavor}` : d.imageName)))
  if (mc.fileUrlArtifacts?.length) return join(mc.fileUrlArtifacts.map((a) => a.url))
  if (mc.packages?.length) return join(mc.packages.map((p) => `${p.packageType} ${p.packageName}`))
  return ''
}

export interface DistributionPerRangeProps {
  overrides: FieldOverride[]
  canEdit: boolean
  onAdd: () => void
  onEdit: (o: FieldOverride) => void
  onDelete: (id: string) => void
}

/**
 * Per-range variants block shown under a Distribution subsection (issue #146).
 * Lists the effective per-range overrides for one `distribution.*` marker path
 * and offers add/edit/delete — all of which queue into the shared override
 * draft so they ride the editor's one combined Save.
 */
export function DistributionPerRange({ overrides, canEdit, onAdd, onEdit, onDelete }: DistributionPerRangeProps) {
  return (
    <div className="rounded-md border border-dashed p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Per-range variants{overrides.length > 0 ? ` (${overrides.length})` : ''}
        </span>
        <Button variant="ghost" size="sm" type="button" onClick={onAdd} disabled={!canEdit} className="h-7">
          <Plus className="h-3 w-3" />
          Add per-range variant
        </Button>
      </div>
      {overrides.map((o) => {
        const summary = summarize(o)
        return (
          <div key={o.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
            <div className="min-w-0">
              <span className="font-mono text-xs">{formatVersionRange(o.versionRange)}</span>
              {summary && <span className="ml-2 truncate text-xs text-muted-foreground">{summary}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                aria-label={`Edit per-range variant ${o.versionRange}`}
                onClick={() => onEdit(o)}
                disabled={!canEdit}
                className="h-7"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                aria-label={`Delete per-range variant ${o.versionRange}`}
                onClick={() => onDelete(o.id)}
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
