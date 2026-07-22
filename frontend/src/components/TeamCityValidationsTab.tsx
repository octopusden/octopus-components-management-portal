import { EmptyState } from './ui/empty-state'
import { cn } from '../lib/utils'
import type { TeamcityProject } from '../lib/types'
import {
  getTeamCityValidationStatusTone,
  getTeamCityValidationTypeInfo,
} from '../lib/teamcityValidationTypes'

interface TeamCityValidationsTabProps {
  teamcityProjects: TeamcityProject[]
}

type Tone = 'default' | 'destructive' | 'warning' | 'success'

// Whole-card tint by tone: destructive (failed) reads red, warning reads
// amber/yellow, success/default stay neutral so only genuine problems draw
// the eye.
const TONE_CARD_CLASS: Record<Tone, string> = {
  default: 'border',
  destructive: 'border border-destructive/40 bg-destructive/10',
  warning: 'border border-[color:var(--color-badge-yellow-fg)]/40 bg-[color:var(--color-badge-yellow-bg)]',
  success: 'border',
}

const TONE_BADGE_CLASS: Record<Tone, string> = {
  default: 'bg-muted text-muted-foreground',
  destructive: 'bg-destructive/15 text-destructive',
  warning: 'bg-[color:var(--color-badge-yellow-bg)] text-[color:var(--color-badge-yellow-fg)]',
  success: 'bg-[color:var(--color-badge-green-bg)] text-[color:var(--color-badge-green-fg)]',
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
      {projectsWithFindings.map((project) => (
        <div key={project.id} className="space-y-2">
          <h3 className="text-sm font-semibold font-mono text-muted-foreground">{project.projectId}</h3>
          <div className="space-y-2">
            {project.validations.map((v, i) => {
              const tone = getTeamCityValidationStatusTone(v.status)
              const info = getTeamCityValidationTypeInfo(v.type)
              return (
                // Index-prefixed key — findings have no server id on this shape.
                <div
                  key={`${i}-${v.type}`}
                  className={cn('rounded-md p-3 space-y-1.5', TONE_CARD_CLASS[tone])}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{info.label}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
                        TONE_BADGE_CLASS[tone],
                      )}
                    >
                      {v.status}
                    </span>
                  </div>
                  {v.message && <div className="text-sm">{v.message}</div>}
                  {info.description && (
                    <div className="text-xs text-muted-foreground">{info.description}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
