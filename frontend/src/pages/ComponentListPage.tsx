import { useMemo, useState } from 'react'
import { Layout } from '../components/Layout'
import { ComponentFilters } from '../components/ComponentFilters'
import { ComponentTable } from '../components/ComponentTable'
import { Pagination } from '../components/Pagination'
import { CreateComponentButton } from '../components/CreateComponentDialog'
import { CreateComponentDialog } from '../components/CreateComponentDialog'
import { InlineError } from '../components/ui/inline-error'
import { useComponents } from '../hooks/useComponents'
import {
  useValidationProblems,
  useComponentsWithProblems,
} from '../hooks/useValidationProblems'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { hasPermission, PERMISSIONS } from '@/lib/auth'
import { useAdminMode } from '@/lib/adminModeStore'
import { ApiError } from '../lib/api'
import type { ComponentFilter, ComponentSummary } from '../lib/types'

// Build a minimal ComponentSummary row for a component that exists only in the
// validation report (problemsOnly mode). The validation report keys by CRS
// component id, which equals ComponentSummary.name AND the detail-route id, so
// the Name column links correctly; the other columns render em-dash placeholders.
function summaryFromValidationKey(componentKey: string): ComponentSummary {
  return {
    id: componentKey,
    name: componentKey,
    displayName: null,
    componentOwner: null,
    system: null,
    productType: null,
    archived: false,
    updatedAt: null,
    labels: [],
  }
}

export function ComponentListPage() {
  const [filter, setFilter] = useState<ComponentFilter>({ archived: false })
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  // "Only with problems" mode — driven by the Portal validation report, not a
  // CRS query param (problems are computed in Portal, the CRS list is paged).
  const [problemsOnly, setProblemsOnly] = useState(false)
  // Source component id for the per-row Copy action; non-null = dialog open.
  const [copySourceId, setCopySourceId] = useState<string | null>(null)

  const { data: user } = useCurrentUser()
  const { data, isLoading, error } = useComponents({ filter, page, size })

  // The Validation Problems facility is admin-mode only (a maintainer concern).
  // Reuse the app's canonical admin-mode predicate (same double-gate as
  // Layout.tsx's ADMIN badge): the persisted adminMode toggle AND the real
  // IMPORT_DATA permission — so flipping adminMode in localStorage without the
  // permission grants nothing.
  const adminMode = useAdminMode((s) => s.enabled)
  const isAdmin = adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA)

  // Effective problems-only mode: the toggle only takes effect for admins. If
  // admin mode is turned off while the toggle was on, the page falls back to the
  // normal paged list rather than getting stuck on an empty/forbidden view.
  const showProblemsOnly = problemsOnly && isAdmin

  // Full report → badge overlay on the normal paged list (toggle off). Gated on
  // isAdmin so non-admin users issue no /portal/validation request.
  const validation = useValidationProblems(isAdmin)
  // Problem-bearing set → the list source when the toggle is on. Only fetched
  // while admin AND the toggle is on, so non-admins / toggle-off pages don't
  // pay for it.
  const problems = useComponentsWithProblems(showProblemsOnly)

  // The component keys-with-problems list, rendered as minimal rows.
  const problemRows = useMemo<ComponentSummary[]>(
    () => Array.from(problems.byComponent.keys()).sort().map(summaryFromValidationKey),
    [problems.byComponent],
  )

  const canCreate = hasPermission(user, PERMISSIONS.CREATE_COMPONENTS)

  const handleFilterChange = (newFilter: ComponentFilter) => {
    setFilter(newFilter)
    setPage(0) // reset to first page on filter change
  }

  const handleSizeChange = (newSize: number) => {
    setSize(newSize)
    setPage(0)
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Components</h1>
            {showProblemsOnly
              ? !problems.isLoading && (
                  <span className="text-sm text-muted-foreground">
                    {problemRows.length} with problems
                  </span>
                )
              : data && (
                  <span className="text-sm text-muted-foreground">
                    {data.totalElements} total
                  </span>
                )}
          </div>
          {canCreate && <CreateComponentButton />}
        </div>

        <ComponentFilters
          filter={filter}
          onFilterChange={handleFilterChange}
          problemsOnly={showProblemsOnly}
          // Found-count shown beside the problems-only hint, mirroring how a
          // normal search shows its result count. Only meaningful in
          // problems-only mode and once the report has loaded; undefined
          // otherwise (so the hint renders without a count while loading).
          problemsCount={showProblemsOnly && !problems.isLoading ? problemRows.length : undefined}
          // Admin-mode only: pass the handler (which is what renders the toggle)
          // solely to admins. Non-admins get no "with validation problems" toggle.
          onProblemsOnlyChange={
            isAdmin
              ? (v) => {
                  setProblemsOnly(v)
                  setPage(0)
                }
              : undefined
          }
        />

        {/* The validation report is a scheduled Portal sweep; when its most
            recent refresh failed the held data may be stale. Surface that so a
            stale report is never silently read as "all clean". Admin-only (the
            report is only fetched for admins). */}
        {isAdmin && validation.refreshError && (
          <InlineError
            message={
              <>
                Validation report may be stale — last refresh failed: {validation.refreshError}.
                Check that the validation service URLs (components-registry / release-management)
                are configured and reachable over https.
              </>
            }
          />
        )}

        {error && !showProblemsOnly && (
          <InlineError
            message={
              error instanceof ApiError && error.status === 403 ? (
                <>You do not have permission to view components. Contact your administrator.</>
              ) : (
                <>
                  Failed to load components: {error instanceof Error ? error.message : String(error)}
                </>
              )
            }
          />
        )}

        {showProblemsOnly && problems.isError && (
          <InlineError
            message={
              <>
                Failed to load validation problems:{' '}
                {problems.error instanceof Error
                  ? problems.error.message
                  : String(problems.error)}
              </>
            }
          />
        )}

        <ComponentTable
          data={showProblemsOnly ? problemRows : (data?.content ?? [])}
          isLoading={showProblemsOnly ? problems.isLoading : isLoading}
          onCopy={canCreate ? setCopySourceId : undefined}
          // Overlay map (admin-mode only): in problems-only mode use the
          // problem-set report; in the normal paged view use the full report.
          // Undefined for non-admins or an empty/failed report → no Validation
          // column at all.
          validationByComponent={
            !isAdmin
              ? undefined
              : showProblemsOnly
                ? problems.byComponent
                : validation.byComponent.size > 0
                  ? validation.byComponent
                  : undefined
          }
        />

        {/* One dialog per page (not per row); keyed by source id so each
            Create-similar click gets a fresh fetch + prefill. */}
        {copySourceId && (
          <CreateComponentDialog
            key={copySourceId}
            sourceId={copySourceId}
            open
            onOpenChange={(open) => {
              if (!open) setCopySourceId(null)
            }}
          />
        )}

        {/* Pagination only in the normal paged view. "with validation problems"
            is the full non-paged report set, so it renders without a pager. */}
        {!showProblemsOnly && data && data.totalElements > 0 && (
          <Pagination
            page={page}
            totalPages={data.totalPages}
            totalElements={data.totalElements}
            size={size}
            onPageChange={setPage}
            onSizeChange={handleSizeChange}
          />
        )}
      </div>
    </Layout>
  )
}
