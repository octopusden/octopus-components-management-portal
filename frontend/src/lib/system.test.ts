import { describe, expect, it } from 'vitest'
import {
  deriveSystemStatus,
  formatBytes,
  formatDateTimeShort,
  formatLoad,
  formatPercent,
  formatUptime,
} from './system'
import type { SystemMetrics } from './types'

describe('formatUptime', () => {
  it('renders seconds under a minute', () => {
    expect(formatUptime(0)).toBe('0s')
    expect(formatUptime(45_000)).toBe('45s')
  })

  it('renders minutes and seconds under an hour', () => {
    expect(formatUptime(90_000)).toBe('1m 30s')
  })

  it('renders hours and minutes under a day', () => {
    expect(formatUptime(2 * 3_600_000 + 5 * 60_000)).toBe('2h 5m')
  })

  it('renders days, hours and minutes for long uptimes', () => {
    const ms = 3 * 86_400_000 + 4 * 3_600_000 + 12 * 60_000 + 5_000
    expect(formatUptime(ms)).toBe('3d 4h 12m')
  })
})

describe('formatBytes', () => {
  it('renders an em-dash for null/undefined', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(undefined)).toBe('—')
  })

  it('renders zero and raw bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('renders MiB with no decimals', () => {
    expect(formatBytes(536_870_912)).toBe('512 MiB')
    expect(formatBytes(805_306_368)).toBe('768 MiB')
  })

  it('renders GiB with two decimals', () => {
    expect(formatBytes(1_073_741_824)).toBe('1.00 GiB')
    expect(formatBytes(1_610_612_736)).toBe('1.50 GiB')
  })
})

describe('formatPercent', () => {
  it('renders an em-dash for null/undefined', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(undefined)).toBe('—')
  })

  it('renders a 0..1 ratio as a rounded percent', () => {
    expect(formatPercent(0.12)).toBe('12%')
    expect(formatPercent(0.5)).toBe('50%')
    expect(formatPercent(1)).toBe('100%')
  })
})

describe('formatLoad', () => {
  it('renders an em-dash for null/undefined', () => {
    expect(formatLoad(null)).toBe('—')
    expect(formatLoad(undefined)).toBe('—')
  })

  it('renders a load average to two decimals', () => {
    expect(formatLoad(2.345)).toBe('2.35')
    expect(formatLoad(0)).toBe('0.00')
  })
})

describe('formatDateTimeShort', () => {
  it('renders an em-dash for null/undefined/invalid', () => {
    expect(formatDateTimeShort(null)).toBe('—')
    expect(formatDateTimeShort(undefined)).toBe('—')
    expect(formatDateTimeShort('not-a-date')).toBe('—')
  })

  it('renders compact local "DD Mon HH:MM"', () => {
    // Construct via LOCAL components so the assertion is timezone-independent.
    const local = new Date(2026, 5, 25, 18, 51) // 25 Jun 2026 18:51 local
    expect(formatDateTimeShort(local.toISOString())).toBe('25 Jun 18:51')
  })
})

describe('deriveSystemStatus', () => {
  const base = (crs: SystemMetrics['crs']): SystemMetrics =>
    ({ portal: {} as SystemMetrics['portal'], crs })

  it('operational when CRS is UP and JVM available', () => {
    expect(deriveSystemStatus(base({ available: true, status: 'UP' }))).toBe('operational')
  })

  it('degraded when CRS is UP but JVM unavailable', () => {
    expect(
      deriveSystemStatus(base({ available: false, status: 'UP', reason: 'CRS metrics require authentication' })),
    ).toBe('degraded')
  })

  it('down when CRS is DOWN or unreachable (no status)', () => {
    expect(deriveSystemStatus(base({ available: false, status: 'DOWN' }))).toBe('down')
    expect(deriveSystemStatus(base({ available: false, reason: 'CRS unreachable: X' }))).toBe('down')
  })
})
