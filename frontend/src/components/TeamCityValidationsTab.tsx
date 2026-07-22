import { EmptyState } from './ui/empty-state'
import { Badge } from './ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip'
import { TeamCityIcon } from './ui/icons/brand-icons'
import { cn, safeHttpUrl } from '../lib/utils'
import type { TeamcityProject } from '../lib/types'
import {
  getTeamCityValidationStatusTone,
  getTeamCityValidationTypeInfo,
  type TeamCityValidationTone,
} from '../lib/teamcityValidationTypes'

interface TeamCityValidationsTabProps {
  teamcityProjects: TeamcityProject[]
}

// Whole-card tint by tone: destructive (failed) reads red, warning reads
// yellow, success/default stay neutral so only genuine problems draw the eye.
const TONE_CARD_CLASS: Record<TeamCityValidationTone, string> = {
  default: 'border',
  destructive: 'border border-destructive/40 bg-destructive/10',
  warning: 'border border-[color:var(--color-badge-yellow-fg)]/40 bg-[color:var(--color-amber-50)]',
  success: 'border',
}

/**
 * Read-only "Validations > TeamCity" panel — the per-component surface for
 * findings from the admin-triggered TeamCity validation sweep (see
 * TeamCityValidationPanel / the top-level Validations page for the
 * registry-wide view). Groups this component's `teamcityProjects[].validations`
 * by project; each finding renders as its own card. Distinct from
 * ValidationProblemsList, which covers the unrelated registered-version
 * validation facility.
 */
export function TeamCityValidationsTab({ teamcityProjects }: TeamCityValidationsTabProps) {
  const projectsWithFindings = teamcityProjects.filter((p) => (p.validations ?? []).length > 0)

  if (projectsWithFindings.length === 0) {
    return <EmptyState message="No TeamCity validation findings for this component." className="py-8" />
  }

  return (
    <div className="space-y-6">
      {projectsWithFindings.map((project) => {
        const url = safeHttpUrl(project.projectUrl ?? null)
        return (
          <div key={project.id} className="space-y-6">
            {url ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`TeamCity: ${project.projectId}`}
                    aria-label={`TeamCity: ${project.projectId}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold font-mono text-primary hover:underline"
                  >
                    <TeamCityIcon className="h-4 w-4 shrink-0" />
                    {project.projectId}
                  </a>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs break-all">{url}</TooltipContent>
              </Tooltip>
            ) : (
              <h3 className="text-sm font-semibold font-mono text-muted-foreground">
                {project.projectId}
              </h3>
            )}
            <div className="space-y-4">
              {project.validations.map((v, i) => {
                const tone = getTeamCityValidationStatusTone(v.status)
                const info = getTeamCityValidationTypeInfo(v.type)
                return (
                  // Index-prefixed key — findings have no server id on this shape.
                  <div
                    key={`${i}-${v.type}`}
                    className={cn('rounded-md p-4 space-y-2.5', TONE_CARD_CLASS[tone])}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{info.label}</span>
                      <Badge variant={tone} className="uppercase tracking-wide">
                        {v.status}
                      </Badge>
                    </div>
                    {/* Findings messages may contain literal "\n" line breaks —
                        whitespace-pre-wrap renders them instead of collapsing to
                        one line, while still wrapping long lines normally. */}
                    {v.message && <div className="text-sm whitespace-pre-wrap">{v.message}</div>}
                    {info.description && (
                      <div className="text-xs text-muted-foreground">{info.description}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
