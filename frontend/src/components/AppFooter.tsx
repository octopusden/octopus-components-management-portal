import { useCrsInfo, usePortalInfo } from '@/hooks/useInfo'
import { AdminPane } from './AdminPane'

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

  return (
    <footer className="border-t bg-card mt-auto">
      <div className="max-w-screen-xl mx-auto px-4 h-9 flex items-center text-xs text-muted-foreground">
        {/* Stable left slot — when AdminPane is hidden (no IMPORT_DATA),
            this empty div keeps `ml-auto` working: the version label still
            hugs the right edge instead of collapsing to the left. */}
        <div className="flex items-center">
          <AdminPane />
        </div>
        <span className="ml-auto">
          {BRAND}
          {versions && ` (${versions})`}
        </span>
      </div>
    </footer>
  )
}
