import { Link, useLocation } from 'react-router'
import { Package, History, Settings, LogOut, User as UserIcon, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { hasPermission, logout, PERMISSIONS } from '@/lib/auth'

interface LayoutProps {
  children: React.ReactNode
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  requires?: string
}

const navItems: NavItem[] = [
  { href: '/components', label: 'Components', icon: Package },
  { href: '/audit', label: 'Audit', icon: History, requires: PERMISSIONS.ACCESS_AUDIT },
  { href: '/admin', label: 'Admin', icon: Settings, requires: PERMISSIONS.IMPORT_DATA },
]

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { data: user, isError } = useCurrentUser()

  // When /auth/me fails with a non-401 backend error, isError is true and `user` is
  // undefined. Don't hide admin/audit in that case — the user may be a valid admin;
  // the nav items remain clickable and the backend will still enforce authorization.
  // A visible banner tells the operator what's wrong.
  const visibleItems = isError
    ? navItems
    : navItems.filter((it) => !it.requires || hasPermission(user, it.requires))

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
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
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
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
              <span className="flex items-center gap-1 text-muted-foreground">
                <UserIcon className="h-4 w-4" />
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
      <main className="max-w-screen-xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
