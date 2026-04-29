import { useAdminMode } from '@/lib/adminModeStore'
import { hasPermission, PERMISSIONS } from '@/lib/auth'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Switch } from './ui/switch'
import { Label } from './ui/label'

const SWITCH_ID = 'admin-mode-toggle'

export function AdminPane() {
  const { data: user } = useCurrentUser()
  const enabled = useAdminMode((s) => s.enabled)
  // Wire onCheckedChange directly to the explicit setter rather than to a
  // blind toggle. Radix passes the next checked value as the argument; if
  // we toggled the previous state we'd flip in the wrong direction on any
  // same-state callback (programmatic state sync, double-fire, dev-mode
  // StrictMode double-invoke).
  const setEnabled = useAdminMode((s) => s.set)

  if (!hasPermission(user, PERMISSIONS.IMPORT_DATA)) return null

  return (
    <div className="flex items-center gap-2">
      <Switch id={SWITCH_ID} checked={enabled} onCheckedChange={setEnabled} aria-label="Admin mode" />
      <Label htmlFor={SWITCH_ID} className="text-xs cursor-pointer">
        Admin mode
      </Label>
    </div>
  )
}
