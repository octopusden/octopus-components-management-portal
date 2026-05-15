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
}

export function EnumSelect({
  fieldPath,
  value,
  onValueChange,
  placeholder = 'Select an option',
  allowFreeText = false,
  disabled = false,
}: EnumSelectProps) {
  const { options, isLoading } = useFieldOptions(fieldPath)

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger>
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
        />
      )
    }

    return (
      <Select
        value={value || '__none__'}
        onValueChange={(val) => onValueChange(val === '__none__' ? '' : val)}
        disabled={disabled}
      >
        <SelectTrigger>
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
      <SelectTrigger>
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
