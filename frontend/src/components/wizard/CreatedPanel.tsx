import { Check, ChevronRight, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { DialogTitle } from '../ui/dialog'

/** What the wizard shows once the registry has created the component. */
export function CreatedPanel({
  name,
  onCreateAnother,
  onOpen,
}: {
  name: string
  onCreateAnother: () => void
  onOpen: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        <Check className="h-7 w-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <DialogTitle className="text-xl font-semibold">Component created</DialogTitle>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{name}</span> was added to the registry.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" variant="outline" onClick={onCreateAnother}>
          <Plus className="h-4 w-4" />
          Create another
        </Button>
        <Button type="button" onClick={onOpen}>
          Go to component
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
