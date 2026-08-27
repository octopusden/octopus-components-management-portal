import { Link, useLocation } from 'react-router'
import { Package, History, Settings, LogOut, AlertTriangle, ShieldCheck } from 'lucide-react'
import { cn, initials } from '../lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { usePortalInfo } from '@/hooks/useInfo'
import { useOpenFeedbackCount } from '@/hooks/useFeedback'
import { hasPermission, logout, PERMISSIONS } from '@/lib/auth'
import { AppFooter } from './AppFooter'
import { EmployeeIntegrationAlert } from './EmployeeIntegrationAlert'
import { OnboardingVideoButton } from './OnboardingVideoButton'
import { FeedbackButton } from './feedback/FeedbackButton'
import { AnnouncementsButton } from './announcements/AnnouncementsButton'
import { Badge } from './ui/badge'
import { StatusBanner } from './ui/status-banner'
import { useAdminMode } from '@/lib/adminModeStore'

interface LayoutProps {
  children: React.ReactNode
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  requires?: string
  // When set, the item is gated on adminMode being on in ADDITION to `requires`,
  // mirroring the ADMIN badge's double-gate. Used for admin-tooling entries
  // (Validations) that should stay hidden until the operator opts into admin mode.
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { href: '/components', label: 'Components', icon: Package },
  {
    href: '/validations',
    label: 'Validations',
    icon: ShieldCheck,
    requires: PERMISSIONS.IMPORT_DATA,
    adminOnly: true,
  },
  { href: '/audit', label: 'Audit', icon: History, requires: PERMISSIONS.ACCESS_AUDIT },
  { href: '/admin', label: 'Admin', icon: Settings, requires: PERMISSIONS.IMPORT_DATA },
]

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { data: user, isError } = useCurrentUser()
  const adminMode = useAdminMode((s) => s.enabled)
  // Environment banner (e.g. "TEST INSTANCE" on QA) so a non-prod instance is
  // unmistakable on every page. Comes from /portal/info (portal.environment-label
  // runtime config) — prod leaves it unset, the backend omits the key, and
  // nothing renders. The backend already collapses blank labels; trim() here is
  // defence-in-depth so a whitespace-only value from a drifted backend can
  // never render an empty banner strip ('' is falsy, so the && below skips it).
  const { data: portalInfo } = usePortalInfo()
  const environmentLabel = portalInfo?.environmentLabel?.trim()

  // Admin operators (admin mode armed + IMPORT_DATA) see a count of OPEN (not RESOLVED)
  // feedback on the Admin nav item, so pending reports are visible from any page. Only
  // fetched for that audience; everyone else skips the call.
  const isAdminOperator = adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA)
  const { data: openFeedback } = useOpenFeedbackCount(isAdminOperator)
  const openFeedbackCount = openFeedback?.open ?? 0

  // When /auth/me fails with a non-401 backend error, isError is true and `user` is
  // undefined. Don't hide admin/audit in that case — the user may be a valid admin;
  // the nav items remain clickable and the backend will still enforce authorization.
  // A visible banner tells the operator what's wrong.
  // adminOnly items keep their double-gate (adminMode + permission) even in the
  // fail-open path: an item the operator hasn't opted into via adminMode should
  // never appear just because the auth check errored. Permission/audit gates
  // still fail open (the server remains authoritative) as before.
  const visibleItems = navItems.filter((it) => {
    if (it.adminOnly && !(adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA))) return false
    if (isError) return true
    return !it.requires || hasPermission(user, it.requires)
  })

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        {/* Inside the sticky header (unlike EmployeeIntegrationAlert below it)
            so the environment strip stays visible while scrolling — the whole
            point is that a test stand can never be mistaken for prod. */}
        {environmentLabel && (
          <StatusBanner
            variant="warning"
            data-testid="environment-banner"
            className="rounded-none border-x-0 border-t-0 py-1.5 text-center font-semibold tracking-wide"
          >
            {environmentLabel}
          </StatusBanner>
        )}
        <div className="max-w-screen-xl mx-auto px-4 flex items-center h-14 gap-6">
          <span className="font-semibold text-foreground text-base tracking-tight mr-2">
            Components Registry
          </span>
          <nav className="flex items-center gap-1">
            {visibleItems.map(({ href, label, icon: Icon }) => {
              const isActive = location.pathname === href || location.pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  to={href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {href === '/admin' && isAdminOperator && openFeedbackCount > 0 && (
                    <span
                      data-testid="open-feedback-badge"
                      aria-label={`${openFeedbackCount} open feedback requests`}
                      title={`${openFeedbackCount} open feedback requests`}
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold leading-none text-destructive-foreground"
                    >
                      {openFeedbackCount > 99 ? '99+' : openFeedbackCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <AnnouncementsButton />
            <FeedbackButton />
            <OnboardingVideoButton />
            {/* ADMIN badge: double-gate — adminMode Zustand state AND real IMPORT_DATA
                permission. Without the permission check, any user could set adminMode=true
                in localStorage and see the badge without having admin rights. */}
            {adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA) && (
              <Badge variant="destructive">ADMIN</Badge>
            )}
            {isError && (
              <span
                className="flex items-center gap-1 text-destructive"
                title="Could not verify permissions with the backend"
              >
                <AlertTriangle className="h-4 w-4" />
                auth check failed
              </span>
            )}
            {user && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <span
                  aria-hidden
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground"
                >
                  {initials(user.username)}
                </span>
                {user.username}
              </span>
            )}
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>
      <EmployeeIntegrationAlert />
      <main className="flex-1 max-w-screen-xl w-full mx-auto px-6 py-6">{children}</main>
      <AppFooter />
    </div>
  )
}
