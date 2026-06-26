import { Button } from './ui/button'
import { PRESETS, type PresetId } from '../lib/listPresets'

interface ListPresetBarProps {
  /** The currently-active preset, or null for a custom/ad-hoc filter. */
  active: PresetId | null
  /** When false, the admin-only "With problems" preset is hidden entirely. */
  isAdmin: boolean
  onSelect: (id: PresetId) => void
}

/**
 * Segmented control of list presets (spec §1.1) above the filter bar. Each
 * preset is sugar over the filter state (see lib/listPresets). The active
 * preset gets the primary fill. The admin-only "With problems" preset is hidden
 * for non-admins; the personal RM/SC presets filter on the current user's own
 * roles and are shown to everyone.
 */
export function ListPresetBar({ active, isAdmin, onSelect }: ListPresetBarProps) {
  return (
    <div role="group" aria-label="Component presets" className="flex flex-wrap items-center gap-1">
      {PRESETS.map((preset) => {
        // Admin-only presets are hidden (not just disabled) for non-admins.
        if (preset.adminOnly && !isAdmin) return null

        const isActive = active === preset.id

        return (
          <Button
            key={preset.id}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            aria-pressed={isActive}
            onClick={() => onSelect(preset.id)}
          >
            {preset.label}
          </Button>
        )
      })}
    </div>
  )
}
