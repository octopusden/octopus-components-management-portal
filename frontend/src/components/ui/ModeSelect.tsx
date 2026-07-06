import { OWNERSHIP_MODES } from '@/lib/artifactOwnership'
import type { ArtifactIdMode } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ModeSelectProps {
  value: ArtifactIdMode
  onChange: (mode: ArtifactIdMode) => void
  /** Restrict the offered modes (e.g. the tokenless ALL / ALL_EXCEPT_CLAIMED). */
  allowed?: ArtifactIdMode[]
  disabled?: boolean
  /**
   * Element id for the <select>, associated with the "matching mode" label.
   * Required so per-row instances get unique ids (no duplicate-id/label collisions).
   */
  id: string
}

/**
 * Ownership-mode selector rendered as a native <select> + a one-line helper for
 * the chosen mode (approved Create-wizard mockup §ownership). Shared by the
 * create wizard and the editor's per-row ArtifactOwnershipEditor so the control
 * looks and behaves identically in both.
 */
export function ModeSelect({ value, onChange, allowed, disabled, id }: ModeSelectProps) {
  const modes = allowed ? OWNERSHIP_MODES.filter((m) => allowed.includes(m.key)) : OWNERSHIP_MODES
  // Coerce to a rendered value that actually has an <option> — otherwise a value
  // outside `allowed` shows as a blank selection. Falls back to the first offered mode.
  const rendered = modes.some((m) => m.key === value) ? value : (modes[0]?.key ?? value)
  const help = OWNERSHIP_MODES.find((m) => m.key === rendered)?.help
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id} className="font-medium">
        artifactId matching mode
      </label>
      <select
        id={id}
        disabled={disabled}
        value={rendered}
        onChange={(e) => onChange(e.target.value as ArtifactIdMode)}
        className={cn(
          'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        {modes.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  )
}
