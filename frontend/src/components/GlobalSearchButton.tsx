import { Link } from 'react-router'
import { Search } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * Header entry to Global search (/search). It is a tool, not a section, so it sits in the
 * right-hand group next to "Go to…" rather than in the nav; it looks like a search field so it
 * reads differently from the palette button. Narrow screens get just the magnifier.
 */
export function GlobalSearchButton({ active }: { active: boolean }) {
  return (
    <Link
      to="/search"
      aria-label="Global search"
      title="Global search — searches every component's configuration"
      data-spotlight="as-code-search"
      className={cn(
        'flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-input px-2.5 text-sm transition-colors md:w-52 md:px-3',
        active
          ? 'bg-accent text-accent-foreground'
          : 'bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="hidden md:inline">Global search…</span>
    </Link>
  )
}
