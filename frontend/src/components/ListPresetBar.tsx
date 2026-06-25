import { Button } from './ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip'
import { PRESETS, type PresetId } from '../lib/listPresets'

// Phase 1b: shown on the disabled RM / SC presets. Their CRS list filters
// (releaseManager= / securityChampion=) are not deployed in this branch and
// ComponentSummary carries no RM/SC field — so the buttons are inert until
// the registry ships support. Surfaced both as a hover tooltip and the native
// `title` so the reason is discoverable without a pointer hover (and assertable).
const DEFERRED_TOOLTIP = 'Coming soon — needs registry support'

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
 * preset gets the primary fill; the two Phase 1b presets render disabled with a
 * "coming soon" tooltip and never call onSelect.
 */
export function ListPresetBar({ active, isAdmin, onSelect }: ListPresetBarProps) {
  return (
    <div role="group" aria-label="Component presets" className="flex flex-wrap items-center gap-1">
      {PRESETS.map((preset) => {
        // Admin-only presets are hidden (not just disabled) for non-admins.
        if (preset.adminOnly && !isAdmin) return null

        const isActive = active === preset.id

        // Phase 1b — deferred presets are disabled with an explanatory tooltip.
        if (preset.deferred) {
          return (
            <Tooltip key={preset.id}>
              <TooltipTrigger asChild>
                {/* A disabled <button> swallows pointer events, so the tooltip
                    trigger wraps it; the native title carries the same reason as
                    a no-hover fallback. */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  aria-pressed={false}
                  title={DEFERRED_TOOLTIP}
                  // Phase 1b: wired to the future filter.releaseManager /
                  // filter.securityChampion params once CRS ships them.
                >
                  {preset.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{DEFERRED_TOOLTIP}</TooltipContent>
            </Tooltip>
          )
        }

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
