import { useCrsInfo, usePortalInfo } from '@/hooks/useInfo'
import { useUiOverlay } from '@/lib/uiOverlayStore'

const BRAND = 'Components Registry by F1 team'

function buildVersionsLabel(portalVersion?: string, crsVersion?: string): string | null {
  if (portalVersion && crsVersion) return `portal ${portalVersion} · service ${crsVersion}`
  if (portalVersion) return `portal ${portalVersion}`
  if (crsVersion) return `service ${crsVersion}`
  return null
}

export function AppFooter() {
  const portal = usePortalInfo()
  const crs = useCrsInfo()
  const versions = buildVersionsLabel(portal.data?.version, crs.data?.version)
  const openShortcuts = useUiOverlay((s) => s.openShortcuts)

  return (
    <footer className="border-t bg-card mt-auto">
      <div className="max-w-screen-xl mx-auto px-4 h-9 flex items-center gap-4 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={openShortcuts}
          className="ml-auto hover:text-foreground hover:underline"
        >
          Keyboard shortcuts
        </button>
        <span>
          {BRAND}
          {versions && ` (${versions})`}
        </span>
      </div>
    </footer>
  )
}
