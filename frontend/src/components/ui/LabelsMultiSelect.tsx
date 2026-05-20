import { useMemo, useState } from 'react'
import { Button } from './button'
import { Input } from './input'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Badge } from './badge'
import { cn } from '../../lib/utils'

interface LabelsMultiSelectProps {
  value: string[]
  onChange: (next: string[]) => void
  options: string[]
  isLoading?: boolean
}

export function LabelsMultiSelect({ value, onChange, options, isLoading }: LabelsMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, search])

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
        <div className="max-h-64 overflow-auto">
          {isLoading ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              {options.length === 0 ? 'No labels available' : 'No matches'}
            </div>
          ) : (
            filtered.map((label) => {
              const checked = value.includes(label)
              return (
                <label
                  key={label}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <input
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
