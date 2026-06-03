import { useState, useEffect } from 'react'
import { Save, Plus, Trash2 } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Separator } from '../ui/separator'
import type { ComponentDetail, VcsEntry } from '../../lib/types'
import type { ComponentUpdateRequest } from '../../hooks/useComponent'
import type { UseMutationResult } from '@tanstack/react-query'
import { useOptimisticConflict } from '../../hooks/useOptimisticConflict'
import { selectBaseRow } from '../../lib/api/baseRow'
import { CANNOT_EDIT_TITLE } from './editPermission'

interface VcsTabProps {
  component: ComponentDetail
  updateMutation: UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
  canEdit: boolean
}

interface EntryState {
  id?: string | null
  name: string
  vcsPath: string
  repositoryType: string
  tag: string
  branch: string
  hotfixBranch: string
}

function toEntryState(e: VcsEntry): EntryState {
  return {
    id: e.id,
    name: e.name ?? '',
    vcsPath: e.vcsPath ?? '',
    repositoryType: e.repositoryType ?? '',
    tag: e.tag ?? '',
    branch: e.branch ?? '',
    hotfixBranch: e.hotfixBranch ?? '',
  }
}

export function VcsTab({ component, updateMutation, toast, canEdit }: VcsTabProps) {
  const handleConflict = useOptimisticConflict(component.id)
  const [externalRegistry, setExternalRegistry] = useState(component.vcsExternalRegistry ?? '')
  const [entries, setEntries] = useState<EntryState[]>(
    selectBaseRow(component)?.vcsEntries?.map(toEntryState) ?? [],
  )

  useEffect(() => {
    setExternalRegistry(component.vcsExternalRegistry ?? '')
    setEntries(selectBaseRow(component)?.vcsEntries?.map(toEntryState) ?? [])
  }, [component])

  function updateEntry(index: number, field: keyof EntryState, value: string) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)))
  }

  function addEntry() {
    setEntries((prev) => [
      ...prev,
      { name: '', vcsPath: '', repositoryType: '', tag: '', branch: '', hotfixBranch: '' },
    ])
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (!canEdit) return // Save is disabled when !canEdit; guard the handler too (backend also 403s).
    // Drop rows whose required `vcsPath` is still blank — the wire shape's
    // required string would otherwise hit the server as an empty value and
    // 400. Save is a button click (not a form submit), so HTML `required`
    // doesn't gate; this is the equivalent guard server-side contracts assume.
    const cleanedEntries = entries
      .map((e) => ({
        name: (e.name || '').trim(),
        vcsPath: e.vcsPath.trim(),
        branch: (e.branch || '').trim(),
        tag: (e.tag || '').trim(),
        hotfixBranch: (e.hotfixBranch || '').trim(),
        repositoryType: (e.repositoryType || '').trim(),
      }))
      .filter((e) => e.vcsPath !== '')

    try {
      await updateMutation.mutateAsync({
        version: component.version,
        clearGroup: false,
        vcsExternalRegistry: externalRegistry || null,
        baseConfiguration: {
          vcsEntries: cleanedEntries.map((e) => ({
            name: e.name || null,
            vcsPath: e.vcsPath,
            branch: e.branch || null,
            tag: e.tag || null,
            hotfixBranch: e.hotfixBranch || null,
            repositoryType: e.repositoryType || null,
          })),
        },
      })
      toast({ title: 'VCS settings saved' })
    } catch (err) {
      const conflict = await handleConflict(err)
      if (conflict) {
        toast({ ...conflict, variant: 'destructive' })
        return
      }
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>External Registry</Label>
          <Input
            value={externalRegistry}
            onChange={(e) => setExternalRegistry(e.target.value)}
            placeholder="External registry URL"
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">VCS Entries</h3>
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
                <Label className="text-xs">Name</Label>
                <Input value={entry.name} onChange={(e) => updateEntry(index, 'name', e.target.value)} placeholder="Entry name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">VCS Path</Label>
                <Input value={entry.vcsPath} onChange={(e) => updateEntry(index, 'vcsPath', e.target.value)} placeholder="ssh://git@..." className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Repository Type</Label>
                {/* Read-only: repository type is not user-editable (it follows the VCS host). */}
                <Input value={entry.repositoryType} disabled readOnly className="bg-muted font-mono text-xs" placeholder="GIT" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Production branch</Label>
                <Input value={entry.branch} onChange={(e) => updateEntry(index, 'branch', e.target.value)} placeholder="Branch pattern" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tag</Label>
                <Input value={entry.tag} onChange={(e) => updateEntry(index, 'tag', e.target.value)} placeholder="Tag pattern" className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hotfix Branch</Label>
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
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updateMutation.isPending || !canEdit}
          title={!canEdit ? CANNOT_EDIT_TITLE : undefined}
        >
          <Save className="h-4 w-4" />
          {updateMutation.isPending ? 'Saving...' : 'Save VCS'}
        </Button>
      </div>
    </div>
  )
}
