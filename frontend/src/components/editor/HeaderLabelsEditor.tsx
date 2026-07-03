import { Tag } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ChipsInput } from '../ui/ChipsInput'
import { FieldInfo } from '../ui/FieldInfo'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

interface HeaderLabelsEditorProps {
  value: string[]
  onChange: (next: string[]) => void
  options: string[]
  isLoading?: boolean
  /** 'hidden' renders nothing; 'readonly' shows badges without the editor. */
  visibility?: 'editable' | 'readonly' | 'hidden'
  /** Page-level edit gate — a read-only viewer never gets the popover editor. */
  canEdit?: boolean
  /** Inline server-error (e.g. a 400 mapped to `labels`). */
  error?: string
}

/**
 * Labels surfaced in the component header — badges plus a popover editor
 * (ChipsInput), moved here from the General tab. The parent (ComponentDetailPage)
 * owns the RHF form; this component is purely presentational and reports edits
 * up via `onChange` (which the page wires to setValue with shouldDirty/shouldTouch,
 * preserving the clear-all touched-flag contract).
 */
export function HeaderLabelsEditor({
  value,
  onChange,
  options,
  isLoading,
  visibility = 'editable',
  canEdit = true,
  error,
}: HeaderLabelsEditorProps) {
  if (visibility === 'hidden') return null
  const editable = visibility === 'editable' && canEdit

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="header-labels">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Tag className="h-3.5 w-3.5" aria-hidden />
        Labels
        <FieldInfo path="component.labels" label="Labels" />
      </span>
      {value.length === 0 && !editable && (
        <span className="text-xs text-muted-foreground">—</span>
      )}
      {value.map((label) => (
        <Badge key={label} variant="secondary">
          {label}
        </Badge>
      ))}
      {editable && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'h-6 gap-1 px-2 text-xs',
                error && 'border-destructive text-destructive',
              )}
              aria-label="Edit labels"
              aria-invalid={Boolean(error)}
            >
              <Tag className="h-3 w-3" />
              Edit labels
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Labels</p>
            <ChipsInput
              id="header-labels-input"
              value={value}
              onChange={onChange}
              options={options}
              isLoading={isLoading}
              placeholder="Add label"
              ariaInvalid={Boolean(error)}
              ariaDescribedBy={error ? 'header-labels-error' : undefined}
            />
          </PopoverContent>
        </Popover>
      )}
      {/* Errors render in the always-visible header row (not only inside the
          popover) so a server 400 on labels is readable without opening it. */}
      {error && (
        <span id="header-labels-error" role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
