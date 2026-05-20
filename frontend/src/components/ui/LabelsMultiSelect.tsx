import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button } from './button'
import { Input } from './input'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Badge } from './badge'
import { useLabels } from '../../hooks/useLabels'
import { cn } from '../../lib/utils'

interface LabelsMultiSelectProps {
  value: string[]
  onChange: (next: string[]) => void
}

export function LabelsMultiSelect({ value, onChange }: LabelsMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Sticky activation flag — flips true on first open and never back.
  // Drives `useLabels({ enabled })` so the network request only fires once
  // the user expresses intent (avoids a page-mount 404 against a CRS that
  // does not yet ship /components/meta/labels — Playwright's console-error
  // listener trips on the browser's native 404 log before our React-Query
  // catch can swallow it).
  const [activated, setActivated] = useState(false)
  useEffect(() => {
    if (open && !activated) setActivated(true)
  }, [open, activated])

  const { data: options = [], isLoading } = useLabels({ enabled: activated })

  // Ref-by-index map: each <input>'s render-time ref callback writes its
  // own slot, and unmount cleans it up. No render-time array mutation
  // (which would be unsafe under StrictMode / concurrent rendering).
  const optionRefs = useRef<Map<number, HTMLInputElement>>(new Map())

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, search])

  // Container-level Arrow handling — "stops at last" (matches native <select>).
  // preventDefault so the popover doesn't scroll the page instead.
  const handleListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const map = optionRefs.current
    if (map.size === 0) return
    // Reverse-lookup the focused index from the Map. Iteration order on
    // a Map is insertion order in practice, but we don't rely on that —
    // we explicitly match the focused element to its index slot.
    let idx = -1
    for (const [i, el] of map) {
      if (el === e.target) {
        idx = i
        break
      }
    }
    if (idx === -1) return
    e.preventDefault()
    const lastIdx = filtered.length - 1
    const nextIdx = e.key === 'ArrowDown' ? Math.min(idx + 1, lastIdx) : Math.max(idx - 1, 0)
    map.get(nextIdx)?.focus()
  }

  const triggerLabel =
    value.length === 0
      ? 'All labels'
      : value.length === 1
        ? value[0]!
        : `${value.length} labels`

  const toggle = (label: string) => {
    if (value.includes(label)) {
      onChange(value.filter((v) => v !== label))
    } else {
      // Preserve options order so selection order stays deterministic
      // (improves the readability of the CSV query string and the test).
      onChange(options.filter((o) => value.includes(o) || o === label))
    }
  }

  const clearAll = () => onChange([])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-[200px] justify-between font-normal"
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
            placeholder="Search labels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div
          className="max-h-64 overflow-auto"
          onKeyDown={handleListKeyDown}
          data-testid="labels-options-list"
        >
          {isLoading ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">Loading…</div>
          ) : options.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">No labels available</div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              No matches for "{search}"
            </div>
          ) : (
            filtered.map((label, idx) => {
              const checked = value.includes(label)
              return (
                <label
                  key={label}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <input
                    ref={(el) => {
                      if (el) optionRefs.current.set(idx, el)
                      else optionRefs.current.delete(idx)
                    }}
                    type="checkbox"
                    aria-label={label}
                    className="accent-primary h-4 w-4 rounded"
                    checked={checked}
                    onChange={() => toggle(label)}
                  />
                  <span className="truncate font-mono text-xs">{label}</span>
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
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
