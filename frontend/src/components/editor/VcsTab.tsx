import { Plus, Trash2 } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { FieldInfo } from '../ui/FieldInfo'
import { FieldLabelText } from '../ui/FieldLabelText'
import { Separator } from '../ui/separator'
import { isVcsHostSupported, hostOf } from '../../lib/vcsHost'
import type { VcsSection } from './useVcsSection'

interface VcsTabProps {
  section: VcsSection
  canEdit: boolean
  /** Ecosystem Bitbucket base URL (${bitbucket.host}); absent ⇒ host check skipped. */
  gitBaseUrl?: string | null
}

/** VCS tab — presentational. State + slice live in `useVcsSection` (page-owned). */
export function VcsTab({ section, canEdit, gitBaseUrl }: VcsTabProps) {
  const { externalRegistry, setExternalRegistry, entries, updateEntry, addEntry, removeEntry } = section
  const allowedHost = hostOf(gitBaseUrl)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label><FieldLabelText path="vcs.externalRegistry" fallback="External Registry" /></Label>
            <FieldInfo path="vcs.externalRegistry" label="External Registry" />
          </div>
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
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold"><FieldLabelText path="vcs.entries" fallback="VCS Entries" /></h3>
            <FieldInfo path="vcs.entries" label="VCS Entries" />
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
      </div>
    </div>
  )
}
