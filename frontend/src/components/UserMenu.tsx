import { Link } from 'react-router'
import { LogOut, Settings, ShieldCheck } from 'lucide-react'
import { cn, initials } from '../lib/utils'
import { hasPermission, logout, PERMISSIONS, type User } from '@/lib/auth'
import { useAdminMode } from '@/lib/adminModeStore'
import { Badge } from './ui/badge'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

interface UserMenuProps {
  user: User | null | undefined
  /** /auth/me failed with a backend error: admin entries fail open (the server still authorizes). */
  authError: boolean
  /** OPEN feedback count, shown to admin operators (admin mode armed + IMPORT_DATA). */
  openFeedbackCount: number
}

/**
 * Header account menu (avatar trigger): who you are, the Admin mode item, the admin tooling
 * pages (Admin settings, Validations) and Log out. The admin pages moved here from the top nav,
 * which now carries only the everyday destinations.
 *
 * Gates mirror the old nav: Admin settings needs IMPORT_DATA (failing open on an auth backend
 * error); Validations keeps its double gate (admin mode armed + real IMPORT_DATA) even then.
 */
export function UserMenu({ user, authError, openFeedbackCount }: UserMenuProps) {
  const adminMode = useAdminMode((s) => s.enabled)
  // Radix hands over the next checked value: write it, rather than toggling, so a
  // same-state callback can never flip the mode.
  const setAdminMode = useAdminMode((s) => s.set)
  const canImport = hasPermission(user, PERMISSIONS.IMPORT_DATA)
  const isAdminOperator = adminMode && canImport
  const showAdminSettings = authError || canImport
  const showValidations = isAdminOperator
  const showFeedbackCount = isAdminOperator && openFeedbackCount > 0
  const countLabel = openFeedbackCount > 99 ? '99+' : String(openFeedbackCount)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={user ? `Account: ${user.username}` : 'Account'}
          title={user?.username}
          className="relative flex h-9 items-center gap-2 rounded-full pl-0.5 pr-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <span
            aria-hidden
            data-testid="user-avatar"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground"
          >
            {user ? initials(user.username) : '?'}
          </span>
          {isAdminOperator && <Badge variant="destructive">ADMIN</Badge>}
          {showFeedbackCount && (
            <span
              data-testid="open-feedback-dot"
              aria-label={`${openFeedbackCount} open feedback requests`}
              className="absolute left-6 top-0 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card"
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        {user && <DropdownMenuLabel className="truncate">{user.username}</DropdownMenuLabel>}
        {canImport && (
          // A checkbox item, so the arrow keys reach it like the other rows; selecting it
          // (click, Enter, Space) flips the mode and keeps the menu open.
          <DropdownMenuCheckboxItem
            checked={adminMode}
            onCheckedChange={setAdminMode}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="flex-1">Admin mode</span>
            <span
              aria-hidden
              data-state={adminMode ? 'checked' : 'unchecked'}
              className={cn(
                'inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors',
                adminMode ? 'bg-primary' : 'bg-muted-foreground/25',
              )}
            >
              <span
                className={cn(
                  'block h-4 w-4 rounded-full bg-background shadow-sm transition-transform',
                  adminMode ? 'translate-x-4' : 'translate-x-0',
                )}
              />
            </span>
          </DropdownMenuCheckboxItem>
        )}
        {(showAdminSettings || showValidations) && <DropdownMenuSeparator />}
        {showAdminSettings && (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <Settings />
              Admin settings
              {showFeedbackCount && (
                <span
                  data-testid="open-feedback-badge"
                  aria-label={`${openFeedbackCount} open feedback requests`}
                  title={`${openFeedbackCount} open feedback requests`}
                  className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold leading-none text-destructive-foreground"
                >
                  {countLabel}
                </span>
              )}
            </Link>
          </DropdownMenuItem>
        )}
        {showValidations && (
          <DropdownMenuItem asChild>
            <Link to="/validations">
              <ShieldCheck />
              Validations
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
