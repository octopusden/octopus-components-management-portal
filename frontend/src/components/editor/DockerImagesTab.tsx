import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import type { DistributionSection } from './useDistributionSection'
import { useDistributionOverrides, type DistributionMarkerPath } from './useDistributionOverrides'
import { DistributionPerRange } from './DistributionPerRange'
import { coalescePerRangeOverrides, type PerRangeGroup } from './perRangeGrouping'
import { OverrideRowEditor } from './OverrideRowEditor'
import type { FieldOverride } from '../../lib/types'

interface DockerImagesTabProps {
  section: DistributionSection
  canEdit: boolean
}

/** Docker Images tab — presentational. Split out of the Distribution tab
 *  (editor UI-reorg C5) but sharing the same slice (`useDistributionSection`)
 *  and per-range override draft (`useDistributionOverrides`, issue #146). */
export function DockerImagesTab({ section, canEdit }: DockerImagesTabProps) {
  const { state, addDocker, updateDocker, removeDocker } = section
  const { docker } = state

  // Per-range docker overrides ride the same page-level draft the combined Save
  // flushes; only the `distribution.docker` marker path is relevant here.
  const distOverrides = useDistributionOverrides()
  const [editor, setEditor] = useState<{ path: DistributionMarkerPath; override?: FieldOverride; collapseMemberIds?: string[] } | null>(null)
  const openCreate = (path: DistributionMarkerPath) => setEditor({ path })
  // A coalesced group edits as one override: a lone member edits itself; a
  // multi-member group edits the merged range and collapses its extras on save.
  const openEditGroup = (group: PerRangeGroup) => {
    const path = group.representative.overriddenAttribute as DistributionMarkerPath
    if (group.members.length === 1) {
      setEditor({ path, override: group.members[0] })
    } else {
      setEditor({
        path,
        override: { ...group.representative, versionRange: group.displayRange },
        collapseMemberIds: group.members.slice(1).map((m) => m.id),
      })
    }
  }
  const deleteGroup = (group: PerRangeGroup) => group.members.forEach((m) => distOverrides.queueDelete(m.id))

  const rangeCountBadge = (path: DistributionMarkerPath) => {
    const count = coalescePerRangeOverrides(distOverrides.byPath[path]).length
    return count > 0 ? (
      <Badge variant="secondary" className="ml-1 text-[10px]">{count} per-range</Badge>
    ) : null
  }

  const perRangeBlock = (path: DistributionMarkerPath) => (
    <DistributionPerRange
      overrides={distOverrides.byPath[path]}
      canEdit={canEdit}
      onAdd={() => openCreate(path)}
      onEdit={openEditGroup}
      onDelete={deleteGroup}
    />
  )

  return (
    <div className="space-y-6">
      {/* ── Docker Images ──────────────────────────────────────────────────── */}
      <div className="space-y-3" data-testid="docker-images-section">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="distribution.dockerImages" fallback="Docker Images" /></h3>
            <FieldInfo path="distribution.dockerImages" label="Docker Images" />
            {rangeCountBadge('distribution.docker')}
          </div>
          <Button variant="ghost" size="sm" onClick={addDocker} disabled={!canEdit}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {docker.map((row, i) => (
          <div key={i} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Image {i + 1}</span>
              <Button variant="ghost" size="sm" aria-label={`Remove image ${i + 1}`} onClick={() => removeDocker(i)} disabled={!canEdit} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" aria-hidden />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.docker.imageName" fallback="Image Name" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.docker.imageName" label="Image Name" />
                </div>
                <Input required value={row.imageName} onChange={(e) => updateDocker(i, 'imageName', e.target.value)} placeholder="my-org/my-image" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.docker.flavor" fallback="Flavor" /></Label>
                  <FieldInfo path="distribution.docker.flavor" label="Flavor" />
                </div>
                <Input value={row.flavor} onChange={(e) => updateDocker(i, 'flavor', e.target.value)} placeholder="alpine" className="font-mono text-xs" />
              </div>
            </div>
          </div>
        ))}

        {docker.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No Docker images.</div>
        )}

        {perRangeBlock('distribution.docker')}
      </div>

      <OverrideRowEditor
        open={editor !== null}
        mode={editor?.override ? 'edit' : 'create'}
        presetAttribute={editor && !editor.override ? editor.path : undefined}
        override={editor?.override}
        collapseMemberIds={editor?.collapseMemberIds}
        onOpenChange={(o) => { if (!o) setEditor(null) }}
      />
    </div>
  )
}
