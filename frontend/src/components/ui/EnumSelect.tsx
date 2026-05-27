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
  fieldPath: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  allowFreeText?: boolean
  disabled?: boolean
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
}: EnumSelectProps) {
  const { options, isLoading } = useFieldOptions(fieldPath)

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
