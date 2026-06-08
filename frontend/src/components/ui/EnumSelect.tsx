import { Input } from './input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'
import { useFieldOptions } from '../../hooks/useFieldOptions'

interface EnumSelectProps {
  /**
   * Field-config path consumed by the internal `useFieldOptions` fallback.
   * Ignored when `optionsOverride` is provided — pass any unique-ish string
   * (or '' / the field id) so callers can opt out of the hook entirely.
   */
  fieldPath: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  allowFreeText?: boolean
  disabled?: boolean
  /**
   * Caller-supplied option list. When provided, EnumSelect skips its
   * internal `useFieldOptions(fieldPath)` call and renders from this
   * array directly. Use case: the System editor (task #14) needs the
   * FULL dictionary (`/components/meta/systems/dictionary`) rather than
   * the in-use-values endpoint that `useFieldOptions('component.system')`
   * falls back to — otherwise a newly-defined dictionary value with no
   * existing component assignment would be invisible in the editor.
   */
  optionsOverride?: string[]
  /** Loading flag paired with `optionsOverride`. */
  isLoadingOverride?: boolean
  /**
   * `id` and `aria-*` are forwarded to the underlying trigger (SelectTrigger,
   * or the free-text Input when `allowFreeText` is on and the dictionary is
   * empty). This is the integration point for an outer `<Label htmlFor>` and
   * for inline-error association via `aria-describedby` — without these the
   * label/error wiring silently breaks for screen readers.
   */
  id?: string
  'aria-required'?: boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  /**
   * Forwarded to the underlying trigger / free-text input. Used by BuildTab
   * (ui-swift-sloth §5) to flip a `touched` flag on first blur so the
   * required-marker error only appears after the user has acknowledged the
   * field — not on mount with a legacy empty value.
   */
  onBlur?: () => void
}

export function EnumSelect({
  fieldPath,
  value,
  onValueChange,
  placeholder = 'Select an option',
  allowFreeText = false,
  disabled = false,
  id,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  onBlur,
  optionsOverride,
  isLoadingOverride,
}: EnumSelectProps) {
  // Conditional hook: when the caller supplies an override, we skip the
  // internal data source entirely so it doesn't fire a no-op query. The
  // pattern uses the same useFieldOptions hook for both branches via an
  // `enabled` flag inside the hook (skipToken on the meta query) — caller
  // override short-circuits the field-config read too.
  const hookResult = useFieldOptions(fieldPath, { enabled: optionsOverride === undefined })
  // Dedupe: a vocabulary source (meta endpoint or admin field-config) may
  // advertise the same value twice. Radix Select keys items by value, so a
  // duplicate produces a React key collision and a selection that can fail to
  // register — drop repeats, keeping first occurrence / order.
  const rawOptions = optionsOverride ?? hookResult.options
  const options = rawOptions.filter((opt, i) => rawOptions.indexOf(opt) === i)
  const isLoading = optionsOverride !== undefined ? Boolean(isLoadingOverride) : hookResult.isLoading

  // Bundled here so all three render branches forward the same a11y set without
  // drift; spreading `triggerA11y` keeps the JSX below tidy.
  const triggerA11y = {
    id,
    'aria-required': ariaRequired,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedBy,
    onBlur,
  }

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger {...triggerA11y}>
          <SelectValue placeholder="Loading..." />
        </SelectTrigger>
        <SelectContent />
      </Select>
    )
  }

  if (options.length === 0) {
    if (allowFreeText) {
      return (
        <Input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          // PR #44 review (Copilot): forward disabled to the free-text
          // branch — consumers expect the same gating in all three render
          // paths. Without this a `disabled` EnumSelect with an empty
          // dictionary stays editable.
          disabled={disabled}
          {...triggerA11y}
        />
      )
    }

    return (
      <Select
        value={value || '__none__'}
        onValueChange={(val) => onValueChange(val === '__none__' ? '' : val)}
        disabled={disabled}
      >
        <SelectTrigger {...triggerA11y}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">None</SelectItem>
          {value && <SelectItem value={value}>{value}</SelectItem>}
        </SelectContent>
      </Select>
    )
  }

  // Include the current value as an option if it's not already in the list
  const effectiveOptions =
    value && !options.includes(value) ? [value, ...options] : options

  return (
    <Select
      value={value || '__none__'}
      onValueChange={(val) => onValueChange(val === '__none__' ? '' : val)}
      disabled={disabled}
    >
      <SelectTrigger {...triggerA11y}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">None</SelectItem>
        {effectiveOptions.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
