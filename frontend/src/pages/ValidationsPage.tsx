import * as React from 'react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  ChevronRight,
  GitBranch,
  ListChecks,
  ShieldCheck,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { InlineError } from '../components/ui/inline-error'
import { StatusBanner } from '../components/ui/status-banner'
import { EmptyState } from '../components/ui/empty-state'
import { SkeletonBlock } from '../components/ui/skeleton-block'
import { RelativeTime } from '../components/ui/RelativeTime'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip'
import { TeamCityIcon } from '../components/ui/icons/brand-icons'
import { TeamCityMessage } from '../components/TeamCityMessage'
import { MultiSelectFilter } from '../components/ui/MultiSelectFilter'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { useHealthStatistics } from '../hooks/useHealthStatistics'
import { useValidationProblems } from '../hooks/useValidationProblems'
import {
  useTeamCityValidationSummary,
  useTeamCityValidations,
  type TeamCityValidationFilters,
} from '../hooks/useTeamCityValidations'
import {
  computeHealthKpis,
  topOffenders,
  rankPeople,
  peopleFilterHref,
  type PeopleRole,
  type PersonCount,
} from '../lib/health'
import {
  getTeamCityValidationStatusTone,
  getTeamCityValidationTypeInfo,
  splitTeamCityValidationTypes,
} from '../lib/teamcityValidationTypes'
import { cn, safeHttpUrl } from '../lib/utils'
import type { TeamcityValidationRow } from '../lib/types'

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

interface KpiCardProps {
  label: string
  /** The metric; `null` renders an em-dash for an unavailable value. */
  value: number | null
  /** Optional second line, e.g. a percentage of total. Omitted when value is null. */
  hint?: string
  icon: React.ReactNode
  /** Visual tone — `destructive` for problem metrics, `success` for healthy. */
  tone?: 'default' | 'destructive' | 'success'
}

// Shared KPI tile — used by both the TeamCity and Unregistered Release tabs.
function KpiCard({ label, value, hint, icon, tone = 'default' }: KpiCardProps) {
  return (
    <div className="rounded-lg border p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            'shrink-0',
            tone === 'destructive' && 'text-destructive',
            tone === 'success' && 'text-[color:var(--color-badge-green-fg)]',
            tone === 'default' && 'text-muted-foreground',
          )}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <div
        className={cn(
          'text-3xl font-semibold tabular-nums tracking-tight',
          value !== null && tone === 'destructive' && 'text-destructive',
          value !== null && tone === 'success' && 'text-[color:var(--color-badge-green-fg)]',
          value === null && 'text-muted-foreground',
        )}
      >
        {value === null ? '—' : value.toLocaleString()}
      </div>
      {value !== null && hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

function BreakdownList({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const max = entries.reduce((m, [, c]) => Math.max(m, c), 0)
  if (entries.length === 0) return <EmptyState message="No data." className="py-8" />
  return (
    <ul className="space-y-2.5">
      {entries.map(([key, count]) => (
        <li key={key} className="flex items-center gap-3">
          <span className="w-1/3 min-w-0 truncate text-sm font-medium" title={key}>
            {key}
          </span>
          <span className="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
              style={{ width: max > 0 ? `${(count / max) * 100}%` : '0%' }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{count}</span>
        </li>
      ))}
    </ul>
  )
}

interface TopOffendersPanelProps {
  rows: { component: string; problemVersions: number }[]
}

function TopOffendersPanel({ rows }: TopOffendersPanelProps) {
  // Scale the bar widths against the worst offender so the leader fills the
  // track and the rest read proportionally.
  const max = rows.reduce((m, r) => Math.max(m, r.problemVersions), 0)
  return (
    <section className="rounded-lg border p-5 space-y-4" aria-labelledby="top-offenders-heading">
      <div className="space-y-1">
        <h2 id="top-offenders-heading" className="text-lg font-semibold">
          Top offenders
        </h2>
        <p className="text-sm text-muted-foreground">
          Components with the most unregistered released versions.
        </p>
      </div>
      {rows.length === 0 ? (
        <EmptyState message="No components with validation problems." className="py-8" />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.component}>
              <Link
                to={`/components/${r.component}`}
                className="group flex items-center gap-3 rounded-md px-1 py-1 hover:bg-muted/50"
              >
                <span className="w-1/3 min-w-0 truncate text-sm font-medium" title={r.component}>
                  {r.component}
                </span>
                <span className="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-destructive"
                    style={{ width: max > 0 ? `${(r.problemVersions / max) * 100}%` : '0%' }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {r.problemVersions}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface PeoplePanelProps {
  title: string
  role: PeopleRole
  rows: PersonCount[]
}

// Wrapped in a max-height scroll container (same treatment as the TeamCity
// findings table) — these lists can get very long on a big registry, and
// without a cap they used to push the rest of the page far down.
function PeoplePanel({ title, role, rows }: PeoplePanelProps) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0)
  const headingId = `people-${role}-heading`
  return (
    <section className="rounded-lg border p-5 space-y-4" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>
      {rows.length === 0 ? (
        <EmptyState message="No assignments." className="py-8" />
      ) : (
        <ul className="space-y-2.5 max-h-[28rem] overflow-y-auto">
          {rows.map((r) => (
            <li key={r.person}>
              <Link
                to={peopleFilterHref(role, r.person)}
                className="group flex items-center gap-3 rounded-md px-1 py-1 hover:bg-muted/50"
                title={`Show components — ${r.person}`}
              >
                <span className="w-1/3 min-w-0 truncate text-sm font-medium" title={r.person}>
                  {r.person}
                </span>
                <span className="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                    style={{ width: max > 0 ? `${(r.count / max) * 100}%` : '0%' }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {r.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * "Unregistered Release" tab — formerly the standalone `/health` page
 * (Registry Health). Composes CRS `GET /health/statistics` (total/active
 * counts + the three people breakdowns) with the portal-owned validation
 * report (problem KPIs + top offenders). Admin-only — gated at the page
 * level by `ValidationsPage`'s route, not re-gated here.
 */
function UnregisteredReleaseSection() {
  const stats = useHealthStatistics()
  const validation = useValidationProblems()

  const kpis = useMemo(
    () =>
      computeHealthKpis(
        stats.data?.totalComponents ?? 0,
        stats.data?.activeComponents ?? 0,
        validation.byComponent.values(),
      ),
    [stats.data?.totalComponents, stats.data?.activeComponents, validation.byComponent],
  )
  const offenders = useMemo(
    () => topOffenders(validation.byComponent.values()),
    [validation.byComponent],
  )
  const byOwner = useMemo(() => rankPeople(stats.data?.componentsByOwner ?? {}), [stats.data])
  const byReleaseManager = useMemo(
    () => rankPeople(stats.data?.componentsByReleaseManager ?? {}),
    [stats.data],
  )
  const bySecurityChampion = useMemo(
    () => rankPeople(stats.data?.componentsBySecurityChampion ?? {}),
    [stats.data],
  )

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Unregistered Released Validations</h2>
        <p className="text-sm text-muted-foreground">
          Component with unregistered released version in the configuration.
        </p>
      </div>

      {stats.isError ? (
        // The statistics endpoint is this tab's spine (KPIs + people panels).
        // If it fails there is no meaningful content to render — show the
        // standard load-failed block rather than a half-empty shell.
        <InlineError
          message={
            stats.error instanceof Error
              ? `Failed to load registry statistics: ${stats.error.message}`
              : 'Failed to load registry statistics.'
          }
        />
      ) : stats.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="health-loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-5 space-y-3">
              <SkeletonBlock width="w-1/2" />
              <SkeletonBlock height="h-8" width="w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* The problem KPIs + top offenders depend on the validation report,
              which is independent of statistics. A failed/stale report must not
              read as "all clean" — surface it once here. */}
          {validation.refreshError && (
            <StatusBanner variant="warning">
              The validation report could not be refreshed ({validation.refreshError}); problem
              figures below may be stale (last generated{' '}
              <RelativeTime ts={validation.generatedAt} />
              ).
            </StatusBanner>
          )}
          {!validation.refreshError && validation.isError && (
            <StatusBanner variant="warning">
              The validation report is unavailable; problem and top-offender figures are not
              shown. Total and active counts below are unaffected.
            </StatusBanner>
          )}

          {/* When the validation report is unavailable the problem-derived
              metrics are unknown, NOT zero — show an em-dash so this never
              reads as "0 problems / 100% healthy" off a failed report. Total /
              active come from CRS stats and are always shown. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Total components"
              value={kpis.total}
              hint={`${(stats.data?.activeComponents ?? 0).toLocaleString()} active`}
              icon={<Boxes className="h-5 w-5" />}
            />
            <KpiCard
              label="With validation problems"
              value={validation.isError ? null : kpis.withProblems}
              hint={`${pct(kpis.withProblemsRatio)} of active`}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone="destructive"
            />
            <KpiCard
              label="Problem versions"
              value={validation.isError ? null : kpis.problemVersions}
              hint="released versions implicated"
              icon={<GitBranch className="h-5 w-5" />}
              tone="destructive"
            />
            <KpiCard
              label="Healthy components"
              value={validation.isError ? null : kpis.healthy}
              hint={`${pct(kpis.healthyRatio)} of active`}
              icon={<ShieldCheck className="h-5 w-5" />}
              tone="success"
            />
          </div>

          {/* Top offenders only render meaningfully off a present report. */}
          {!validation.isError && <TopOffendersPanel rows={offenders} />}

          <div className="grid gap-4 lg:grid-cols-3">
            <PeoplePanel title="Components by owner" role="owner" rows={byOwner} />
            <PeoplePanel
              title="Components by release manager"
              role="releaseManager"
              rows={byReleaseManager}
            />
            <PeoplePanel
              title="Components by security champion"
              role="securityChampion"
              rows={bySecurityChampion}
            />
          </div>
        </>
      )}
    </div>
  )
}

// Single-select dropdown — same native-<select> pattern as ComponentFilters.tsx's
// TriStateFilter, sized for longer option strings (type/status values).
function SingleSelectFilter({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
}) {
  return (
    <select
      id={id}
      aria-label={placeholder}
      className="h-9 w-48 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

// Sort-toggle header button — same look/behavior as ComponentTable.tsx's
// column headers (not exported from there, so duplicated here in minimal form).
function SortableHeader({
  label,
  sorted,
  onClick,
}: {
  label: string
  sorted: false | 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <button
      className="flex items-center gap-1 font-medium hover:text-foreground transition-colors"
      onClick={onClick}
    >
      {label}
      {sorted === 'asc' ? (
        <ArrowUp className="h-3.5 w-3.5" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  )
}

const columnHelper = createColumnHelper<TeamcityValidationRow>()

const teamCityColumns = [
  columnHelper.accessor('componentName', {
    header: ({ column }) => (
      <SortableHeader
        label="Component"
        sorted={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      />
    ),
    cell: ({ row }) => (
      <Link
        to={`/components/${row.original.componentId}`}
        className="font-medium text-primary hover:underline"
      >
        {row.original.componentName}
      </Link>
    ),
  }),
  columnHelper.accessor('projectId', {
    header: ({ column }) => (
      <SortableHeader
        label="Project"
        sorted={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      />
    ),
    cell: ({ row }) => {
      const { projectId, projectUrl } = row.original
      const url = safeHttpUrl(projectUrl ?? null)
      if (!url) {
        return <span className="font-mono text-xs">{projectId}</span>
      }
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={`TeamCity: ${projectId}`}
              aria-label={`TeamCity: ${projectId}`}
              className="inline-flex items-center gap-1.5 font-mono text-xs text-primary hover:underline"
            >
              <TeamCityIcon className="h-3.5 w-3.5 shrink-0" />
              {projectId}
            </a>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs break-all">{url}</TooltipContent>
        </Tooltip>
      )
    },
  }),
  columnHelper.accessor('type', {
    header: ({ column }) => (
      <SortableHeader
        label="Type"
        sorted={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      />
    ),
    // A finding's `type` is a comma-separated list (a finding can flag more
    // than one rule) — one badge per type, not one badge for the raw CSV string.
    cell: ({ getValue }) => (
      <div className="flex flex-wrap gap-1">
        {splitTeamCityValidationTypes(getValue()).map((t) => (
          <Badge key={t} variant="secondary">
            {getTeamCityValidationTypeInfo(t).label}
          </Badge>
        ))}
      </div>
    ),
  }),
  columnHelper.accessor('status', {
    header: ({ column }) => (
      <SortableHeader
        label="Status"
        sorted={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      />
    ),
    cell: ({ getValue }) => {
      const status = getValue()
      return (
        <Badge variant={getTeamCityValidationStatusTone(status)} className="uppercase tracking-wide">
          {status}
        </Badge>
      )
    },
  }),
  columnHelper.accessor('message', {
    header: 'Message',
    enableSorting: false,
    // Findings messages may contain literal "\n" line breaks, and
    // "- STEP_ID in BUILD_CONF_ID" / "- BUILD_CONF_ID" lines whose identifiers
    // link into TeamCity — see TeamCityMessage (which owns its own text color).
    cell: ({ getValue, row }) => (
      <TeamCityMessage message={getValue()} projectUrl={row.original.projectUrl} />
    ),
  }),
]

/**
 * "TeamCity" tab — the registry-wide counterpart to the per-component
 * `TeamCityValidationsTab`. Sourced from the portal-side validation sweep
 * (see TeamCityValidationPanel on the Admin > Migration tab, which triggers
 * the run this reports on). Admin-only — gated at the page level.
 */
function TeamCitySection() {
  // Type supports multiple selections — a finding's `type` value itself is a
  // comma-separated list (one finding can flag more than one rule), so the
  // filter has to be able to match against any number of individual types.
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])

  const summary = useTeamCityValidationSummary()

  const filters: TeamCityValidationFilters = useMemo(
    () => ({
      type: typeFilter.length ? typeFilter : undefined,
      status: statusFilter ? [statusFilter] : undefined,
    }),
    [typeFilter, statusFilter],
  )
  const rows = useTeamCityValidations(filters)

  // Type/status options come from the live summary breakdown (the real values
  // the sweep has actually reported), not a guessed static list — it stays in
  // sync automatically as new finding types/statuses appear. byType keys are
  // split too, since a breakdown key can itself be a comma-separated combo.
  const typeOptions = useMemo(
    () =>
      Array.from(
        new Set(Object.keys(summary.data?.byType ?? {}).flatMap(splitTeamCityValidationTypes)),
      ).sort(),
    [summary.data?.byType],
  )
  const statusOptions = useMemo(
    () => Object.keys(summary.data?.byStatus ?? {}).sort(),
    [summary.data?.byStatus],
  )

  const tableRows = useMemo(() => rows.data ?? [], [rows.data])

  // Distinct component/project counts across the currently filtered rows —
  // backs the "Found X components across Y TeamCity projects" summary line.
  const resultCounts = useMemo(() => {
    const components = new Set(tableRows.map((r) => r.componentId))
    const projects = new Set(tableRows.map((r) => r.projectId))
    return { components: components.size, projects: projects.size }
  }, [tableRows])

  const table = useReactTable({
    data: tableRows,
    columns: teamCityColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">TeamCity Validations</h2>
        <p className="text-sm text-muted-foreground">
          TeamCity validation findings across the registry.
        </p>
      </div>

      {summary.isError ? (
        <InlineError
          message={
            summary.error instanceof Error
              ? `Failed to load validation summary: ${summary.error.message}`
              : 'Failed to load validation summary.'
          }
        />
      ) : summary.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2" data-testid="teamcity-validations-summary-loading">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-5 space-y-3">
              <SkeletonBlock width="w-1/2" />
              <SkeletonBlock height="h-8" width="w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <KpiCard
              label="Components with validation problems"
              value={summary.data?.componentsWithIssues ?? 0}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone="destructive"
            />
            <KpiCard
              label="Unique problems"
              value={summary.data?.findings ?? 0}
              icon={<ListChecks className="h-5 w-5" />}
              tone="destructive"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-1">
            <section className="rounded-lg border p-5 space-y-4">
              <h2 className="text-lg font-semibold">By type</h2>
              <BreakdownList
                counts={Object.fromEntries(
                  Object.entries(summary.data?.byType ?? {}).map(([type, count]) => [
                    getTeamCityValidationTypeInfo(type).label,
                    count,
                  ]),
                )}
              />
            </section>
          </div>
        </>
      )}

      <section className="rounded-lg border p-5 space-y-4">
        <h2 className="text-lg font-semibold">Findings</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-tc-type" className="text-xs text-muted-foreground">
              Type
            </Label>
            <MultiSelectFilter
              id="filter-tc-type"
              value={typeFilter}
              onChange={setTypeFilter}
              options={typeOptions}
              placeholder="All types"
              unitLabel="type"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-tc-status" className="text-xs text-muted-foreground">
              Status
            </Label>
            <SingleSelectFilter
              id="filter-tc-status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
              placeholder="All statuses"
            />
          </div>
        </div>

        {!rows.isError && !rows.isLoading && (
          <p className="text-sm text-muted-foreground">
            Found {resultCounts.components} component{resultCounts.components === 1 ? '' : 's'} across{' '}
            {resultCounts.projects} TeamCity project{resultCounts.projects === 1 ? '' : 's'}.
          </p>
        )}

        {rows.isError ? (
          <InlineError
            message={
              rows.error instanceof Error
                ? `Failed to load findings: ${rows.error.message}`
                : 'Failed to load findings.'
            }
          />
        ) : rows.isLoading ? (
          <div className="space-y-2" data-testid="teamcity-validations-rows-loading">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} height="h-8" />
            ))}
          </div>
        ) : tableRows.length === 0 ? (
          <EmptyState message="No validation findings match these filters." className="py-8" />
        ) : (
          <div className="rounded-md border max-h-[28rem] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={`${row.original.componentId}-${row.original.projectId}-${row.original.type}`}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {!summary.isError && !summary.isLoading && summary.data && (
        <StatusBanner variant="info" className="text-xs">
          {summary.data.findings} finding{summary.data.findings === 1 ? '' : 's'} across{' '}
          {summary.data.componentsWithIssues} component{summary.data.componentsWithIssues === 1 ? '' : 's'}.
        </StatusBanner>
      )}
    </div>
  )
}

/**
 * Validations — admin-only diagnostics surface (route-gated on IMPORT_DATA;
 * not re-gated here), merging the former standalone `/health` (Registry
 * Health) page and `/validations` (TeamCity) page into one tabbed surface.
 */
export function ValidationsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Validations</h1>
        </div>

        <Tabs defaultValue="teamcity" variant="underline">
          <TabsList>
            <TabsTrigger value="teamcity">TeamCity</TabsTrigger>
            <TabsTrigger value="unregistered-release">Unregistered Release</TabsTrigger>
          </TabsList>

          <TabsContent value="teamcity" className="mt-4">
            <TeamCitySection />
          </TabsContent>

          <TabsContent value="unregistered-release" className="mt-4">
            <UnregisteredReleaseSection />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  )
}
