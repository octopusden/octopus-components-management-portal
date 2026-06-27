import { Shield, ShieldAlert } from 'lucide-react'
import { useAdminMode } from '@/lib/adminModeStore'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/**
 * Inline safety toggle at the top of the Migration tab that arms the destructive
 * Run actions below (components migration, history migration, TeamCity resync) and
 * the config Reload. It binds to the SAME `useAdminMode` store as the footer
 * AdminPane, so arming here, arming in the footer, and the ADMIN badge all stay in
 * sync — there is no second source of truth. Armed → those buttons enable with
 * destructive styling; disarmed → they stay disabled.
 */
export function AdminModeArmBar() {
  const armed = useAdminMode((s) => s.enabled)
  // Radix passes the next checked value; wire the explicit setter (not a toggle)
  // so it can never flip the wrong way — same pattern as AdminPane.
  const setArmed = useAdminMode((s) => s.set)

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3',
        armed ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/30',
      )}
      data-testid="admin-arm-bar"
    >
      <span
        className={cn(
          'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full',
          armed ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden
      >
        {armed ? <ShieldAlert className="h-[17px] w-[17px]" /> : <Shield className="h-[17px] w-[17px]" />}
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className={cn('text-sm font-semibold', armed && 'text-destructive')}>
          {armed ? 'Admin mode armed' : 'Admin mode disarmed'}
        </span>
        <span className="text-xs text-muted-foreground">
          {armed
            ? 'Destructive Run actions on this tab are enabled. Disarm when done.'
            : 'Arm to enable the destructive Run actions on this tab.'}
        </span>
      </div>
      <Switch checked={armed} onCheckedChange={setArmed} aria-label="Admin mode" />
    </div>
  )
}
