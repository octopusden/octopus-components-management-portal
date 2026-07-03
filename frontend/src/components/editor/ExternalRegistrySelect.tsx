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
 */
export function ExternalRegistrySelect({
  value,
  onValueChange,
  disabled = false,
  id,
  'aria-describedby': ariaDescribedBy,
}: ExternalRegistrySelectProps) {
  const { options: rawOptions, isLoading } = useFieldOptions('vcs.externalRegistry')
  // Dedupe: a field-config list may advertise the same name twice; Radix keys
  // items by value, so a duplicate collides — keep first occurrence / order.
  const options = rawOptions.filter((opt, i) => rawOptions.indexOf(opt) === i)

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
