import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

/** One secondary filter dimension offered by the "+ Filter" panel. */
export interface AddFilterItem {
  id: string
  label: string
  group: string
  /** Short current-value text, when the dimension holds a value. */
  summary?: string
  /** The control shown once the dimension is picked. */
  editor: ReactNode
}

/**
 * The "+ Filter" panel: secondary filter dimensions grouped by topic (those holding a value
 * show it), and — once one is picked — that dimension's editor. Values set here show as
 * removable chips under the bar, so the bar itself never grows. Shared by the component list
 * and the audit log.
 *
 * Editors are rendered by the caller and unmount when the panel closes, so any state that must
 * outlive the panel (e.g. a pending text debounce) belongs to the caller.
 */
export function AddFilterMenu({
  items,
  groups,
  activeCount,
}: {
  items: AddFilterItem[]
  /** Group headings, in display order; items are listed under their `group`. */
  groups: readonly string[]
  activeCount: number
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const current = items.find((d) => d.id === editing)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setEditing(null)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" aria-label="Add filter">
          <Plus className="h-4 w-4" />
          Filter
          {activeCount > 0 && (
            <span className="ml-0.5 rounded-full bg-secondary px-1.5 text-xs text-secondary-foreground">{activeCount}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto min-w-60 p-1">
        {current ? (
          <div role="group" aria-label={current.label}>
            <button
              type="button"
              className="flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setEditing(null)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {current.label}
            </button>
            <div className="p-1">{current.editor}</div>
          </div>
        ) : (
          groups.map((group) => {
            const inGroup = items.filter((d) => d.group === group)
            if (!inGroup.length) return null
            return (
              <div key={group} role="group" aria-label={group} className="py-1">
                <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group}</div>
                {inGroup.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-label={d.label}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setEditing(d.id)}
                  >
                    <span className="flex-1">{d.label}</span>
                    {d.summary && <span className="max-w-32 truncate text-xs text-muted-foreground">{d.summary}</span>}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )
          })
        )}
      </PopoverContent>
    </Popover>
  )
}
