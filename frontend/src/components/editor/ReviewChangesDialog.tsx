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
import type { DiffEntry } from '../../lib/editor/combineRequest'

interface ReviewChangesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  diff: DiffEntry[]
  onConfirm: () => void
  isSaving: boolean
}

/**
 * "Review changes" dialog (spec §2.2). Lists every changed field as
 * `label: old → new` (old in destructive color, new in positive/green). A
 * cleared scalar-aspect row is annotated "(clearing not supported)" — CRS v4
 * PATCH treats null for scalar aspects as a no-op, so that clear silently won't
 * persist; the note keeps the user from being misled. List/array clears are
 * real REPLACE-empty operations and are NOT annotated.
 */
export function ReviewChangesDialog({ open, onOpenChange, diff, onConfirm, isSaving }: ReviewChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review changes</DialogTitle>
          <DialogDescription>
            {diff.length === 1 ? '1 field will change.' : `${diff.length} fields will change.`} Confirm to save.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-auto rounded-md border">
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
