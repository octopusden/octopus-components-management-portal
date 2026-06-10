import { Users, Info } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { useComponentEditors } from '../../hooks/useComponentEditors'

/** Tooltip copy — spells out the live `canEditComponent` gate (CANNOT_EDIT_TITLE
 *  mirror) so readers understand the list is owner + RMs + SCs, and that admins
 *  edit any component without being enumerated. */
const WHO_CAN_EDIT_TOOLTIP =
  'The component owner, its release managers, and its security champions can edit this component. Administrators can edit any component.'

interface WhoCanEditPanelProps {
  componentId: string
}

/**
 * Highlighted, read-only "who can edit" callout: the deduplicated owner + release
 * managers + security champions from `GET /components/{id}/editors`. Shared by the
 * read-only header banner (ComponentDetailPage, shown when the viewer lacks edit
 * rights) and the General tab footer (shown to editors only). The two render sites
 * are mutually exclusive, so it never appears twice. Both sites render it outside
 * (or under a non-disabled) <fieldset>, so the tooltip trigger button stays
 * interactive. The query is deduped by react-query (shared queryKey), so the
 * dual mount across a session does not double-fetch.
 */
export function WhoCanEditPanel({ componentId }: WhoCanEditPanelProps) {
  const { data: editors, isLoading } = useComponentEditors(componentId)

  const people = [
    editors?.componentOwner,
    ...(editors?.releaseManagers ?? []),
    ...(editors?.securityChampions ?? []),
  ].filter((p): p is string => !!p)
  const unique = [...new Set(people)]

  return (
    <div
      data-testid="who-can-edit"
      className="rounded-lg border border-primary/30 bg-primary/5 p-4"
    >
      <div className="flex items-center gap-1.5">
        <Users className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-medium">Who can edit this component</span>
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
      <p className="mt-1.5 text-sm text-foreground">
        {isLoading
          ? 'Loading…'
          : unique.length > 0
            ? unique.join(', ')
            : '(no people assigned)'}
      </p>
    </div>
  )
}
