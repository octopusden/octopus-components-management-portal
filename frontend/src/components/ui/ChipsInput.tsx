import { X } from 'lucide-react'
import { Badge } from './badge'
import { cn } from '../../lib/utils'

/**
 * Chips/tags multi-select primitive. Renders the current values as removable
 * badges + an inline "Add X" picker populated from `options - value`
 * (dictionary-backed, no free-text path).
 *
 * Why a native `<select>` for the add control: shadcn/Radix Select renders
 * its option list in a portal that's awkward to drive deterministically
 * under jsdom (the `MultiSelectFilter` popover + EnumSelect tests both
 * have to special-case the trigger interaction). The native `<select>`
 * gives us:
 *   - a single accessible element a `<Label htmlFor>` can target via `id`,
 *   - first-class keyboard support without ARIA scaffolding,
 *   - trivially testable `userEvent.selectOptions` semantics.
 * The visual surface stays consistent with the rest of the editor because
 * we restyle the native control with the same input border + sizing classes
 * already used by `<Input>` / shadcn `<SelectTrigger>`. The CSS native-option
 * dropdown is a known visual divergence vs. a Radix popover; chosen here
 * for simplicity over per-test scaffolding.
 *
 * Wire contract: parent owns the `value` array. ChipsInput never mutates
 * server state; it only emits a new array via `onChange`. The empty array
 * IS a meaningful value (explicit "no labels") — the consumer
 * (`buildUpdateRequest`) decides whether to send `[]` or omit on the wire.
 */
export interface ChipsInputProps {
  /** DOM id forwarded to the add-combobox so `<Label htmlFor>` targets it. */
  id?: string
  /** Currently selected values, in user-controlled order. */
  value: string[]
  /** Called with the new array on every add or remove. */
  onChange: (next: string[]) => void
  /**
   * Full dictionary of allowed values. ChipsInput subtracts `value` before
   * displaying in the add control — already-added values aren't offered
   * again, so the user can't pick the same value twice.
   */
  options: string[]
  /** Placeholder copy for the add control's empty-option label. */
  placeholder?: string
  /** Disables both × buttons and the add control. */
  disabled?: boolean
  /**
   * Loading-state for the dictionary. Renders the add control disabled
   * with a "Loading…" placeholder so the user knows why nothing is
   * pickable yet.
   */
  isLoading?: boolean
  /** Forwarded to the add control for required-field semantics. */
  ariaRequired?: boolean
  /** Forwarded to the add control for inline-error association. */
  ariaDescribedBy?: string
  /**
   * Forwarded to the add control. Parity with the rest of the editor
   * (groupId Input, system MultiSelectFilter both set aria-invalid on
   * their trigger / control) so AT gets the invalid-state cue, not
   * just the error text via aria-describedby.
   */
  ariaInvalid?: boolean
}

export function ChipsInput({
  id,
  value,
  onChange,
  options,
  placeholder = 'Add value',
  disabled,
  isLoading,
  ariaRequired,
  ariaDescribedBy,
  ariaInvalid,
}: ChipsInputProps) {
  const availableToAdd = options.filter((o) => !value.includes(o))

  const handleRemove = (val: string) => {
    onChange(value.filter((v) => v !== val))
  }

  const handleAdd = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const picked = e.target.value
    if (!picked) return
    // Pick-then-clear: reset the controlled select to '' so picking the
    // same option twice (remove → re-add) fires onChange both times. The
    // controlled-value being constant '' makes the native <select> behave
    // as a single-shot picker rather than a sticky selection.
    onChange([...value, picked])
  }

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">No labels yet</p>
      ) : (
        <div className="flex flex-wrap gap-1.5" data-testid="chips-row">
          {value.map((val, idx) => (
            // Index-suffixed key — defensive against malformed server data
            // that includes duplicate label strings. React would otherwise
            // emit "duplicate key" warnings and silently drop one chip from
            // the DOM while the underlying form array retained both, giving
            // the user a count mismatch they couldn't see or fix.
            <Badge
              key={`${idx}-${val}`}
              variant="secondary"
              className="text-xs font-mono pr-1 gap-1"
              data-testid={`chip-${val}`}
            >
              <span>{val}</span>
              <button
                type="button"
                aria-label={`Remove ${val}`}
                disabled={disabled}
                onClick={() => handleRemove(val)}
                className={cn(
                  'inline-flex h-4 w-4 items-center justify-center rounded-full',
                  'hover:bg-secondary-foreground/15 focus:outline-none focus:ring-2 focus:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <select
        id={id}
        aria-label="Add label"
        aria-required={ariaRequired}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        disabled={disabled || isLoading}
        value=""
        onChange={handleAdd}
        data-testid="chips-add-select"
        className={cn(
          'h-8 w-full max-w-xs rounded-md border border-input bg-background px-2 text-xs',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <option value="" disabled hidden>
          {isLoading ? 'Loading…' : placeholder}
        </option>
        {availableToAdd.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}
