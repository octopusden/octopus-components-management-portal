// Null-tolerant formatters + status derivation for the admin System tab (uptime,
// JVM/system metrics). CRS metrics are best-effort and frequently absent, so every
// formatter renders an em-dash for null/undefined rather than "NaN"/"0".

import type { ServiceRuntime, SystemMetrics } from './types'

const EM_DASH = '—'

export type SystemStatus = 'operational' | 'degraded' | 'down'

/** Detail bundle for one service (or the overall banner): status + dynamic copy. */
export interface ServiceStatusDetail {
  status: SystemStatus
  label: string
  sub: string
}

// Integration components whose failure is a partial degradation (the service is
// still up for everything else), NOT a full outage:
//  - employeeService       — CRS person/owner validation (employee-service backend).
//  - legacyRelengIndicator — RMS → legacy release-engineering integration.
// A non-UP aggregate caused SOLELY by these reads as `degraded`, not `down`.
const SOFT_COMPONENTS = new Set(['employeeService', 'legacyRelengIndicator'])

// down beats degraded beats operational, so the overall banner shows the worst.
const STATUS_RANK: Record<SystemStatus, number> = { operational: 0, degraded: 1, down: 2 }

function worst(a: SystemStatus, b: SystemStatus): SystemStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b
}

/**
 * Per-service status + dynamic copy for the System tab. `name` is the display
 * name used in the copy (e.g. "CRS", "RMS"). Rules:
 * - unreachable (or no status) → `down`, "<name> is unreachable".
 * - status UP → available ? operational : degraded (JVM metrics unavailable).
 * - status non-UP but reachable → if every named down component is a SOFT
 *   integration component → `degraded` (name the reason / the component); else
 *   → `down` (real service disruption, name the down components).
 */
export function deriveServiceStatus(runtime: ServiceRuntime, name: string): ServiceStatusDetail {
  const reachable = runtime.reachable ?? false
  if (!reachable || runtime.status == null) {
    return { status: 'down', label: `${name} unreachable`, sub: `${name} is unreachable` }
  }

  if (runtime.status === 'UP') {
    return runtime.available
      ? { status: 'operational', label: `${name} operational`, sub: `${name} health UP` }
      : { status: 'degraded', label: `${name} degraded`, sub: `${name} JVM metrics unavailable` }
  }

  // Reachable but the aggregate health is non-UP.
  const down = runtime.downComponents ?? []
  const onlySoft = down.length > 0 && down.every((c) => SOFT_COMPONENTS.has(c))
  if (onlySoft) {
    // Prefer the employee-service reason when it is the cause (most actionable);
    // otherwise name the degraded integration component(s).
    const reason =
      down.includes('employeeService') && runtime.employeeService?.reason
        ? runtime.employeeService.reason
        : `${down.join(', ')} degraded`
    return {
      status: 'degraded',
      label: `${name} integration degraded`,
      sub: `${name} reachable · ${reason}`,
    }
  }

  const detail =
    down.length > 0 ? `${name} components down: ${down.join(', ')}` : `${name} reported ${runtime.status}`
  return { status: 'down', label: `${name} service disruption`, sub: detail }
}

/** The overall System-tab status: the worst of CRS and RMS. */
export function deriveSystemStatus(metrics: SystemMetrics): SystemStatus {
  return deriveSystemBanner(metrics).status
}

/**
 * The summary-banner detail: the worst of CRS and RMS, carrying that service's
 * dynamic copy so the banner names the real cause (e.g. an employee-service
 * outage shows the reason rather than a misleading "CRS is down or unreachable").
 * Operational shows a steady all-systems message.
 */
export function deriveSystemBanner(metrics: SystemMetrics): ServiceStatusDetail {
  const crs = deriveServiceStatus(metrics.crs, 'CRS')
  // `rms` is optional on the wire (older backend / local dev) — fall back to CRS only.
  const rms = metrics.rms ? deriveServiceStatus(metrics.rms, 'RMS') : null
  const overall = rms ? worst(crs.status, rms.status) : crs.status
  if (overall === 'operational') {
    return {
      status: 'operational',
      label: 'All systems operational',
      sub: rms
        ? 'Portal metrics live · CRS & RMS health UP · polled every 10s'
        : 'Portal metrics live · CRS health UP · polled every 10s',
    }
  }
  // Show the worst service's detail; if both tie at the worst rank, CRS first.
  const driver = rms && STATUS_RANK[rms.status] > STATUS_RANK[crs.status] ? rms : crs
  return { status: overall, label: driver.label, sub: driver.sub }
}

/** Compact local date-time, e.g. "25 Jun 18:51"; em-dash for null/invalid. */
export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return EM_DASH
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return EM_DASH
  const month = d.toLocaleString('en-US', { month: 'short' })
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${month} ${hh}:${mm}`
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const

/** Human-friendly uptime, e.g. "3d 4h 12m", "2h 5m", "1m 30s", "45s". */
export function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/** Binary byte size (KiB/MiB/GiB…); em-dash for null/undefined. */
export function formatBytes(n: number | null | undefined): string {
  if (n == null) return EM_DASH
  if (n === 0) return '0 B'
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), BYTE_UNITS.length - 1)
  const value = n / 1024 ** i
  // GiB+ get two decimals; small sub-10 non-byte values get one; otherwise integer.
  const decimals = i >= 3 ? 2 : i >= 1 && value < 10 ? 1 : 0
  return `${value.toFixed(decimals)} ${BYTE_UNITS[i]}`
}

/** A 0..1 ratio as a rounded percent; em-dash for null/undefined. */
export function formatPercent(ratio: number | null | undefined): string {
  if (ratio == null) return EM_DASH
  return `${Math.round(ratio * 100)}%`
}

/** System load average to two decimals; em-dash for null/undefined. */
export function formatLoad(n: number | null | undefined): string {
  if (n == null) return EM_DASH
  return n.toFixed(2)
}
