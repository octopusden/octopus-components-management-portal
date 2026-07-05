import { OWNERSHIP_MODES } from '@/lib/artifactOwnership'
import type { ArtifactIdMode } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ModeRadioGroupProps {
  value: ArtifactIdMode
  onChange: (mode: ArtifactIdMode) => void
  /** Restrict the offered modes (the create dialog offers only the tokenless ALL / ALL_EXCEPT_CLAIMED). */
  allowed?: ArtifactIdMode[]
  disabled?: boolean
  idPrefix?: string
}

/**
 * Ownership-mode selector rendered as clickable rows (mockup "Owns" radio). Not a native
 * radio group — each row is a labelled button so the helper text reads inline.
 */
export function ModeRadioGroup({ value, onChange, allowed, disabled, idPrefix = 'mode' }: ModeRadioGroupProps) {
  const modes = allowed ? OWNERSHIP_MODES.filter((m) => allowed.includes(m.key)) : OWNERSHIP_MODES
  // Roving tabindex: arrow keys move within the group; only the selected (or first) row is tabbable.
  const move = (delta: number) => {
    if (disabled) return
    const i = modes.findIndex((m) => m.key === value)
    const next = modes[(((i < 0 ? 0 : i) + delta) % modes.length + modes.length) % modes.length]
    if (!next) return
    onChange(next.key)
    // Roving tabindex: carry keyboard focus to the newly selected radio so it
    // doesn't stay stranded on the previous row (which is about to become
    // tabIndex=-1). The row element persists across the re-render (keyed by id).
    document.getElementById(`${idPrefix}-${next.key}`)?.focus()
  }
  const selectedIndex = modes.findIndex((m) => m.key === value)
  return (
    <div role="radiogroup" className="flex flex-col gap-2">
      {modes.map((mode, idx) => {
        const selected = value === mode.key
        const tabbable = selected || (selectedIndex < 0 && idx === 0)
        return (
          <button
            key={mode.key}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={tabbable ? 0 : -1}
            id={`${idPrefix}-${mode.key}`}
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault()
                move(1)
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault()
                move(-1)
              }
            }}
            onClick={() => !disabled && onChange(mode.key)}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
              selected ? 'border-primary bg-muted/40' : 'border-input bg-background hover:bg-muted/20',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                selected ? 'border-primary' : 'border-muted-foreground/40',
              )}
            >
              {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{mode.label}</span>
              <span className="text-xs text-muted-foreground">{mode.help}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
