import { Save, RotateCcw, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/button'
import { CANNOT_EDIT_TITLE } from './editPermission'

interface SaveBarProps {
  dirty: boolean
  canEdit: boolean
  isSaving: boolean
  /** Extra reason to keep Save disabled even when dirty (field-config loading,
   *  owner-lookup in flight). When set, it becomes the disabled tooltip. */
  blockedReason?: string | null
  onDiscard: () => void
  onSave: () => void
}

/**
 * Sticky save bar (spec §2.2) pinned to the bottom of the editor content
 * column. One Save for the whole component (replacing the per-tab buttons):
 * "Unsaved changes" vs "All changes saved", with Discard + Save changes. A
 * disabled Save shows a reason tooltip ("No changes to save" / the blocked
 * reason / the cannot-edit reason).
 */
export function SaveBar({ dirty, canEdit, isSaving, blockedReason, onDiscard, onSave }: SaveBarProps) {
  const saveDisabled = !canEdit || !dirty || isSaving || !!blockedReason
  const saveTitle = !canEdit
    ? CANNOT_EDIT_TITLE
    : blockedReason
      ? blockedReason
      : !dirty
        ? 'No changes to save'
        : undefined

  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-4 border-t bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:-mx-6 sm:px-6">
      <div className="flex items-center gap-2 text-sm">
        {dirty ? (
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <span className="h-2 w-2 rounded-full bg-[color:var(--color-badge-yellow-fg)]" aria-hidden />
            Unsaved changes
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            All changes saved
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onDiscard} disabled={!dirty || isSaving}>
          <RotateCcw className="h-4 w-4" />
          Discard
        </Button>
        {/* title on the wrapping span: a disabled Button has pointer-events-none. */}
        <span className="inline-flex" title={saveTitle}>
          <Button size="sm" onClick={onSave} disabled={saveDisabled}>
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </span>
      </div>
    </div>
  )
}
