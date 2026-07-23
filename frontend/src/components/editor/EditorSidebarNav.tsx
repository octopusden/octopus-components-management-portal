import { AlertTriangle } from 'lucide-react'
import { TabsList, TabsTrigger } from '../ui/tabs'
import { cn } from '../../lib/utils'

/** One selectable section in the editor sidebar. `value` is the Radix tab
 *  identifier — it MUST match the page's tab values so the controlled
 *  activeTab state and the server-error auto-switch keep working unchanged. */
export interface EditorNavItem {
  value: string
  label: string
  /** Per-section count badge (e.g. VCS entries). Rendered only when > 0. */
  count?: number
  /** Problem-count badge (e.g. TeamCity/Unregistered Release findings). When
   *  > 0, the item renders with the same destructive/red treatment (warning
   *  icon + red count badge) as the pinned `problems` entry used to — but
   *  scoped to this individual item instead of a single sidebar-wide slot. */
  problemCount?: number
}

/** A labelled group of items in the sidebar (spec §2.1 grouping). */
export interface EditorNavSection {
  label: string
  items: EditorNavItem[]
}

/** The conditional, destructive-styled Validation Problems entry, pinned at
 *  the top of the sidebar. `null`/absent → not rendered (admin-only + has-problems
 *  gating stays in the page, same as before). */
export interface EditorNavProblems {
  value: string
  label: string
  count: number
}

function CountBadge({ count, tone }: { count: number; tone: 'muted' | 'destructive' }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'ml-auto rounded-full px-1.5 text-xs',
        tone === 'destructive'
          ? 'bg-destructive/15 text-destructive'
          : 'bg-muted-foreground/20',
      )}
    >
      {count}
    </span>
  )
}

/**
 * Grouped left-navigation for the Component Detail editor. Renders the Radix
 * TabsList as a sticky vertical sidebar (spec §2.1) — the page owns the
 * <Tabs value/onValueChange> wrapper and the TabsContent panels, so selection,
 * deep-linking, the parseServerFieldErrors auto-switch, and keyboard roving
 * focus all remain Radix-native and unchanged. This component is layout only.
 *
 * `activeValue` is passed in (Radix doesn't expose the controlled value to
 * children) purely so each item can advertise aria-current="page" for the
 * navigation landmark; selection itself is still driven by data-state.
 */
export function EditorSidebarNav({
  sections,
  problems,
  activeValue,
}: {
  sections: EditorNavSection[]
  problems?: EditorNavProblems | null
  activeValue?: string
}) {
  // The page's <Tabs variant="underline"> makes TabsTrigger inject
  // `-mb-px border-b-2 border-transparent` (the underline strip styling). cn()
  // appends this className last, so twMerge lets `mb-0 border-b-0` neutralise
  // those for the vertical sidebar item shape.
  const itemClass =
    'group flex w-full items-center gap-2 mb-0 rounded-md border-b-0 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground'

  return (
    <TabsList
      aria-label="Component sections"
      className="sticky top-20 flex h-fit w-full flex-col items-stretch gap-0.5 self-start border-0 bg-transparent p-0 lg:w-56"
    >
      {problems && (
        <TabsTrigger
          value={problems.value}
          aria-current={activeValue === problems.value ? 'page' : undefined}
          className={cn(
            itemClass,
            'mb-1 text-destructive hover:text-destructive hover:bg-destructive/10 data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive',
          )}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <span className="truncate">{problems.label}</span>
          <CountBadge count={problems.count} tone="destructive" />
        </TabsTrigger>
      )}

      {sections.map((section) => (
        <div key={section.label} className="mt-2 first:mt-0">
          <div className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            {section.label}
          </div>
          {section.items.map((item) => {
            const hasProblem = (item.problemCount ?? 0) > 0
            return (
              <TabsTrigger
                key={item.value}
                value={item.value}
                aria-current={activeValue === item.value ? 'page' : undefined}
                className={cn(
                  itemClass,
                  hasProblem &&
                    'text-destructive hover:text-destructive hover:bg-destructive/10 data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive',
                )}
              >
                {hasProblem && (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                )}
                <span className="truncate">{item.label}</span>
                {hasProblem ? (
                  <CountBadge count={item.problemCount ?? 0} tone="destructive" />
                ) : (
                  <CountBadge count={item.count ?? 0} tone="muted" />
                )}
              </TabsTrigger>
            )
          })}
        </div>
      ))}
    </TabsList>
  )
}
