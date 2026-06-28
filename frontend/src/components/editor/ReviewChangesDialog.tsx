import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import type { DiffEntry } from '../../lib/editor/combineRequest'
import { validateJiraKey, normalizeJiraKey, normalizeChangeComment } from '../../lib/editor/jiraKey'

/** Optional change metadata passed up on confirm; blank fields are omitted. */
export interface ConfirmMeta {
  jiraTaskKey?: string
  changeComment?: string
}

interface ReviewChangesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  diff: DiffEntry[]
  onConfirm: (meta: ConfirmMeta) => void
  isSaving: boolean
  /**
   * A persistent save-time conflict message (e.g. an overlapping/duplicate
   * version range the server rejected with 409). Rendered as a destructive
   * banner that stays put — unlike the auto-dismissing toast — so the user can
   * read it, fix the value, and retry without losing the diff.
   */
  errorBanner?: string | null
}

/**
 * "Review changes" dialog (spec §2.2). Lists every changed field as
 * `label: old → new` (old in destructive color, new in positive/green). A
 * cleared scalar-aspect row is annotated "(clearing not supported)" — CRS v4
 * PATCH treats null for scalar aspects as a no-op, so that clear silently won't
 * persist; the note keeps the user from being misled. List/array clears are
 * real REPLACE-empty operations and are NOT annotated.
 *
 * Also captures optional change metadata — a Jira task key (validated when
 * non-blank) and a free-text comment — recorded on the audit row by CRS. Both
 * are optional; blank values are omitted from the request.
 */
export function ReviewChangesDialog({ open, onOpenChange, diff, onConfirm, isSaving, errorBanner }: ReviewChangesDialogProps) {
  const [jiraTaskKey, setJiraTaskKey] = useState('')
  const [changeComment, setChangeComment] = useState('')

  // Reset the metadata fields whenever the dialog closes (Cancel, Escape, overlay
  // click, or the programmatic close after a successful save) so the next save
  // starts clean. `open` is parent-controlled, so an effect covers every path.
  useEffect(() => {
    if (!open) {
      setJiraTaskKey('')
      setChangeComment('')
    }
  }, [open])

  const jiraError = validateJiraKey(jiraTaskKey)

  const handleConfirm = () => {
    if (jiraError) return
    onConfirm({
      jiraTaskKey: normalizeJiraKey(jiraTaskKey),
      changeComment: normalizeChangeComment(changeComment),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review changes</DialogTitle>
          <DialogDescription>
            {diff.length === 1 ? '1 field will change.' : `${diff.length} fields will change.`} Confirm to save.
          </DialogDescription>
        </DialogHeader>

        {errorBanner && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <span aria-hidden="true">▲</span>
            <span>{errorBanner}</span>
          </div>
        )}

        <div className="max-h-[40vh] overflow-auto rounded-md border">
          <ul className="divide-y text-sm">
            {diff.map((entry, i) => (
              <li key={`${entry.label}-${i}`} className="px-3 py-2">
                <div className="font-medium text-foreground">{entry.label}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-xs">
                  <span className="text-destructive line-through">{entry.oldValue}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-[color:var(--color-badge-green-fg)]">{entry.newValue}</span>
                </div>
                {entry.clearedScalarNoop && (
                  <p className="mt-0.5 text-xs text-muted-foreground">(clearing not supported)</p>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="review-jira-key">Jira task key (optional)</Label>
            <Input
              id="review-jira-key"
              placeholder="ABC-123"
              value={jiraTaskKey}
              onChange={(e) => setJiraTaskKey(e.target.value)}
              disabled={isSaving}
              aria-invalid={!!jiraError}
              aria-describedby={jiraError ? 'review-jira-key-error' : undefined}
            />
            {jiraError && (
              <p id="review-jira-key-error" className="text-xs text-destructive">
                {jiraError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="review-change-comment">Comment (optional)</Label>
            <textarea
              id="review-change-comment"
              placeholder="What changed and why"
              value={changeComment}
              onChange={(e) => setChangeComment(e.target.value)}
              disabled={isSaving}
              rows={3}
              className="flex min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSaving || !!jiraError}>
            {isSaving ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
