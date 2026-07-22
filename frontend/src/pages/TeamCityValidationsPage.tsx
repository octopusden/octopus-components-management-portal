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
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ListChecks } from 'lucide-react'
import { Layout } from '../components/Layout'
import { InlineError } from '../components/ui/inline-error'
import { SkeletonBlock } from '../components/ui/skeleton-block'
import { StatusBanner } from '../components/ui/status-banner'
import { EmptyState } from '../components/ui/empty-state'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { MultiSelectFilter } from '../components/ui/MultiSelectFilter'
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip'
import { TeamCityIcon } from '../components/ui/icons/brand-icons'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import {
  useTeamCityValidationSummary,
  useTeamCityValidations,
  type TeamCityValidationFilters,
} from '../hooks/useTeamCityValidations'
import {
  getTeamCityValidationCategory,
  getTeamCityValidationStatusTone,
  getTeamCityValidationTypeInfo,
  TEAMCITY_VALIDATION_CATEGORIES,
} from '../lib/teamcityValidationTypes'
import { cn, safeHttpUrl } from '../lib/utils'
import type { TeamcityValidationRow } from '../lib/types'

// The wire row has no `category` — it's a front-end-only concept (see
// teamcityValidationTypes.ts) stamped onto each row after fetch, purely for
// the Category filter/column.
type ValidationRow = TeamcityValidationRow & { category: string }

interface KpiCardProps {
  label: string
  value: number | null
  icon: React.ReactNode
  tone?: 'default' | 'destructive'
}

// Not exported from RegistryHealthPage.tsx, so duplicated here in minimal
// form rather than refactoring the two pages to share it.
function KpiCard({ label, value, icon, tone = 'default' }: KpiCardProps) {
  return (
    <div className="rounded-lg border p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn('shrink-0', tone === 'destructive' && 'text-destructive')} aria-hidden>
          {icon}
        </span>
      </div>
      <div
        className={cn(
          'text-3xl font-semibold tabular-nums tracking-tight',
          value !== null && tone === 'destructive' && 'text-destructive',
          value === null && 'text-muted-foreground',
        )}
      >
        {value === null ? '—' : value.toLocaleString()}
      </div>
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

const columnHelper = createColumnHelper<ValidationRow>()

const columns = [
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
    cell: ({ getValue }) => <Badge variant="secondary">{getTeamCityValidationTypeInfo(getValue()).label}</Badge>,
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
  columnHelper.accessor('category', {
    header: ({ column }) => (
      <SortableHeader
        label="Category"
        sorted={column.getIsSorted()}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      />
    ),
    cell: ({ getValue }) => <Badge variant="secondary">{getValue()}</Badge>,
  }),
  columnHelper.accessor('message', {
    header: 'Message',
    enableSorting: false,
    // Findings messages may contain literal "\n" line breaks — whitespace-pre-wrap
    // renders them instead of collapsing to one line, while still wrapping normally.
    cell: ({ getValue }) => (
      <span className="text-muted-foreground whitespace-pre-wrap">{getValue()}</span>
    ),
  }),
]

/**
 * Registry-wide TeamCity validation findings — the top-level counterpart to
 * the per-component `TeamCityValidationsTab`. Sourced from the portal-side
 * validation sweep (see TeamCityValidationPanel on the Admin > Migration
 * tab, which triggers the run this page reports on). Admin-only route
 * (RequirePermission(IMPORT_DATA) in App.tsx, adminOnly nav item in
 * Layout.tsx), mirroring `/health`.
 */
export function TeamCityValidationsPage() {
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [sorting, setSorting] = useState<SortingState>([])

  const summary = useTeamCityValidationSummary()

  const filters: TeamCityValidationFilters = useMemo(
    () => ({
      type: typeFilter.length ? typeFilter : undefined,
      status: statusFilter.length ? statusFilter : undefined,
    }),
    [typeFilter, statusFilter],
  )
  const rows = useTeamCityValidations(filters)

  // Type/status options come from the live summary breakdown (the real values
  // the sweep has actually reported), not a guessed static list — it stays in
  // sync automatically as new finding types/statuses appear.
  const typeOptions = useMemo(
    () => Object.keys(summary.data?.byType ?? {}).sort(),
    [summary.data?.byType],
  )
  const statusOptions = useMemo(
    () => Object.keys(summary.data?.byStatus ?? {}).sort(),
    [summary.data?.byStatus],
  )

  // Category has no backend query param (see useTeamCityValidations) — every
  // row is stamped with its client-computed category, then filtered locally.
  const tableRows: ValidationRow[] = useMemo(() => {
    const withCategory = (rows.data ?? []).map((r) => ({ ...r, category: getTeamCityValidationCategory() }))
    if (categoryFilter.length === 0) return withCategory
    return withCategory.filter((r) => categoryFilter.includes(r.category))
  }, [rows.data, categoryFilter])

  const table = useReactTable({
    data: tableRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <Layout>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Validations</h1>
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
                isLoading={summary.isLoading}
                placeholder="All types"
                unitLabel="type"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="filter-tc-status" className="text-xs text-muted-foreground">
                Status
              </Label>
              <MultiSelectFilter
                id="filter-tc-status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusOptions}
                isLoading={summary.isLoading}
                placeholder="All statuses"
                unitLabel="status"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="filter-tc-category" className="text-xs text-muted-foreground">
                Category
              </Label>
              {/* Only one category exists today (TeamCity) — the control is
                  still a multi-select so a second source can appear later
                  without any UI change, just a longer TEAMCITY_VALIDATION_CATEGORIES. */}
              <MultiSelectFilter
                id="filter-tc-category"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={TEAMCITY_VALIDATION_CATEGORIES}
                placeholder="All categories"
                unitLabel="category"
              />
            </div>
          </div>

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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
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
    </Layout>
  )
}
