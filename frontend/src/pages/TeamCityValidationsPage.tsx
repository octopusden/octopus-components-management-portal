import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, ListChecks } from 'lucide-react'
import { Layout } from '../components/Layout'
import { InlineError } from '../components/ui/inline-error'
import { SkeletonBlock } from '../components/ui/skeleton-block'
import { StatusBanner } from '../components/ui/status-banner'
import { EmptyState } from '../components/ui/empty-state'
import { Input } from '../components/ui/input'
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
import { getTeamCityValidationStatusTone, getTeamCityValidationTypeInfo } from '../lib/teamcityValidationTypes'
import { cn } from '../lib/utils'

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

function BreakdownList({ counts }: { counts: Record<string, number>; labelFor?: (key: string) => string }) {
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

function StatusPills({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return <EmptyState message="No data." className="py-8" />
  const toneClass: Record<'default' | 'destructive' | 'warning' | 'success', string> = {
    default: 'bg-muted text-muted-foreground',
    destructive: 'bg-destructive/15 text-destructive',
    warning: 'bg-[color:var(--color-badge-yellow-bg)] text-[color:var(--color-badge-yellow-fg)]',
    success: 'bg-[color:var(--color-badge-green-bg)] text-[color:var(--color-badge-green-fg)]',
  }
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([status, count]) => (
        <span
          key={status}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
            toneClass[getTeamCityValidationStatusTone(status)],
          )}
        >
          {status}
          <span className="tabular-nums">{count}</span>
        </span>
      ))}
    </div>
  )
}

/**
 * Registry-wide TeamCity validation findings — the top-level counterpart to
 * the per-component `TeamCityValidationsTab`. Sourced from the portal-side
 * validation sweep (see TeamCityValidationPanel on the Admin > Migration
 * tab, which triggers the run this page reports on). Admin-only route
 * (RequirePermission(IMPORT_DATA) in App.tsx, adminOnly nav item in
 * Layout.tsx), mirroring `/health`.
 */
export function TeamCityValidationsPage() {
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [componentFilter, setComponentFilter] = useState('')

  const summary = useTeamCityValidationSummary()

  const filters: TeamCityValidationFilters = useMemo(
    () => ({
      type: typeFilter.trim() || undefined,
      status: statusFilter.trim() || undefined,
      componentId: componentFilter.trim() || undefined,
    }),
    [typeFilter, statusFilter, componentFilter],
  )
  const rows = useTeamCityValidations(filters)

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
                label="Components with issues"
                value={summary.data?.componentsWithIssues ?? 0}
                icon={<AlertTriangle className="h-5 w-5" />}
                tone="destructive"
              />
              <KpiCard
                label="Findings"
                value={summary.data?.findings ?? 0}
                icon={<ListChecks className="h-5 w-5" />}
                tone="destructive"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
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
              <section className="rounded-lg border p-5 space-y-4">
                <h2 className="text-lg font-semibold">By status</h2>
                <StatusPills counts={summary.data?.byStatus ?? {}} />
              </section>
            </div>
          </>
        )}

        <section className="rounded-lg border p-5 space-y-4">
          <h2 className="text-lg font-semibold">Findings</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              placeholder="Filter by type…"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by type"
            />
            <Input
              placeholder="Filter by status…"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            />
            <Input
              placeholder="Filter by component…"
              value={componentFilter}
              onChange={(e) => setComponentFilter(e.target.value)}
              aria-label="Filter by component"
            />
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
          ) : (rows.data ?? []).length === 0 ? (
            <EmptyState message="No validation findings match these filters." className="py-8" />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows.data ?? []).map((r, i) => (
                    <TableRow key={`${r.componentId}-${r.projectId}-${r.type}-${i}`}>
                      <TableCell>
                        <Link to={`/components/${r.componentId}`} className="font-medium text-primary hover:underline">
                          {r.componentName}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.projectId}</TableCell>
                      <TableCell>{getTeamCityValidationTypeInfo(r.type).label}</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell className="text-muted-foreground">{r.message}</TableCell>
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
