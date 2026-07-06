import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { Separator } from '../ui/separator'
import { findUnsupportedGroupId } from '../../lib/groupValidation'
import type { DistributionSection } from './useDistributionSection'
import { useDistributionOverrides, type DistributionMarkerPath } from './useDistributionOverrides'
import { DistributionPerRange } from './DistributionPerRange'
import { coalescePerRangeOverrides, type PerRangeGroup } from './perRangeGrouping'
import { OverrideRowEditor } from './OverrideRowEditor'
import type { FieldOverride } from '../../lib/types'

interface DistributionTabProps {
  section: DistributionSection
  canEdit: boolean
  /** Supported groupId prefixes (CRS rule #10); empty ⇒ the prefix check is skipped. */
  supportedGroups?: readonly string[]
}

/** Distribution tab — presentational. Base state + slice live in
 *  `useDistributionSection`; per-range marker variants live in the shared
 *  override draft via `useDistributionOverrides` (issue #146). */
export function DistributionTab({ section, canEdit, supportedGroups = [] }: DistributionTabProps) {
  const {
    state,
    addMaven, updateMaven, removeMaven,
    addFileUrl, updateFileUrl, removeFileUrl,
    addPackage, updatePackage, removePackage,
    addSecurityGroup, updateSecurityGroup, removeSecurityGroup,
  } = section
  const { maven, fileUrl, packages, securityGroups } = state

  // Per-range distribution overrides (the four marker paths). All add/edit/delete
  // queue into the same page-level draft the combined Save flushes.
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
      {/* Explicit / External classification toggles moved to the General tab's
          Classification section (editor UI-reorg); their state still lives in
          this section's useDistributionSection. */}

      {/* ── Maven Artifacts ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="distribution.mavenArtifacts" fallback="Maven Artifacts" /></h3>
            <FieldInfo path="distribution.mavenArtifacts" label="Maven Artifacts" />
            {rangeCountBadge('distribution.maven')}
          </div>
          <Button variant="ghost" size="sm" onClick={addMaven} disabled={!canEdit}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {maven.map((row, i) => (
          <div key={i} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Artifact {i + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => removeMaven(i)} disabled={!canEdit} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.maven.groupPattern" fallback="groupId" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.maven.groupPattern" label="groupId" />
                </div>
                <Input required value={row.groupPattern} onChange={(e) => updateMaven(i, 'groupPattern', e.target.value)} placeholder="org.example.alpha" className="font-mono text-xs" />
                {(() => {
                  const bad = row.groupPattern.trim()
                    ? findUnsupportedGroupId(row.groupPattern, supportedGroups)
                    : undefined
                  return bad ? (
                    <p className="text-xs text-destructive">
                      Group ID "{bad}" must start with a supported prefix ({supportedGroups.join(', ')})
                    </p>
                  ) : null
                })()}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.maven.artifactPattern" fallback="artifactId" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.maven.artifactPattern" label="artifactId" />
                </div>
                <Input required value={row.artifactPattern} onChange={(e) => updateMaven(i, 'artifactPattern', e.target.value)} placeholder="my-component" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.maven.extension" fallback="Extension" /></Label>
                  <FieldInfo path="distribution.maven.extension" label="Extension" />
                </div>
                <Input value={row.extension} onChange={(e) => updateMaven(i, 'extension', e.target.value)} placeholder="jar" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.maven.classifier" fallback="Classifier" /></Label>
                  <FieldInfo path="distribution.maven.classifier" label="Classifier" />
                </div>
                <Input value={row.classifier} onChange={(e) => updateMaven(i, 'classifier', e.target.value)} placeholder="sources" className="font-mono text-xs" />
              </div>
            </div>
          </div>
        ))}

        {maven.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No Maven artifacts.</div>
        )}

        {perRangeBlock('distribution.maven')}
      </div>

      <Separator />

      {/* ── File URL Artifacts ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="distribution.fileUrlArtifacts" fallback="File URL Artifacts" /></h3>
            <FieldInfo path="distribution.fileUrlArtifacts" label="File URL Artifacts" />
            {rangeCountBadge('distribution.fileUrl')}
          </div>
          <Button variant="ghost" size="sm" onClick={addFileUrl} disabled={!canEdit}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {fileUrl.map((row, i) => (
          <div key={i} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Artifact {i + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => removeFileUrl(i)} disabled={!canEdit} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.fileUrl.url" fallback="URL" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.fileUrl.url" label="URL" />
                </div>
                <Input required value={row.url} onChange={(e) => updateFileUrl(i, 'url', e.target.value)} placeholder="https://artifacts.example.com/..." className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.fileUrl.artifactId" fallback="Artifact ID" /></Label>
                  <FieldInfo path="distribution.fileUrl.artifactId" label="Artifact ID" />
                </div>
                <Input value={row.artifactId} onChange={(e) => updateFileUrl(i, 'artifactId', e.target.value)} placeholder="my-artifact" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.fileUrl.classifier" fallback="Classifier" /></Label>
                  <FieldInfo path="distribution.fileUrl.classifier" label="Classifier" />
                </div>
                <Input value={row.classifier} onChange={(e) => updateFileUrl(i, 'classifier', e.target.value)} placeholder="sources" className="font-mono text-xs" />
              </div>
            </div>
          </div>
        ))}

        {fileUrl.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No file URL artifacts.</div>
        )}

        {perRangeBlock('distribution.fileUrl')}
      </div>

      <Separator />

      {/* ── Packages ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="distribution.packages" fallback="Packages" /></h3>
            <FieldInfo path="distribution.packages" label="Packages" />
            {rangeCountBadge('distribution.packages')}
          </div>
          <Button variant="ghost" size="sm" onClick={addPackage} disabled={!canEdit}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {packages.map((row, i) => (
          <div key={i} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Package {i + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => removePackage(i)} disabled={!canEdit} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.package.type" fallback="Package Type" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.package.type" label="Package Type" />
                </div>
                <Input required value={row.packageType} onChange={(e) => updatePackage(i, 'packageType', e.target.value)} placeholder="rpm" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.package.name" fallback="Package Name" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.package.name" label="Package Name" />
                </div>
                <Input required value={row.packageName} onChange={(e) => updatePackage(i, 'packageName', e.target.value)} placeholder="my-package" className="font-mono text-xs" />
              </div>
            </div>
          </div>
        ))}

        {packages.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No packages.</div>
        )}

        {perRangeBlock('distribution.packages')}
      </div>

      <Separator />

      {/* ── Security Groups ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="distribution.securityGroups" fallback="Security Groups" /></h3>
            <FieldInfo path="distribution.securityGroups" label="Security Groups" />
          </div>
          <Button variant="ghost" size="sm" onClick={addSecurityGroup} disabled={!canEdit}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {securityGroups.map((row, i) => (
          <div key={i} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Group {i + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => removeSecurityGroup(i)} disabled={!canEdit} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.securityGroup.type" fallback="Group Type" /></Label>
                  <FieldInfo path="distribution.securityGroup.type" label="Group Type" />
                </div>
                <Input value={row.groupType} onChange={(e) => updateSecurityGroup(i, 'groupType', e.target.value)} placeholder="read" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="distribution.securityGroup.name" fallback="Group Name" /> <span className="text-destructive">*</span></Label>
                  <FieldInfo path="distribution.securityGroup.name" label="Group Name" />
                </div>
                <Input required value={row.groupName} onChange={(e) => updateSecurityGroup(i, 'groupName', e.target.value)} placeholder="my-security-group" />
              </div>
            </div>
          </div>
        ))}

        {securityGroups.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No security groups.</div>
        )}
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
