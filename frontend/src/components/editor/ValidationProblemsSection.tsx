import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { Separator } from '../ui/separator'
import { InlineError } from '../ui/inline-error'
import { SkeletonBlock } from '../ui/skeleton-block'
import { ValidationProblemsList } from '../ValidationProblemsList'
import { useComponentValidation } from '../../hooks/useValidationProblems'
import { hasValidationIssue } from '../../lib/validation'

interface ValidationProblemsSectionProps {
  /** CRS component id / key (ComponentDetail.id == ComponentDetail.name). */
  componentId: string
  /**
   * Whether the current user is an admin (adminMode AND IMPORT_DATA). The
   * section renders — and fetches — only for admins; a non-admin gets nothing
   * and issues no `/portal/validation` request (the hook is gated on `enabled`).
   */
  isAdmin: boolean
}

/**
 * Admin-only "Validation Problems" section on the component detail page. Fetches
 * the LIVE per-component result via GET /portal/validation/components/{id} and
 * renders the full problem list (every problem + complete versions, scrollable)
 * or a clean "No validation problems" state when empty.
 *
 * A failed check is surfaced honestly via {@link ValidationProblemsList} (a
 * "could not verify" block, never rendered as clean). No host/URL is shown —
 * only versions, messages, severities and categories.
 */
export function ValidationProblemsSection({ componentId, isAdmin }: ValidationProblemsSectionProps) {
  // Non-admins: render nothing AND make no fetch (hook disabled below).
  const query = useComponentValidation(componentId, isAdmin)
  if (!isAdmin) return null

  const validation = query.data

  return (
    <section aria-labelledby="validation-problems-heading" className="space-y-3">
      <div>
        <h2
          id="validation-problems-heading"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <AlertTriangle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          Validation Problems
        </h2>
        <p className="text-sm text-muted-foreground">
          Released versions checked against the registry. Admin-only.
        </p>
      </div>
      <Separator />

      {query.isLoading ? (
        <SkeletonBlock height="h-24" width="w-full" />
      ) : query.isError ? (
        <InlineError
          message={
            <>
              Failed to load validation problems:{' '}
              {query.error instanceof Error ? query.error.message : String(query.error)}
            </>
          }
        />
      ) : validation && hasValidationIssue(validation) ? (
        <ValidationProblemsList validation={validation} />
      ) : (
        <div className="flex items-center gap-2 rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          No validation problems.
        </div>
      )}
    </section>
  )
}
