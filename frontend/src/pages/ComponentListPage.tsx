import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Layout } from '../components/Layout'
import { ComponentFilters } from '../components/ComponentFilters'
import { ComponentTable } from '../components/ComponentTable'
import { ListPresetBar } from '../components/ListPresetBar'
import { ActiveFilterChips } from '../components/ActiveFilterChips'
import { Pagination } from '../components/Pagination'
import { CreateComponentButton } from './CreateComponentPage'
import { SearchCommandButton } from '../components/SearchCommandButton'
import { InlineError } from '../components/ui/inline-error'
import { StatusBanner } from '../components/ui/status-banner'
import { useComponents } from '../hooks/useComponents'
import {
  useValidationProblems,
  useComponentsWithProblems,
} from '../hooks/useValidationProblems'
import { useTeamCityValidations } from '../hooks/useTeamCityValidations'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { hasPermission, PERMISSIONS } from '@/lib/auth'
import { useAdminMode } from '@/lib/adminModeStore'
import { useFilterUrlState } from '../hooks/useFilterUrlState'
import { applyPreset, matchPreset, type PresetId } from '../lib/listPresets'
import { countCheckFailed } from '../lib/validation'
import { ApiError } from '../lib/api'
import type { ComponentFilter, ComponentSummary, TeamcityValidationRow } from '../lib/types'

// Verbatim client-facing reason the backend sets for a whole-sweep TIMEOUT (must match
// ValidationService.SWEEP_TIMED_OUT). A timeout means the downstream is reachable but
// slow/over-loaded, so the banner shows a "will retry" hint instead of the misleading
// "check the URLs are reachable" hint used for genuine connectivity failures.
const SWEEP_TIMED_OUT = 'validation sweep timed out'

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
    systems: [],
    productType: null,
    archived: false,
    updatedAt: null,
    labels: [],
  }
}

// Same minimal-row treatment as summaryFromValidationKey, for a component
// that's in "With problems" only because of a TeamCity finding. TeamCity
// findings carry a real componentId, used here instead of the name.
function summaryFromTeamCityRow(row: TeamcityValidationRow): ComponentSummary {
  return {
    id: row.componentId,
    name: row.componentName,
    displayName: null,
    componentOwner: null,
    systems: [],
    productType: null,
    archived: false,
    updatedAt: null,
    labels: [],
  }
}

export function ComponentListPage() {
  // Filter + preset are URL-shareable (spec §1.1/1.2): the query string is the
  // single source of truth, round-tripped via useFilterUrlState. Page/size stay
  // local (ephemeral paging is not worth a URL entry).
  const { filter, preset: urlPreset, setState } = useFilterUrlState()
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)

  const { data: user } = useCurrentUser()
  const username = user?.username ?? null
  const { data, isLoading, error } = useComponents({ filter, page, size })

  // The Validation Problems facility is admin-mode only (a maintainer concern).
  // Reuse the app's canonical admin-mode predicate (same double-gate as
  // Layout.tsx's ADMIN badge): the persisted adminMode toggle AND the real
  // IMPORT_DATA permission — so flipping adminMode in localStorage without the
  // permission grants nothing.
  const adminMode = useAdminMode((s) => s.enabled)
  const isAdmin = adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA)

  // The active preset: an explicit URL preset wins (it is the only way to encode
  // `problems`, which has no filter footprint); otherwise derive it from the
  // filter so a bare filter URL still lights up the matching segment.
  const activePreset: PresetId | null =
    (urlPreset as PresetId | null) ?? matchPreset(filter, username)

  // "Only with problems" mode — the `problems` preset. Driven by the Portal
  // validation report, not a CRS query param (problems are Portal-computed, the
  // CRS list is paged). Admin-gated: if admin mode is off, fall back to the
  // normal paged list rather than getting stuck on an empty/forbidden view.
  const problemsOnly = activePreset === 'problems'
  const showProblemsOnly = problemsOnly && isAdmin

  // Full report → badge overlay on the normal paged list (toggle off). Gated on
  // isAdmin so non-admin users issue no /portal/validation request.
  const validation = useValidationProblems(isAdmin)
  // Problem-bearing set → the list source when the toggle is on. Only fetched
  // while admin AND the toggle is on, so non-admins / toggle-off pages don't
  // pay for it.
  const problems = useComponentsWithProblems(showProblemsOnly)

  // Admin-gated, not showProblemsOnly — every finding IS a problem, so this
  // one fetch serves both the per-row warning badge and the "With problems" list.
  const teamCityFindings = useTeamCityValidations({}, isAdmin)

  // componentId -> finding count, for the Name cell's TeamCity warning badge.
  const teamCityIssueCountByComponent = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of teamCityFindings.data ?? []) {
      map.set(r.componentId, (map.get(r.componentId) ?? 0) + 1)
    }
    return map
  }, [teamCityFindings.data])

  // First TeamCity finding per component name — used to fold TeamCity-only
  // components into "With problems" below.
  const teamCityRowByName = useMemo(() => {
    const map = new Map<string, TeamcityValidationRow>()
    for (const r of teamCityFindings.data ?? []) {
      if (!map.has(r.componentName)) map.set(r.componentName, r)
    }
    return map
  }, [teamCityFindings.data])

  // Every component with an Unregistered-Released issue OR a TeamCity
  // finding, merged into one list. Check-failed components are excluded — a
  // system condition surfaced by the banner below, not a per-row problem.
  const problemRows = useMemo<ComponentSummary[]>(() => {
    const unregisteredNames = new Set(
      Array.from(problems.byComponent.values())
        .filter((cv) => cv.problems.length > 0)
        .map((cv) => cv.component),
    )
    const unregisteredRows = Array.from(unregisteredNames).sort().map(summaryFromValidationKey)
    const teamCityOnlyRows = Array.from(teamCityRowByName.entries())
      .filter(([name]) => !unregisteredNames.has(name))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => summaryFromTeamCityRow(row))
    return [...unregisteredRows, ...teamCityOnlyRows]
  }, [problems.byComponent, teamCityRowByName])

  // How many components the most recent sweep could NOT verify (a downstream
  // service was briefly unreachable / returned an unexpected response). This is
  // a SYSTEM condition, surfaced ONCE as a banner below — never as per-row
  // triangles — so a transient backend blip does not make every component look
  // broken. Counted from the full report (always fetched for admins, regardless
  // of the problems-only toggle), so the figure is the whole registry's.
  const checkFailedCount = useMemo(
    () => countCheckFailed(validation.byComponent.values()),
    [validation.byComponent],
  )

  const canCreate = hasPermission(user, PERMISSIONS.CREATE_COMPONENTS)

  // The preset reflected in the UI (segmented control + chip). A `problems`
  // preset that the current user can't actually use (not admin) is suppressed
  // so a shared admin link doesn't surface a preset with no matching button.
  const effectivePreset: PresetId | null =
    activePreset === 'problems' && !isAdmin ? null : activePreset

  // A filter edit replaces the filter and re-derives the preset from it (so
  // manually reproducing a preset's combo lights the segment, and any other
  // combo clears it). matchPreset never yields `problems` (it has no filter
  // footprint), so editing a CRS filter naturally drops the problems preset —
  // those controls are inert in problems mode anyway.
  const handleFilterChange = (newFilter: ComponentFilter) => {
    setState({ filter: newFilter, preset: matchPreset(newFilter, username) })
    setPage(0) // reset to first page on filter change
  }

  // Preset selection is sugar over the filter state (lib/listPresets): apply the
  // preset's filter combo and record the preset in the URL.
  const handlePresetSelect = (id: PresetId) => {
    setState({ filter: applyPreset(id, filter, username), preset: id })
    setPage(0)
  }

  // Clear all → back to the active-only default (no preset, no filters, bare URL).
  const handleClearAll = () => {
    setState({ filter: { archived: false }, preset: null })
    setPage(0)
  }

  // Remove a single active-filter chip. The synthetic `preset` chip resets to
  // the active-only default ("All") — same as Clear all, so a shared link is the
  // bare URL, not `?preset=all`; array chips drop just that value; scalar /
  // tri-state chips clear the whole field.
  const handleChipRemove = (
    key: keyof ComponentFilter | 'preset',
    value: string | undefined,
  ) => {
    if (key === 'preset') {
      handleClearAll()
      return
    }
    const next: ComponentFilter = { ...filter }
    const current = next[key]
    if (value !== undefined && Array.isArray(current)) {
      const remaining = current.filter((v) => v !== value)
      if (remaining.length) {
        // `next[key]` is the string-array field this chip came from.
        ;(next as Record<string, string[]>)[key] = remaining
      } else {
        delete next[key]
      }
    } else if (key === 'archived') {
      // archived has no "unset" — removing the chip returns to the active-only default.
      next.archived = false
    } else {
      delete next[key]
    }
    handleFilterChange(next)
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
          <div className="flex items-center gap-2">
            <SearchCommandButton />
            {canCreate && <CreateComponentButton />}
          </div>
        </div>

        {/* Preset segmented control (spec §1.1): sugar over the filter state.
            The admin-only "With problems" preset is hidden for non-admins. */}
        <ListPresetBar active={effectivePreset} isAdmin={isAdmin} onSelect={handlePresetSelect} />

        <ComponentFilters
          filter={filter}
          onFilterChange={handleFilterChange}
          problemsOnly={showProblemsOnly}
          // Found-count shown beside the problems-only hint, mirroring how a
          // normal search shows its result count. Only meaningful in
          // problems-only mode and once the report has loaded; undefined
          // otherwise (so the hint renders without a count while loading).
          problemsCount={showProblemsOnly && !problems.isLoading ? problemRows.length : undefined}
        />

        {/* Active-filter chips (spec §1.2): one removable chip per active filter
            (incl. the active preset); each × clears just that filter, "Clear all"
            resets everything. Reflects live state only. */}
        <ActiveFilterChips
          filter={filter}
          preset={effectivePreset}
          onRemove={handleChipRemove}
          onClearAll={handleClearAll}
        />

        {/* The validation report is a scheduled Portal sweep; when its most
            recent refresh failed the held data may be stale. Surface that so a
            stale report is never silently read as "all clean". Admin-only (the
            report is only fetched for admins).

            Two distinct hints, because a TIMEOUT and an UNREACHABLE downstream need
            different operator action — and a timeout must not be misread as a URL
            misconfiguration (connectivity is fine; the sweep is just slow/over-loaded,
            e.g. during a registry redeploy). The timeout reason string is produced
            verbatim by the backend (ValidationService.SWEEP_TIMED_OUT). On timeout the
            sweep also retries on a short backoff, so the report self-heals. */}
        {isAdmin && validation.refreshError && (
          <InlineError
            message={
              validation.refreshError === SWEEP_TIMED_OUT ? (
                <>
                  Validation report may be stale — the last refresh timed out: a validation
                  service (components-registry / release-management) was slow or under load
                  (for example during a registry redeploy). The sweep retries automatically
                  shortly; no action is needed unless this persists.
                </>
              ) : (
                <>
                  Validation report may be stale — last refresh failed: {validation.refreshError}.
                  Check that the validation service URLs (components-registry / release-management)
                  are configured and reachable over https.
                </>
              )
            }
          />
        )}

        {/* CRS's TeamCity findings feed the per-row warning badge AND the "With
            problems" set below; if the request fails, `.data ?? []` would
            otherwise silently look clean (or incomplete for "With problems") —
            say so explicitly instead, consistent with the Unregistered Release
            stale/failed-refresh hint above. */}
        {isAdmin && teamCityFindings.isError && (
          <InlineError
            message={
              <>
                Could not load TeamCity validation findings —
                {' '}
                {teamCityFindings.error instanceof Error
                  ? teamCityFindings.error.message
                  : String(teamCityFindings.error)}
                . TeamCity warning badges and the "With problems" list may be incomplete
                until this succeeds again.
              </>
            }
          />
        )}

        {/* System-level (not per-component) signal: when the last sweep could
            not verify some components — a downstream service was briefly
            unreachable / returned an unexpected response — say so ONCE here
            instead of flagging every affected row. This is an operational
            condition, not a problem with the components, so no raw exception
            text is shown and the affected rows carry no red triangle. */}
        {isAdmin && checkFailedCount > 0 && (
          <StatusBanner variant="warning" data-testid="validation-system-failure">
            <div className="font-semibold">Validation temporarily unavailable</div>
            <p>
              {checkFailedCount} component{checkFailedCount === 1 ? '' : 's'} could not be checked —
              this is a system issue (a validation service was briefly unreachable), not a problem
              with the components. The check runs again automatically on the next sweep.
            </p>
          </StatusBanner>
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
          onCopy={canCreate ? (id) => navigate(`/components/new?from=${id}`) : undefined}
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
          // Same admin-only gating as validationByComponent — undefined for
          // non-admins so no TeamCity warning triangle ever renders for them.
          teamCityIssueCountByComponent={isAdmin ? teamCityIssueCountByComponent : undefined}
        />

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
