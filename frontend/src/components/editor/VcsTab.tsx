import { useState } from 'react'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { Separator } from '../ui/separator'
import { isVcsHostSupported, hostOf } from '../../lib/vcsHost'
import { ExternalRegistrySelect } from './ExternalRegistrySelect'
import { useVcsOverrides, VCS_MARKER_PATH } from './useVcsOverrides'
import { VcsPerRange } from './VcsPerRange'
import { coalescePerRangeOverrides, type PerRangeGroup } from './perRangeGrouping'
import { OverrideRowEditor } from './OverrideRowEditor'
import type { FieldOverride } from '../../lib/types'
import type { VcsSection } from './useVcsSection'

interface VcsTabProps {
  section: VcsSection
  canEdit: boolean
  /** Ecosystem Bitbucket base URL (${bitbucket.host}); absent ⇒ host check skipped. */
  gitBaseUrl?: string | null
}

/** VCS tab — presentational. State + slice live in `useVcsSection` (page-owned);
 *  per-range VCS overrides live in the shared override draft via
 *  `useVcsOverrides` (parity with the Distribution tab). */
export function VcsTab({ section, canEdit, gitBaseUrl }: VcsTabProps) {
  const {
    externalRegistry,
    setExternalRegistry,
    showExternalRegistry,
    externalRegistryEditable,
    entries,
    updateEntry,
    addEntry,
    removeEntry,
  } = section
  const allowedHost = hostOf(gitBaseUrl)

  // Per-range VCS overrides (the `vcs.settings` marker). Add/edit/delete queue
  // into the same page-level draft the combined Save flushes.
  const vcsOverrides = useVcsOverrides()
  const [editor, setEditor] = useState<{ override?: FieldOverride; collapseMemberIds?: string[] } | null>(null)
  const openCreate = () => setEditor({})
  // A coalesced group edits as one override: a lone member edits itself; a
  // multi-member group edits the merged range and collapses its extras on save.
  const openEditGroup = (group: PerRangeGroup) => {
    if (group.members.length === 1) {
      setEditor({ override: group.members[0] })
    } else {
      setEditor({
        override: { ...group.representative, versionRange: group.displayRange },
        collapseMemberIds: group.members.slice(1).map((m) => m.id),
      })
    }
  }
  const deleteGroup = (group: PerRangeGroup) => group.members.forEach((m) => vcsOverrides.queueDelete(m.id))
  const perRangeCount = coalescePerRangeOverrides(vcsOverrides.overrides).length

  return (
    <div className="space-y-6">
      {/* External Registry — Whiskey-only (R10), admin-only editable. Hidden
          entirely for non-Whiskey components. */}
      {showExternalRegistry && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="vcs-externalRegistry"><FieldLabelText path="vcs.externalRegistry" fallback="External Registry" /></Label>
              <FieldInfo path="vcs.externalRegistry" label="External Registry" />
              {!externalRegistryEditable && (
                <Tooltip>
                  <TooltipTrigger className="cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      admin only
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs whitespace-normal leading-snug">
                    Only administrators (Edit Any Component) can change the External Registry.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <ExternalRegistrySelect
              id="vcs-externalRegistry"
              value={externalRegistry}
              onValueChange={setExternalRegistry}
              disabled={!canEdit || !externalRegistryEditable}
            />
          </div>
        </div>
      )}

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="vcs.entries" fallback="VCS Entries" /></h3>
            <FieldInfo path="vcs.entries" label="VCS Entries" />
            {perRangeCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">{perRangeCount} per-range</Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={addEntry} disabled={!canEdit}>
            <Plus className="h-4 w-4" />
            Add Entry
          </Button>
        </div>

        {entries.map((entry, index) => (
          <div key={index} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Entry {index + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => removeEntry(index)} disabled={!canEdit} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="vcs.name" fallback="Name" /></Label>
                  <FieldInfo path="vcs.name" label="Name" />
                </div>
                <Input value={entry.name} onChange={(e) => updateEntry(index, 'name', e.target.value)} placeholder="Entry name" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="vcs.vcsPath" fallback="VCS Path" /></Label>
                  <FieldInfo path="vcs.vcsPath" label="VCS Path" />
                </div>
                <Input value={entry.vcsPath} onChange={(e) => updateEntry(index, 'vcsPath', e.target.value)} placeholder="ssh://git@..." className="font-mono text-xs" />
                {entry.vcsPath.trim() && allowedHost && !isVcsHostSupported(entry.vcsPath, gitBaseUrl) && (
                  <p className="text-xs text-destructive">VCS host must be {allowedHost} (the ecosystem Bitbucket)</p>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="vcs.repositoryType" fallback="Repository Type" /></Label>
                  <FieldInfo path="vcs.repositoryType" label="Repository Type" />
                </div>
                {/* Read-only: repository type follows the VCS host. */}
                <Input value={entry.repositoryType} disabled readOnly className="bg-muted font-mono text-xs" placeholder="GIT" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="vcs.branch" fallback="Production branch" /></Label>
                  <FieldInfo path="vcs.branch" label="Production branch" />
                </div>
                <Input value={entry.branch} onChange={(e) => updateEntry(index, 'branch', e.target.value)} placeholder="Branch pattern" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="vcs.tag" fallback="Tag" /></Label>
                  <FieldInfo path="vcs.tag" label="Tag" />
                </div>
                <Input value={entry.tag} onChange={(e) => updateEntry(index, 'tag', e.target.value)} placeholder="Tag pattern" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs"><FieldLabelText path="vcs.hotfixBranch" fallback="Hotfix Branch" /></Label>
                  <FieldInfo path="vcs.hotfixBranch" label="Hotfix Branch" />
                </div>
                <Input value={entry.hotfixBranch} onChange={(e) => updateEntry(index, 'hotfixBranch', e.target.value)} placeholder="Hotfix branch pattern" className="font-mono text-xs" />
              </div>
            </div>
          </div>
        ))}

        {entries.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No VCS entries. Click "Add Entry" to create one.
          </div>
        )}

        {/* Per-range VCS overrides (`vcs.settings` markers) — e.g. a version-
            specific escrow tag. Replaces the base VCS entries for its range. */}
        <VcsPerRange
          overrides={vcsOverrides.overrides}
          canEdit={canEdit}
          onAdd={openCreate}
          onEdit={openEditGroup}
          onDelete={deleteGroup}
        />
      </div>

      <OverrideRowEditor
        open={editor !== null}
        mode={editor?.override ? 'edit' : 'create'}
        presetAttribute={editor && !editor.override ? VCS_MARKER_PATH : undefined}
        override={editor?.override}
        collapseMemberIds={editor?.collapseMemberIds}
        onOpenChange={(o) => { if (!o) setEditor(null) }}
      />
    </div>
  )
}
