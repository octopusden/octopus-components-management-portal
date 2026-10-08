import { Link, useLocation } from 'react-router'
import { Package, History, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { usePortalInfo } from '@/hooks/useInfo'
import { useOpenFeedbackCount } from '@/hooks/useFeedback'
import { hasPermission, PERMISSIONS } from '@/lib/auth'
import { AppFooter } from './AppFooter'
import { EmployeeIntegrationAlert } from './EmployeeIntegrationAlert'
import { AnnouncementsButton } from './announcements/AnnouncementsButton'
import { HelpMenu } from './HelpMenu'
import { SearchCommandButton } from './SearchCommandButton'
import { GlobalSearchBox } from './GlobalSearchBox'
import { UserMenu } from './UserMenu'
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
}

// Sections only. Global search is a tool and sits with "Go to…" on the right (GlobalSearchBox);
// admin tooling (Admin settings, Validations) lives in the account menu (UserMenu); help and
// feedback in the "?" menu (HelpMenu).
const navItems: NavItem[] = [
  { href: '/components', label: 'Components', icon: Package, requires: PERMISSIONS.ACCESS_COMPONENTS },
  { href: '/audit', label: 'Audit', icon: History, requires: PERMISSIONS.ACCESS_AUDIT },
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
  // feedback on the account menu (a dot on the avatar, the number on "Admin settings"), so
  // pending reports are visible from any page. Only fetched for that audience.
  const isAdminOperator = adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA)
  const { data: openFeedback } = useOpenFeedbackCount(isAdminOperator)
  const openFeedbackCount = openFeedback?.open ?? 0

  // When /auth/me fails with a non-401 backend error, isError is true and `user` is
  // undefined. Don't hide gated entries in that case — the user may be a valid admin;
  // they remain clickable and the backend still enforces authorization. A visible
  // indicator tells the operator what's wrong.
  const visibleItems = navItems.filter((it) => isError || !it.requires || hasPermission(user, it.requires))
  // Global search is gated like the list: the endpoint needs ACCESS_COMPONENTS.
  const canSearch = isError || hasPermission(user, PERMISSIONS.ACCESS_COMPONENTS)

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
          <span className="font-semibold text-foreground text-base tracking-tight whitespace-nowrap">
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
                    // nowrap + shrink-0: a crowded header must never wrap a label onto two lines
                    // (which also squeezed its icon); it scrolls/overflows instead.
                    'flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1 text-sm">
            {/* Both work on every page, so their entry points live in the global header. */}
            <div className="mr-2 flex items-center gap-2">
              {/* The /search page has its own big field; a second one in the header would only compete. */}
              {canSearch && location.pathname !== '/search' && <GlobalSearchBox />}
              <SearchCommandButton hintEnabled={location.pathname === '/components'} />
            </div>
            <AnnouncementsButton />
            <HelpMenu />
            {isError && (
              <span
                className="flex items-center gap-1 px-1 text-destructive"
                title="Could not verify permissions with the backend"
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="sr-only md:not-sr-only">auth check failed</span>
              </span>
            )}
            <UserMenu user={user} authError={isError} openFeedbackCount={openFeedbackCount} />
          </div>
        </div>
      </header>
      <EmployeeIntegrationAlert />
      <main className="flex-1 max-w-screen-xl w-full mx-auto px-6 py-6">{children}</main>
      <AppFooter />
    </div>
  )
}
