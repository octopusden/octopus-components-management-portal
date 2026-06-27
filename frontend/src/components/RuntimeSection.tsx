import * as React from 'react'
import { Package, RefreshCw, Server, CircleAlert } from 'lucide-react'
import { useAdminMode } from '@/lib/adminModeStore'
import { hasPermission, PERMISSIONS } from '@/lib/auth'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useSystemMetrics } from '@/hooks/useSystemMetrics'
import { useCrsInfo, usePortalInfo } from '@/hooks/useInfo'
import {
  deriveSystemStatus,
  formatBytes,
  formatDateTimeShort,
  formatLoad,
  formatPercent,
  formatUptime,
  type SystemStatus,
} from '@/lib/system'
import { cn, initials } from '@/lib/utils'
import type { CrsRuntime, PortalRuntime, RecentLogin } from '@/lib/types'
import { Button } from './ui/button'
import { InlineError } from './ui/inline-error'
import { EmptyState } from './ui/empty-state'
import { SkeletonBlock } from './ui/skeleton-block'
import { RelativeTime } from './ui/RelativeTime'

// Status → token-mapped classes + copy for the summary banner. Literal strings so
// Tailwind keeps them; colors map to the existing badge/destructive CSS vars.
const STATUS_META: Record<
  SystemStatus,
  { box: string; text: string; dot: string; label: string; sub: string }
> = {
  operational: {
    box: 'border-[color:var(--color-badge-green-fg)]/30 bg-[color:var(--color-badge-green-bg)]/40',
    text: 'text-[color:var(--color-badge-green-fg)]',
    dot: 'bg-[color:var(--color-badge-green-fg)]',
    label: 'All systems operational',
    sub: 'Portal metrics live · CRS health UP · polled every 10s',
  },
  degraded: {
    box: 'border-[color:var(--color-badge-yellow-fg)]/30 bg-[color:var(--color-badge-yellow-bg)]/50',
    text: 'text-[color:var(--color-badge-yellow-fg)]',
    dot: 'bg-[color:var(--color-badge-yellow-fg)]',
    label: 'Degraded performance',
    sub: 'Portal metrics live · CRS JVM metrics unavailable',
  },
  down: {
    box: 'border-destructive/30 bg-destructive/10',
    text: 'text-destructive',
    dot: 'bg-destructive',
    label: 'Service disruption',
    sub: 'CRS is down or unreachable',
  },
}

/** A mono value + uppercase label (banner readouts, card header uptime). */
function Readout({ label, value, align = 'end' }: { label: string; value: string; align?: 'start' | 'end' }) {
  return (
    <div className={cn('flex flex-col gap-0.5', align === 'end' ? 'items-end' : 'items-start')}>
      <span className="font-mono text-lg font-semibold tabular-nums leading-none">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  )
}

/** Small status pill with a leading dot (UP/DOWN/…). */
function StatusPill({ status }: { status: string | null | undefined }) {
  const up = status === 'UP'
  const down = status === 'DOWN'
  const cls = up
    ? 'bg-[color:var(--color-badge-green-bg)] text-[color:var(--color-badge-green-fg)] border-[color:var(--color-badge-green-fg)]/25'
    : down
      ? 'bg-destructive/10 text-destructive border-destructive/25'
      : 'bg-muted text-muted-foreground border-border'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', up ? 'bg-[color:var(--color-badge-green-fg)]' : down ? 'bg-destructive' : 'bg-muted-foreground')} aria-hidden />
      {status ?? 'UNKNOWN'}
    </span>
  )
}

function IconTile({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
      {children}
    </span>
  )
}

interface Segment {
  pct: number
  color: string
}

/** Segmented horizontal gauge with a baseline label/detail row and a swatch legend. */
function Gauge({
  label,
  detail,
  segments,
  legend,
}: {
  label: string
  detail: string
  segments: Segment[]
  legend: { color: string; text: string }[]
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-sm text-muted-foreground">{detail}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {segments.map((s, i) => (
          <div key={i} style={{ width: `${Math.max(0, Math.min(100, s.pct))}%`, background: s.color }} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {legend.map((l, i) => (
          <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: l.color }} aria-hidden />
            {l.text}
          </span>
        ))}
      </div>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-3.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-semibold tabular-nums leading-none">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

/** Gridline tile grid (1px hairlines via gap on a border-colored bg). */
function TileGrid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-lg border bg-border',
        cols === 3 ? 'grid-cols-3' : 'grid-cols-2',
      )}
    >
      {children}
    </div>
  )
}

const GREEN_FG = 'var(--color-badge-green-fg)'
const GREEN_BG = 'var(--color-badge-green-bg)'
const BLUE_FG = 'var(--color-badge-blue-fg)'

function heapDetail(used?: number | null, committed?: number | null, max?: number | null): string {
  return `${formatBytes(used)} / ${formatBytes(committed)} · max ${formatBytes(max)}`
}

/** used (solid) + committed-extra (light) segments scaled against max (or committed). */
function heapSegments(used?: number | null, committed?: number | null, max?: number | null): Segment[] {
  const track = max ?? committed ?? used ?? 0
  if (track <= 0) return []
  const u = used ?? 0
  const c = committed ?? 0
  return [
    { pct: (u / track) * 100, color: GREEN_FG },
    { pct: (Math.max(0, c - u) / track) * 100, color: GREEN_BG },
  ]
}

function PortalCard({ runtime, version }: { runtime: PortalRuntime; version?: string | null }) {
  const jvm = runtime.jvm
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5" data-testid="runtime-portal" aria-label="Portal">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile>
            <Package className="h-[17px] w-[17px]" />
          </IconTile>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold tracking-tight">Portal</span>
              {version && <span className="font-mono text-xs text-muted-foreground">v{version}</span>}
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              PID {runtime.processId} · JDK {runtime.javaVersion} · since {formatDateTimeShort(runtime.startedAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3.5">
          <Readout label="Uptime" value={formatUptime(runtime.uptimeMillis)} />
          <StatusPill status="UP" />
        </div>
      </div>

      <div className="grid gap-6 border-t pt-4 sm:grid-cols-2">
        <Gauge
          label="Heap memory"
          detail={heapDetail(jvm.heapUsedBytes, jvm.heapCommittedBytes, jvm.heapMaxBytes)}
          segments={heapSegments(jvm.heapUsedBytes, jvm.heapCommittedBytes, jvm.heapMaxBytes)}
          legend={[
            { color: GREEN_FG, text: 'used' },
            { color: GREEN_BG, text: 'committed' },
          ]}
        />
        <Gauge
          label="CPU"
          detail={`proc ${formatPercent(jvm.cpuProcess)} · sys ${formatPercent(jvm.cpuSystem)}`}
          // Empty (collapsed) bar when no reading, not a zero-width segment that
          // looks identical to a real 0% — matches heapSegments' null handling.
          segments={jvm.cpuProcess != null ? [{ pct: jvm.cpuProcess * 100, color: BLUE_FG }] : []}
          legend={[{ color: BLUE_FG, text: 'process' }]}
        />
      </div>

      <TileGrid cols={3}>
        <Tile label="Non-heap" value={formatBytes(jvm.nonHeapUsedBytes)} sub={`committed ${formatBytes(jvm.nonHeapCommittedBytes)}`} />
        <Tile label="Threads" value={jvm.threadsLive} sub={`peak ${jvm.threadsPeak} · daemon ${jvm.threadsDaemon}`} />
        <Tile label="GC" value={jvm.gcCount} sub={`${jvm.gcTimeMillis} ms total`} />
        <Tile label="Classes loaded" value={jvm.classesLoaded.toLocaleString()} sub={`${jvm.classesTotalLoaded.toLocaleString()} total`} />
        <Tile label="Load average" value={formatLoad(jvm.systemLoadAverage)} sub="system" />
        <Tile label="Processors" value={jvm.availableProcessors} sub="available" />
      </TileGrid>
    </section>
  )
}

function CrsCard({ runtime, version }: { runtime: CrsRuntime; version?: string | null }) {
  const jvm = runtime.jvm
  return (
    <section className="flex h-full flex-col gap-4 rounded-xl border bg-card p-5" data-testid="runtime-crs" aria-label="Registry service">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile>
            <Server className="h-[17px] w-[17px]" />
          </IconTile>
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold tracking-tight">Registry service</span>
            <span className="font-mono text-xs text-muted-foreground">CRS{version ? ` · v${version}` : ''}</span>
          </div>
        </div>
        <StatusPill status={runtime.status} />
      </div>

      {runtime.available && jvm ? (
        <TileGrid cols={2}>
          <Tile label="Uptime" value={runtime.uptimeMillis != null ? formatUptime(runtime.uptimeMillis) : '—'} />
          <Tile label="Heap" value={formatBytes(jvm.heapUsedBytes)} sub={`max ${formatBytes(jvm.heapMaxBytes)}`} />
          <Tile
            label="Threads"
            value={jvm.threadsLive ?? '—'}
            sub={jvm.threadsPeak != null ? `peak ${jvm.threadsPeak}` : undefined}
          />
          <Tile label="GC" value={jvm.gcCount ?? '—'} sub={jvm.gcTimeMillis != null ? `${jvm.gcTimeMillis} ms total` : undefined} />
          <Tile label="CPU" value={formatPercent(jvm.cpuProcess)} sub={`sys ${formatPercent(jvm.cpuSystem)}`} />
          <Tile label="Processors" value={jvm.availableProcessors ?? '—'} />
        </TileGrid>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 p-6 text-center">
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
            <CircleAlert className="h-[17px] w-[17px]" />
          </span>
          <span className="text-sm font-semibold text-foreground">JVM metrics unavailable</span>
          <span className="max-w-[300px] text-xs leading-relaxed text-muted-foreground">
            {runtime.reason ??
              'CRS rejected the relayed token, actuator metrics are role-locked, or CRS is unreachable.'}{' '}
            Health status and version are still read from CRS.
          </span>
        </div>
      )}
    </section>
  )
}

function RecentLoginsCard({ logins }: { logins: RecentLogin[] }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-xl border bg-card p-5" data-testid="runtime-logins" aria-label="Recent logins">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-semibold tracking-tight">Recent logins</span>
        <span className="text-xs text-muted-foreground">Last {logins.length} · this instance</span>
      </div>
      {logins.length === 0 ? (
        <EmptyState message="No recent logins." className="py-6" />
      ) : (
        <div className="flex flex-col">
          {logins.map((login, i) => (
            <div
              key={`${login.username}-${login.loginAt}-${i}`}
              className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"
            >
              <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold" aria-hidden>
                  {initials(login.username)}
                </span>
                <span className="truncate" title={login.username}>
                  {login.username}
                </span>
              </span>
              <RelativeTime ts={login.loginAt} className="shrink-0 text-sm text-muted-foreground" />
            </div>
          ))}
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Per-pod, in-memory — resets on restart. Cross-pod history needs a shared session store.
      </p>
    </section>
  )
}

function SummaryBanner({ status, portal }: { status: SystemStatus; portal: PortalRuntime }) {
  const meta = STATUS_META[status]
  const jvm = portal.jvm
  return (
    <div
      className={cn('flex flex-wrap items-center gap-4 rounded-xl border p-4', meta.box)}
      data-testid="runtime-summary"
      data-status={status}
    >
      <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-card/70" aria-hidden>
        <span className={cn('h-[11px] w-[11px] rounded-full ring-4 ring-current/15', meta.dot)} />
      </span>
      <div className="flex flex-col gap-0.5">
        <span className={cn('text-base font-semibold tracking-tight', meta.text)}>{meta.label}</span>
        <span className="text-sm text-muted-foreground">{meta.sub}</span>
      </div>
      <div className="ml-auto flex items-center gap-7">
        <Readout label="Uptime" value={formatUptime(portal.uptimeMillis)} />
        <Readout label="Heap" value={formatBytes(jvm.heapUsedBytes)} />
        <Readout label="CPU" value={formatPercent(jvm.cpuProcess)} />
        <Readout label="Threads" value={String(jvm.threadsLive)} />
      </div>
    </div>
  )
}

/**
 * Admin System-tab runtime view: Portal + CRS uptime/JVM and recent logins, with
 * a status summary banner and live auto-refresh. Mounted only in the gated System
 * tab of the Admin page, but self-gates on `adminMode && IMPORT_DATA` too
 * (defense-in-depth) and passes the same gate into the polling hook so nothing
 * polls when hidden. Versions reuse the footer's `useCrsInfo`/`usePortalInfo`.
 */
export function RuntimeSection() {
  const { data: user } = useCurrentUser()
  const adminMode = useAdminMode((s) => s.enabled)
  const isAdmin = adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA)
  const { data, isLoading, isError, error, dataUpdatedAt, isFetching, refetch } = useSystemMetrics(isAdmin)
  const { data: portalInfo } = usePortalInfo()
  const { data: crsInfo } = useCrsInfo()

  if (!isAdmin) return null

  return (
    <div className="space-y-5" data-testid="runtime-section">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight">Runtime &amp; operations</h2>
          <p className="text-sm text-muted-foreground">
            Portal &amp; registry service metrics · this instance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-[7px] w-[7px] rounded-full bg-[color:var(--color-badge-green-fg)] motion-safe:animate-pulse" aria-hidden />
              Auto-refresh · every 10s · updated <RelativeTime ts={new Date(dataUpdatedAt).toISOString()} />
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="runtime-refresh"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'motion-safe:animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {isError ? (
        <InlineError
          message={
            error instanceof Error
              ? `Failed to load runtime metrics: ${error.message}`
              : 'Failed to load runtime metrics.'
          }
        />
      ) : isLoading || !data ? (
        <div className="space-y-4" data-testid="runtime-loading">
          <SkeletonBlock height="h-16" />
          <SkeletonBlock height="h-48" />
          <div className="grid gap-4 lg:grid-cols-2">
            <SkeletonBlock height="h-40" />
            <SkeletonBlock height="h-40" />
          </div>
        </div>
      ) : (
        <>
          <SummaryBanner status={deriveSystemStatus(data)} portal={data.portal} />
          <PortalCard runtime={data.portal} version={portalInfo?.version} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <CrsCard runtime={data.crs} version={crsInfo?.version} />
            <RecentLoginsCard logins={data.portal.recentLogins} />
          </div>
        </>
      )}
    </div>
  )
}
