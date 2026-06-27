import * as React from 'react'
import { useAdminMode } from '@/lib/adminModeStore'
import { hasPermission, PERMISSIONS } from '@/lib/auth'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useSystemMetrics } from '@/hooks/useSystemMetrics'
import { useCrsInfo, usePortalInfo } from '@/hooks/useInfo'
import { formatBytes, formatLoad, formatPercent, formatUptime } from '@/lib/system'
import type { CrsRuntime, PortalRuntime, RecentLogin } from '@/lib/types'
import { InlineError } from './ui/inline-error'
import { EmptyState } from './ui/empty-state'
import { SkeletonBlock } from './ui/skeleton-block'
import { RelativeTime } from './ui/RelativeTime'

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-right font-medium">{value}</span>
    </div>
  )
}

function RuntimeCard({
  title,
  version,
  testId,
  children,
}: {
  title: string
  version?: string | null
  testId: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border p-5 space-y-3" data-testid={testId} aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {version && <span className="text-xs tabular-nums text-muted-foreground">v{version}</span>}
      </div>
      {children}
    </section>
  )
}

/** Used/total bytes with an optional percentage when the max is known. */
function heapValue(used: number | null | undefined, max: number | null | undefined): string {
  const base = `${formatBytes(used)} / ${formatBytes(max)}`
  if (used != null && max != null && max > 0) return `${base} (${formatPercent(used / max)})`
  return base
}

function PortalCard({ runtime, version }: { runtime: PortalRuntime; version?: string | null }) {
  const jvm = runtime.jvm
  return (
    <RuntimeCard title="Portal" version={version} testId="runtime-portal">
      <MetricRow label="Uptime" value={formatUptime(runtime.uptimeMillis)} />
      <MetricRow label="Heap" value={heapValue(jvm.heapUsedBytes, jvm.heapMaxBytes)} />
      <MetricRow label="Non-heap" value={formatBytes(jvm.nonHeapUsedBytes)} />
      <MetricRow
        label="Threads"
        value={`${jvm.threadsLive} (peak ${jvm.threadsPeak}, daemon ${jvm.threadsDaemon})`}
      />
      <MetricRow label="GC" value={`${jvm.gcCount} runs · ${jvm.gcTimeMillis} ms`} />
      <MetricRow
        label="CPU"
        value={`proc ${formatPercent(jvm.cpuProcess)} · sys ${formatPercent(jvm.cpuSystem)}`}
      />
      <MetricRow label="Load avg" value={formatLoad(jvm.systemLoadAverage)} />
      <MetricRow label="Classes loaded" value={jvm.classesLoaded.toLocaleString()} />
      <MetricRow label="Processors" value={jvm.availableProcessors} />
    </RuntimeCard>
  )
}

function CrsCard({ runtime, version }: { runtime: CrsRuntime; version?: string | null }) {
  const jvm = runtime.jvm
  return (
    <RuntimeCard title="Registry service" version={version} testId="runtime-crs">
      {runtime.status && <MetricRow label="Status" value={runtime.status} />}
      {runtime.available && jvm ? (
        <>
          <MetricRow
            label="Uptime"
            value={runtime.uptimeMillis != null ? formatUptime(runtime.uptimeMillis) : '—'}
          />
          <MetricRow label="Heap" value={heapValue(jvm.heapUsedBytes, jvm.heapMaxBytes)} />
          {jvm.threadsLive != null && (
            <MetricRow
              label="Threads"
              value={`${jvm.threadsLive}${jvm.threadsPeak != null ? ` (peak ${jvm.threadsPeak})` : ''}`}
            />
          )}
          {jvm.gcCount != null && (
            <MetricRow label="GC" value={`${jvm.gcCount} runs · ${jvm.gcTimeMillis ?? '—'} ms`} />
          )}
          {(jvm.cpuProcess != null || jvm.cpuSystem != null) && (
            <MetricRow
              label="CPU"
              value={`proc ${formatPercent(jvm.cpuProcess)} · sys ${formatPercent(jvm.cpuSystem)}`}
            />
          )}
          {jvm.availableProcessors != null && (
            <MetricRow label="Processors" value={jvm.availableProcessors} />
          )}
        </>
      ) : (
        <EmptyState
          message={runtime.reason ?? 'Registry runtime metrics are unavailable.'}
          className="py-6"
        />
      )}
    </RuntimeCard>
  )
}

function RecentLoginsCard({ logins }: { logins: RecentLogin[] }) {
  return (
    <RuntimeCard title="Recent logins" testId="runtime-logins">
      {logins.length === 0 ? (
        <EmptyState message="No logins recorded on this instance yet." className="py-6" />
      ) : (
        <>
          <ul className="space-y-2">
            {logins.map((login, i) => (
              <li key={`${login.username}-${login.loginAt}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium" title={login.username}>
                  {login.username}
                </span>
                <RelativeTime ts={login.loginAt} className="shrink-0 text-muted-foreground" />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Last {logins.length} · this instance only.</p>
        </>
      )}
    </RuntimeCard>
  )
}

/**
 * Admin Runtime section on the Health page: Portal + CRS uptime/JVM and recent
 * logins. Self-gated on adminMode && IMPORT_DATA — `/health` is route-gated on
 * IMPORT_DATA only (admin mode merely hides the nav item), so without this gate
 * a non-admin-mode IMPORT_DATA user landing on `/health` directly would see it.
 * The same gate is passed into the polling hook so nothing polls when hidden.
 * Versions reuse the footer's `useCrsInfo`/`usePortalInfo` rather than refetching.
 */
export function RuntimeSection() {
  const { data: user } = useCurrentUser()
  const adminMode = useAdminMode((s) => s.enabled)
  const isAdmin = adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA)
  const { data, isLoading, isError, error, dataUpdatedAt } = useSystemMetrics(isAdmin)
  const { data: portalInfo } = usePortalInfo()
  const { data: crsInfo } = useCrsInfo()

  if (!isAdmin) return null

  return (
    <section className="space-y-4" data-testid="runtime-section" aria-labelledby="runtime-heading">
      <div className="flex items-baseline justify-between gap-3">
        <div className="space-y-1">
          <h2 id="runtime-heading" className="text-lg font-semibold">
            Runtime
          </h2>
          <p className="text-sm text-muted-foreground">
            Portal and registry service uptime and JVM metrics (this instance).
          </p>
        </div>
        {data && (
          <span className="shrink-0 text-xs text-muted-foreground">
            updated <RelativeTime ts={new Date(dataUpdatedAt).toISOString()} />
          </span>
        )}
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
        <div className="grid gap-4 lg:grid-cols-3" data-testid="runtime-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-5 space-y-3">
              <SkeletonBlock width="w-1/3" />
              <SkeletonBlock />
              <SkeletonBlock width="w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <PortalCard runtime={data.portal} version={portalInfo?.version} />
          <CrsCard runtime={data.crs} version={crsInfo?.version} />
          <RecentLoginsCard logins={data.portal.recentLogins} />
        </div>
      )}
    </section>
  )
}
