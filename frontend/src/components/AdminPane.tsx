import { useAdminMode } from '@/lib/adminModeStore'
import { hasPermission, PERMISSIONS } from '@/lib/auth'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Switch } from './ui/switch'
import { Label } from './ui/label'

const SWITCH_ID = 'admin-mode-toggle'

export function AdminPane() {
  const { data: user } = useCurrentUser()
  const enabled = useAdminMode((s) => s.enabled)
  const toggle = useAdminMode((s) => s.toggle)

  if (!hasPermission(user, PERMISSIONS.IMPORT_DATA)) return null

  return (
    <div className="flex items-center gap-2">
      <Switch id={SWITCH_ID} checked={enabled} onCheckedChange={toggle} aria-label="Admin mode" />
      <Label htmlFor={SWITCH_ID} className="text-xs cursor-pointer">
        Admin mode
      </Label>
    </div>
  )
}
