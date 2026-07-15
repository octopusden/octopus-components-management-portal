import { Users, Info } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { useComponentEditors } from '../../hooks/useComponentEditors'

/** Tooltip copy — spells out the live `canEditComponent` gate (CANNOT_EDIT_TITLE
 *  mirror) so readers understand the list is owner + RMs + SCs + the owner's
 *  manager, and that admins edit any component without being enumerated. */
const WHO_CAN_EDIT_TOOLTIP =
  "The component owner, its release managers, its security champions, and the owner's manager can edit this component. Administrators can edit any component."

interface WhoCanEditPanelProps {
  componentId: string
}

/**
 * Highlighted, read-only "who can edit" callout: the deduplicated owner + release
 * managers + security champions + the owner's manager from `GET /components/{id}/editors`.
 * Shared by the read-only header banner (ComponentDetailPage, shown when the viewer lacks
 * edit rights) and the General tab footer (shown to editors only). The two render sites
 * are mutually exclusive, so it never appears twice. Both sites render it outside
 * (or under a non-disabled) <fieldset>, so the tooltip trigger button stays
 * interactive. The query is deduped by react-query (shared queryKey), so the
 * dual mount across a session does not double-fetch.
 */
export function WhoCanEditPanel({ componentId }: WhoCanEditPanelProps) {
  const { data: editors, isLoading, isError } = useComponentEditors(componentId)

  const people = [
    editors?.componentOwner,
    ...(editors?.releaseManagers ?? []),
    ...(editors?.securityChampions ?? []),
    editors?.manager,
  ].filter((p): p is string => !!p)
  const unique = [...new Set(people)]

  // Distinguish a failed /editors fetch from a genuinely empty list: this panel
  // is the read-only viewer's primary "who do I ask" cue, so a misleading
  // "(no people assigned)" on error is worse than an honest error message.
  const peopleLine = isLoading
    ? 'Loading…'
    : isError
      ? "Couldn't load the editor list — refresh to try again."
      : unique.length > 0
        ? unique.join(', ')
        : '(no people assigned)'
  const muted = isLoading || isError || unique.length === 0

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
      <p className={`mt-1.5 text-sm ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>
        {peopleLine}
      </p>
      {/* Admins can always edit — kept as always-visible text (not tooltip-only)
          so it survives on touch devices where the hover tooltip won't open. */}
      <p className="mt-1 text-xs text-muted-foreground">Administrators can also edit any component.</p>
    </div>
  )
}
