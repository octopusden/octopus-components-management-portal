// Null-tolerant formatters + status derivation for the admin System tab (uptime,
// JVM/system metrics). CRS metrics are best-effort and frequently absent, so every
// formatter renders an em-dash for null/undefined rather than "NaN"/"0".

import type { SystemMetrics } from './types'

const EM_DASH = '—'

export type SystemStatus = 'operational' | 'degraded' | 'down'

/**
 * Overall status driving the System tab summary banner (portal metrics are
 * always loaded when this runs):
 * - `operational` — CRS health UP **and** CRS JVM metrics available.
 * - `degraded`   — CRS health UP but JVM metrics unavailable/partial (e.g. the
 *   relayed token was rejected / actuator role-locked).
 * - `down`       — CRS DOWN, UNKNOWN, or unreachable (no health status).
 */
export function deriveSystemStatus(metrics: SystemMetrics): SystemStatus {
  const crs = metrics.crs
  if (crs.status === 'UP') return crs.available ? 'operational' : 'degraded'
  return 'down'
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
