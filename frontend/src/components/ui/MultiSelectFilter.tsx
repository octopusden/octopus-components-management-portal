import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button } from './button'
import { Input } from './input'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Badge } from './badge'
import { cn } from '../../lib/utils'

interface MultiSelectFilterProps {
  value: string[]
  onChange: (next: string[]) => void
  options: string[]
  isLoading?: boolean
  /** Trigger placeholder when no value is selected, e.g. "All labels". */
  placeholder: string
  /**
   * Singular noun for trigger and empty-state copy, e.g. "label" or
   * "build system". Pluralised with a trailing 's' — fine for the
   * units used today; refine if a unit needs non-trivial pluralisation.
   */
  unitLabel: string
  /**
   * Called when the popover toggles open/closed. Callers use this to
   * gate hooks behind a user-interaction-driven `enabled` flag (avoids
   * page-mount fetches against endpoints that may not exist yet —
   * Playwright's console-error listener trips on browser 404 logs
   * before the React-Query catch can swallow them).
   */
  onOpenChange?: (open: boolean) => void
  /**
   * Disables the trigger button and blocks the popover from opening.
   * Used by the Owner picker when the "My Components" switch pins owner
   * to the current user — the picker is intentionally locked out so the
   * two controls stay mutually exclusive.
   */
  disabled?: boolean
  /**
   * DOM id forwarded to the trigger button — lets an outer `<Label htmlFor>`
   * target the multi-select for accessibility (ui-swift-sloth §4).
   */
  id?: string
  /**
   * Forwarded to the trigger; mark as required for assistive tech when the
   * field has a `*` marker.
   */
  'aria-required'?: boolean
  /** Forwarded to the trigger for inline-error association. */
  'aria-invalid'?: boolean
  /** Forwarded to the trigger so AT can locate the error/help text. */
  'aria-describedby'?: string
}

export function MultiSelectFilter({
  value,
  onChange,
  options,
  isLoading,
  placeholder,
  unitLabel,
  onOpenChange,
  disabled,
  id,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const handleOpenChange = (next: boolean) => {
    // When disabled, ignore open requests — keeps the popover from
    // appearing even if a stray pointer event reaches the trigger.
    if (disabled && next) return
    setOpen(next)
    onOpenChange?.(next)
  }

  // Ref-by-option-value map: keyed on the stable option string instead of
  // a render-time index. When the user types in the search input, `filtered`
  // changes order and length, so an index-keyed Map would see the same
  // option's row land at a new idx while the prior ref callback's closure
  // still holds the OLD idx for cleanup → stale entries. Keying by value
  // sidesteps the issue because each row's set + delete reference the
  // same key (the option string).
  const optionRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, search])

  // Container-level Arrow handling — "stops at last" (matches native <select>).
  // preventDefault so the popover doesn't scroll the page instead. Navigation
  // is derived from `filtered` (the visible list) so search-narrowed lists
  // walk correctly: ArrowDown from the last visible item stays put even if
  // the underlying `options` array has more entries that the search hid.
  const handleListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if (filtered.length === 0) return
    // Reverse-lookup the focused option's index in `filtered`. We compare
    // the live `document.activeElement` against our refs Map (not against
    // e.target — keyboard events from the popover surface sometimes
    // bubble with e.target set to the scroll container, not the input).
    const focused = document.activeElement
    let currentIdx = -1
    for (let i = 0; i < filtered.length; i++) {
      if (optionRefs.current.get(filtered[i]!) === focused) {
        currentIdx = i
        break
      }
    }
    if (currentIdx < 0) {
      // No row focused yet — seed focus on the first visible row.
      e.preventDefault()
      optionRefs.current.get(filtered[0]!)?.focus()
      return
    }
    e.preventDefault()
    const nextIdx =
      e.key === 'ArrowDown'
        ? Math.min(currentIdx + 1, filtered.length - 1)
        : Math.max(currentIdx - 1, 0)
    optionRefs.current.get(filtered[nextIdx]!)?.focus()
  }

  const pluralUnit = `${unitLabel}s`
  const triggerLabel =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? value[0]!
        : `${value.length} ${pluralUnit}`

  const toggle = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option))
    } else {
      // Preserve options order so selection order stays deterministic
      // (improves the readability of the CSV query string and the test).
      onChange(options.filter((o) => value.includes(o) || o === option))
    }
  }

  const clearAll = () => onChange([])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          aria-required={ariaRequired}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          variant="outline"
          size="sm"
          className="w-[200px] justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">{triggerLabel}</span>
          {value.length > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
              {value.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-2">
        <div className="mb-2">
          <Input
            placeholder={`Search ${pluralUnit}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div
          className="max-h-64 overflow-auto"
          onKeyDown={handleListKeyDown}
          data-testid="multi-select-options-list"
        >
          {isLoading ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">Loading…</div>
          ) : options.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              No {pluralUnit} available
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              No matches for "{search}"
            </div>
          ) : (
            filtered.map((option) => {
              const checked = value.includes(option)
              return (
                <label
                  key={option}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <input
                    ref={(el) => {
                      if (el) optionRefs.current.set(option, el)
                      else optionRefs.current.delete(option)
                    }}
                    type="checkbox"
                    aria-label={option}
                    className="accent-primary h-4 w-4 rounded"
                    checked={checked}
                    onChange={() => toggle(option)}
                  />
                  <span className="truncate font-mono text-xs">{option}</span>
                </label>
              )
            })
          )}
        </div>
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          {value.length > 0 ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={clearAll}
            >
              Clear
            </button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleOpenChange(false)}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
