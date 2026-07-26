import { Users, Info } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { Badge } from '../ui/badge'
import { useComponentEditors } from '../../hooks/useComponentEditors'
import type { ComponentEditors } from '../../lib/types'

/** Tooltip copy — spells out the live `canEditComponent` gate (CANNOT_EDIT_TITLE
 *  mirror) so readers understand each row's role badge(s), and that admins edit
 *  any component without being enumerated. */
const WHO_CAN_EDIT_TOOLTIP =
  "Each person below can edit this component for the role(s) shown: owner, release manager, security champion, or the owner's manager. Administrators can edit any component."

interface WhoCanEditPanelProps {
  componentId: string
}

const OWNER_ROLE = 'Owner'
const RELEASE_MANAGER_ROLE = 'Release manager'
const SECURITY_CHAMPION_ROLE = 'Security champion'
const OWNER_MANAGER_ROLE = "Owner's manager"

interface EditorEntry {
  /** First-seen casing/whitespace — used for display; later occurrences of the
   *  same person (by normalized key) only contribute a role, never re-spell it. */
  username: string
  roles: string[]
}

/**
 * Aggregates the editors projection into one row per distinct person with every
 * role that grants them edit access — instead of flattening owner/RM/SC/manager
 * into a single deduplicated name list, which loses *why* each person can edit
 * and (with naive string dedup) would show `Alice` / `alice` / ` alice ` as three
 * different people.
 *
 * Dedup key is `trim().toLowerCase()`, matching the backend's `canEditComponent`
 * matching rule (CRS `PermissionEvaluator.matches`: trimmed, case-insensitive).
 */
function aggregateEditors(editors: ComponentEditors | undefined): EditorEntry[] {
  if (!editors) return []
  const assignments: { username: string; role: string }[] = [
    ...(editors.componentOwner ? [{ username: editors.componentOwner, role: OWNER_ROLE }] : []),
    ...editors.releaseManagers.map((username) => ({ username, role: RELEASE_MANAGER_ROLE })),
    ...editors.securityChampions.map((username) => ({ username, role: SECURITY_CHAMPION_ROLE })),
    ...(editors.manager ? [{ username: editors.manager, role: OWNER_MANAGER_ROLE }] : []),
  ]

  const byKey = new Map<string, EditorEntry>()
  for (const { username, role } of assignments) {
    const key = username.trim().toLowerCase()
    const entry = byKey.get(key)
    if (entry) {
      if (!entry.roles.includes(role)) entry.roles.push(role)
    } else {
      byKey.set(key, { username, roles: [role] })
    }
  }
  return [...byKey.values()]
}

/**
 * Highlighted, read-only "who can edit" callout: one row per distinct person from
 * `GET /components/{id}/editors`, tagged with every role that grants them edit
 * access (Owner / Release manager / Security champion / Owner's manager). Shared
 * by the read-only header banner (ComponentDetailPage, shown when the viewer
 * lacks edit rights) and the General tab footer (shown to editors only). The two
 * render sites are mutually exclusive, so it never appears twice. Both sites
 * render it outside (or under a non-disabled) <fieldset>, so the tooltip trigger
 * button stays interactive. The query is deduped by react-query (shared
 * queryKey), so the dual mount across a session does not double-fetch.
 */
export function WhoCanEditPanel({ componentId }: WhoCanEditPanelProps) {
  const { data: editors, isLoading, isError } = useComponentEditors(componentId)
  const entries = aggregateEditors(editors)

  return (
    <div
      data-testid="who-can-edit"
      role="region"
      aria-labelledby="who-can-edit-heading"
      className="rounded-lg border border-primary/30 bg-primary/5 p-4"
    >
      <div className="flex items-center gap-1.5">
        <Users className="h-4 w-4 text-primary" aria-hidden="true" />
        <span id="who-can-edit-heading" className="text-sm font-medium">
          Who can edit this component
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="What “who can edit” means"
              className="inline-flex shrink-0 cursor-help rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:pointer-events-none"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-normal leading-snug">
            {WHO_CAN_EDIT_TOOLTIP}
          </TooltipContent>
        </Tooltip>
      </div>
      {isLoading ? (
        <p className="mt-1.5 text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        // Distinguish a failed /editors fetch from a genuinely empty list: this panel
        // is the read-only viewer's primary "who do I ask" cue, so a misleading
        // "(no people assigned)" on error is worse than an honest error message.
        <p className="mt-1.5 text-sm text-muted-foreground">
          Couldn't load the editor list — refresh to try again.
        </p>
      ) : entries.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {entries.map((entry) => (
            <li
              key={entry.username.trim().toLowerCase()}
              data-testid="editor-entry"
              className="flex flex-wrap items-center gap-1.5 text-sm text-foreground"
            >
              <span data-testid="editor-username">{entry.username}</span>
              {entry.roles.map((role) => (
                <Badge key={role} variant="secondary" className="font-normal">
                  {role}
                </Badge>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">(no people assigned)</p>
      )}
      {/* Admins can always edit — kept as always-visible text (not tooltip-only)
          so it survives on touch devices where the hover tooltip won't open. */}
      <p className="mt-1 text-xs text-muted-foreground">Administrators can also edit any component.</p>
    </div>
  )
}
