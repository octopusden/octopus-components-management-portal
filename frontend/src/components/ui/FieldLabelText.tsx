import { useFieldLabel } from '../../hooks/useFieldConfig'

interface FieldLabelTextProps {
  /** Section-prefixed field path, e.g. "build.projectVersion" (useFieldConfig convention). */
  path: string
  /** Hardcoded label rendered when the field-config carries no override. */
  fallback: string
}

/**
 * Display text of a field label: the field-config `label` override when the
 * deployment provides one, else the hardcoded fallback. Renders a bare text
 * node so it can wrap the text of any <Label> (switch-bound htmlFor labels,
 * required-asterisk siblings, …) without changing the markup around it.
 */
export function FieldLabelText({ path, fallback }: FieldLabelTextProps) {
  return <>{useFieldLabel(path, fallback)}</>
}
