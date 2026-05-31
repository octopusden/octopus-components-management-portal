import { useState } from 'react'
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react'
import { Button } from './button'
import { PeopleInput } from './PeopleInput'

/**
 * Ordered, reorderable multi-people editor. Renders the current people as a
 * vertical list of rows (move-up / move-down / remove per row) plus an add-row
 * that reuses the single-value {@link PeopleInput} autocomplete (owners +
 * optional external lookup).
 *
 * Order is meaningful — the array is an ordered list (first = primary), matching
 * the CRS v4 `releaseManager` / `securityChampion` ordered child-row contract.
 *
 * Dedupe: a username already present in the list cannot be added again
 * (keep-first), mirroring the server-side canonicalization. The parent owns the
 * `value` array; this component only emits a new array via `onChange` and never
 * mutates server state.
 */
export interface PeopleListInputProps {
  /** Currently selected people, in user-controlled order. */
  value: string[]
  /** Called with the new ordered array on every add / remove / reorder. */
  onChange: (value: string[]) => void
  /** Disables the add control and every row control. */
  disabled?: boolean
  /** Placeholder copy for the add-row autocomplete. */
  placeholder?: string
  /** External lookup forwarded to the embedded {@link PeopleInput}. */
  lookupFn?: (query: string) => Promise<{ id: string; displayName: string; email: string }[]>
}

export function PeopleListInput({
  value,
  onChange,
  disabled,
  placeholder = 'Add person',
  lookupFn,
}: PeopleListInputProps) {
  // Remount key for the add-row PeopleInput. PeopleInput owns its internal
  // inputValue state and only re-syncs from the `value` prop when that prop
  // changes; we always pass `value=""`, so bumping this key is what clears the
  // embedded input after each add (or rejected duplicate).
  const [addKey, setAddKey] = useState(0)

  const handleAdd = (raw: string) => {
    const person = raw.trim()
    // Clear the add input regardless (empty / duplicate / accepted) so the
    // control is always ready for the next pick.
    setAddKey((k) => k + 1)
    if (!person) return
    // Keep-first dedupe — never add a username already in the list.
    if (value.includes(person)) return
    onChange([...value, person])
  }

  const handleRemove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= value.length) return
    const next = [...value]
    const [moved] = next.splice(idx, 1)
    if (moved === undefined) return
    next.splice(target, 0, moved)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">No people yet</p>
      ) : (
        <div className="space-y-1.5" data-testid="people-list-rows">
          {value.map((person, idx) => (
            // Index-suffixed key — defensive against malformed server data that
            // includes a duplicate username: keeps the row render and its
            // control click-targets independent per slot.
            <div key={`${idx}-${person}`} className="flex items-center gap-2" data-testid={`person-row-${idx}`}>
              <span className="flex-1 truncate rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm">
                {person}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                disabled={disabled || idx === 0}
                onClick={() => move(idx, -1)}
                aria-label={`Move ${person} up`}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                disabled={disabled || idx === value.length - 1}
                onClick={() => move(idx, 1)}
                aria-label={`Move ${person} down`}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive"
                disabled={disabled}
                onClick={() => handleRemove(idx)}
                aria-label={`Remove ${person}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {!disabled && (
        <PeopleInput key={addKey} value="" onChange={handleAdd} placeholder={placeholder} lookupFn={lookupFn} />
      )}
    </div>
  )
}
