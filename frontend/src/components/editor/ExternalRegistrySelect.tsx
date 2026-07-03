import { Input } from '../ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { useFieldOptions } from '../../hooks/useFieldOptions'

/** Suffix appended to a stored value that is absent from the configured options
 *  (data older than the list). Exported so tests assert against one source. */
export const NOT_IN_LIST_SUFFIX = '(not in configured list)'

/** The skip-commit-check sentinel. It is NEVER a selectable registry — it is
 *  expressed via the Jira-tab Skip Commit Check toggle. Exported for tests. */
export const NOT_AVAILABLE_SENTINEL = 'NOT_AVAILABLE'

interface ExternalRegistrySelectProps {
  value: string
  onValueChange: (value: string) => void
  /** Disabled dropdown (non-admin / read-only page). */
  disabled?: boolean
  id?: string
  'aria-describedby'?: string
}

/**
 * External Registry picker for the VCS tab (P-3). A dropdown fed by the
 * field-config `options` for the DISPLAY path `vcs.externalRegistry`
 * (installation-configured registry names; the `NOT_AVAILABLE` sentinel is NOT
 * an option — it is expressed via the Jira-tab Skip Commit Check toggle).
 *
 * Three states, none of which EnumSelect covers cleanly (hence a dedicated
 * component rather than a reuse):
 *   - options configured → dropdown with a "None" clear entry ('' clears via
 *     CRS-A ""-clear). A stored value absent from the list is still shown,
 *     selected, tagged "(not in configured list)" — never dropped or replaced.
 *   - options empty/unconfigured → read-only: the stored value (if any) shown
 *     disabled, else a "no registries configured" hint. Never an empty dropdown.
 *   - loading → disabled placeholder.
 *
 * The NOT_AVAILABLE sentinel is never selectable: it is filtered out of the
 * options, and a stored sentinel renders read-only pointing at the Skip Commit
 * Check toggle (defensive guard for legacy / in-transition data).
 */
export function ExternalRegistrySelect({
  value,
  onValueChange,
  disabled = false,
  id,
  'aria-describedby': ariaDescribedBy,
}: ExternalRegistrySelectProps) {
  const { options: rawOptions, isLoading } = useFieldOptions('vcs.externalRegistry')
  // Dedupe + drop the sentinel: a field-config list may advertise the same name
  // twice (Radix keys items by value, so a duplicate collides — keep first
  // occurrence / order), and NOT_AVAILABLE must never surface as a selectable
  // registry even if it slipped into the configured options.
  const options = rawOptions.filter(
    (opt, i) => rawOptions.indexOf(opt) === i && opt !== NOT_AVAILABLE_SENTINEL,
  )

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger id={id} aria-describedby={ariaDescribedBy}>
          <SelectValue placeholder="Loading..." />
        </SelectTrigger>
        <SelectContent />
      </Select>
    )
  }

  // Defensive guard for legacy / in-transition data: a stored NOT_AVAILABLE is
  // the skip-commit-check sentinel, not a registry. Post-CRS-C it no longer
  // lives in storage (it moved to the skipCommitCheck flag), but if it is still
  // present we render it read-only and NEVER as a selectable option — the value
  // is preserved (the hook keeps sending it unchanged; we don't overwrite it),
  // and the user is pointed at the toggle that actually owns this state.
  if (value === NOT_AVAILABLE_SENTINEL) {
    return (
      <p id={id} aria-describedby={ariaDescribedBy} className="text-sm text-muted-foreground">
        Managed via Skip Commit Check on the Jira tab
      </p>
    )
  }

  // No configured list → read-only (never an empty dropdown, never free text):
  // show the stored value disabled, or a hint when there is nothing to show.
  if (options.length === 0) {
    if (value) {
      return (
        <Input
          value={value}
          disabled
          readOnly
          id={id}
          aria-describedby={ariaDescribedBy}
          className="bg-muted"
        />
      )
    }
    return (
      <p id={id} aria-describedby={ariaDescribedBy} className="text-sm text-muted-foreground">
        No registries configured
      </p>
    )
  }

  const valueUnknown = Boolean(value) && !options.includes(value)

  return (
    <Select
      value={value || '__none__'}
      onValueChange={(val) => onValueChange(val === '__none__' ? '' : val)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-describedby={ariaDescribedBy}>
        <SelectValue placeholder="Select a registry" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">None</SelectItem>
        {valueUnknown && (
          <SelectItem value={value}>
            {value} <span className="text-muted-foreground">{NOT_IN_LIST_SUFFIX}</span>
          </SelectItem>
        )}
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
