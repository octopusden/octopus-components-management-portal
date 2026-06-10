import { Info } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip'
import { fieldDescriptions } from '../../lib/fieldDescriptions'
import { useFieldConfigEntry } from '../../hooks/useFieldConfig'

interface FieldInfoProps {
  /** Section-prefixed field path, e.g. "component.displayName" (useFieldConfig convention). */
  path: string
  /**
   * Hardcoded label of the field — used for the trigger's accessible name.
   * A field-config `label` override replaces it so the accessible name always
   * matches the visible (possibly renamed) label.
   */
  label: string
}

/**
 * Small info icon placed next to a field label (as a sibling, never inside
 * the <label> — nested interactive content). Hover/focus shows the field's
 * description: the field-config `description` override when the deployment
 * provides one, else the hardcoded fieldDescriptions registry. Renders nothing
 * when neither has an entry, so missing descriptions are visible by absence
 * and never produce an empty tooltip. Relies on the <TooltipProvider> mounted
 * in App.
 */
export function FieldInfo({ path, label }: FieldInfoProps) {
  const { entry } = useFieldConfigEntry(path)
  const description = entry.description?.trim() || fieldDescriptions[path]
  const displayLabel = entry.label?.trim() || label
  if (!description?.trim()) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Description for ${displayLabel}`}
          data-field-path={path}
          className="inline-flex shrink-0 cursor-help rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:pointer-events-none"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-normal leading-snug">
        {description}
      </TooltipContent>
    </Tooltip>
  )
}
