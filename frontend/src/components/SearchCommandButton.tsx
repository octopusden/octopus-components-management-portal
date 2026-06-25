import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from './ui/button'
import { useUiOverlay } from '@/lib/uiOverlayStore'
import { isMac } from '@/lib/platform'

// One-time coachmark dismissal flag. Persisted so the hint shows exactly once
// per browser, then never again.
const COACHMARK_KEY = 'crs_kbd_hint'

function coachmarkDismissed(): boolean {
  try {
    return localStorage.getItem(COACHMARK_KEY) != null
  } catch {
    // Storage disabled (private mode): treat as dismissed so we don't nag on
    // every render with no way to persist the dismissal.
    return true
  }
}

function dismissCoachmark() {
  try {
    localStorage.setItem(COACHMARK_KEY, '1')
  } catch {
    // Best-effort; if storage is unavailable the coachmark simply won't persist.
  }
}

/**
 * Discoverability entry point for the command palette (spec §1.6): a visible
 * "Search ⌘K" button in the list header that opens the palette, plus a
 * one-time dismissible coachmark pointing at it.
 */
export function SearchCommandButton() {
  const openPalette = useUiOverlay((s) => s.openPalette)
  // Resolve the dismissal flag once on mount (not during render) so the first
  // paint is stable and SSR/storage-less environments don't flash the hint.
  const [showHint, setShowHint] = useState(false)
  useEffect(() => {
    if (!coachmarkDismissed()) setShowHint(true)
  }, [])

  function hideHint() {
    setShowHint(false)
    dismissCoachmark()
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={openPalette}
        className="gap-2 text-muted-foreground"
        aria-keyshortcuts={isMac() ? 'Meta+K' : 'Control+K'}
      >
        <Search className="h-4 w-4" />
        Search
        <kbd className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          {isMac() ? '⌘K' : 'Ctrl K'}
        </kbd>
      </Button>

      {showHint && (
        <div
          role="status"
          data-testid="kbd-coachmark"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md"
        >
          <button
            type="button"
            aria-label="Dismiss"
            onClick={hideHint}
            className="absolute right-1.5 top-1.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="pr-4 font-medium text-foreground">Quick tip</p>
          <p className="mt-1 text-muted-foreground">
            Press {isMac() ? '⌘K' : 'Ctrl+K'} anywhere to search components, jump to a page, or run
            an action.
          </p>
        </div>
      )}
    </div>
  )
}
