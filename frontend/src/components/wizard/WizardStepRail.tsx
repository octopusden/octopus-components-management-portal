import { AlertCircle, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export type StepStatus = 'invalid' | 'active' | 'done' | 'todo'

export interface RailStep<Id extends string> {
  id: Id
  label: string
  subtitle: string
  status: StepStatus
  /** The step on screen. Separate from [status]: the current step can also be `invalid`. */
  current: boolean
}

/** The Create component wizard's vertical step list. Which steps are reachable is the caller's call. */
export function WizardStepRail<Id extends string>({
  steps,
  onSelect,
}: {
  steps: readonly RailStep<Id>[]
  onSelect: (id: Id) => void
}) {
  return (
    <nav aria-label="Wizard steps" className="flex w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-card p-4">
      {steps.map((step, i) => {
        const active = step.current
        const invalid = step.status === 'invalid'
        const done = step.status === 'done'
        // Announce the icon-only status to assistive tech (the circle is aria-hidden). `active` is
        // already conveyed by aria-current="step".
        const statusText = invalid ? 'has errors' : done ? 'completed' : null
        return (
          <button
            key={step.id}
            type="button"
            aria-label={step.label}
            aria-describedby={statusText ? `step-status-${step.id}` : undefined}
            data-status={step.status}
            onClick={() => onSelect(step.id)}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
              active ? 'bg-muted font-medium' : 'hover:bg-muted',
              invalid && 'text-destructive',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs',
                invalid
                  ? 'border-destructive/50 text-destructive'
                  : active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : done
                      ? 'border-emerald-600/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                      : 'border-border text-muted-foreground',
              )}
            >
              {invalid ? <AlertCircle className="h-3.5 w-3.5" /> : done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="flex flex-col">
              <span>{step.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{step.subtitle}</span>
            </span>
            {statusText && (
              <span id={`step-status-${step.id}`} className="sr-only">
                {statusText}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
