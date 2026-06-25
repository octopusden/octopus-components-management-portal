import * as React from 'react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { Boxes, AlertTriangle, GitBranch, ShieldCheck, ChevronRight } from 'lucide-react'
import { Layout } from '../components/Layout'
import { InlineError } from '../components/ui/inline-error'
import { StatusBanner } from '../components/ui/status-banner'
import { EmptyState } from '../components/ui/empty-state'
import { SkeletonBlock } from '../components/ui/skeleton-block'
import { RelativeTime } from '../components/ui/RelativeTime'
import { useHealthStatistics } from '../hooks/useHealthStatistics'
import { useValidationProblems } from '../hooks/useValidationProblems'
import {
  computeHealthKpis,
  topOffenders,
  rankPeople,
  peopleFilterHref,
  type PeopleRole,
  type PersonCount,
} from '../lib/health'
import { cn } from '../lib/utils'

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
        <ul className="space-y-2.5">
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
 * Registry Health — admin-only diagnostics surface (route-gated on IMPORT_DATA;
 * not re-gated here). Composes two data sources: CRS `GET /health/statistics`
 * for the total/active counts and the three people breakdowns, and the
 * portal-owned validation report for the problem KPIs + top offenders.
 *
 * §4.4 (out of scope here): by-system / by-problem-type breakdowns and a
 * time-trend chart. The aggregation/rendering is shaped (rankPeople + a generic
 * PeoplePanel) so a `problemType` dimension could slot in as a fourth panel
 * later without reworking this page.
 */
export function RegistryHealthPage() {
  const stats = useHealthStatistics()
  const validation = useValidationProblems()

  const kpis = useMemo(
    () => computeHealthKpis(stats.data?.totalComponents ?? 0, validation.byComponent.values()),
    [stats.data?.totalComponents, validation.byComponent],
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
    <Layout>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Registry Health</h1>
          <p className="text-sm text-muted-foreground">
            Registry-wide statistics and validation health.
          </p>
        </div>

        {stats.isError ? (
          // The statistics endpoint is the page's spine (KPIs + people panels).
          // If it fails there is no meaningful page to render — show the standard
          // page-level load-failed block rather than a half-empty shell.
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
                read as "all clean" — surface it once at page level. */}
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
                metrics are unknown, NOT zero — show an em-dash so the page never
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
                hint={`${pct(kpis.withProblemsRatio)} of total`}
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
                hint={`${pct(kpis.healthyRatio)} of total`}
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
    </Layout>
  )
}
