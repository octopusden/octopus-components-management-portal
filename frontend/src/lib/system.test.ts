import { describe, expect, it } from 'vitest'
import {
  deriveServiceStatus,
  deriveSystemBanner,
  deriveSystemStatus,
  formatBytes,
  formatDateTimeShort,
  formatLoad,
  formatPercent,
  formatUptime,
} from './system'
import type { ServiceRuntime, SystemMetrics } from './types'

// An UP+available RMS so deriveSystemStatus's "worst of CRS and RMS" reflects CRS
// in the CRS-focused cases below.
const RMS_OK: ServiceRuntime = { available: true, status: 'UP', reachable: true }

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

describe('deriveServiceStatus', () => {
  it('operational when UP and JVM available', () => {
    const r = deriveServiceStatus({ available: true, status: 'UP', reachable: true }, 'CRS')
    expect(r.status).toBe('operational')
  })

  it('degraded when UP but JVM unavailable, with a JVM-metrics detail', () => {
    const r = deriveServiceStatus(
      { available: false, status: 'UP', reachable: true, reason: 'metrics require authentication' },
      'CRS',
    )
    expect(r.status).toBe('degraded')
    expect(r.sub).toMatch(/JVM metrics/i)
  })

  it('down with an "unreachable" detail when not reachable / status null', () => {
    const a = deriveServiceStatus({ available: false, reachable: false, reason: 'unreachable: X' }, 'CRS')
    expect(a.status).toBe('down')
    expect(a.sub).toMatch(/unreachable/i)
    const b = deriveServiceStatus({ available: false, reachable: true, status: null }, 'CRS')
    expect(b.status).toBe('down')
  })

  // Soft component (employeeService) is the SOLE down component → reachable-but-degraded,
  // and the detail surfaces the employeeService reason, NOT "down or unreachable".
  it('degraded (not down) when only the employeeService soft component is down', () => {
    const r = deriveServiceStatus(
      {
        available: false,
        status: 'DOWN',
        reachable: true,
        downComponents: ['employeeService'],
        employeeService: { status: 'DOWN', reason: 'person lookup failed (credentials / gateway route)' },
      },
      'CRS',
    )
    expect(r.status).toBe('degraded')
    expect(r.sub).toContain('person lookup failed')
    expect(r.sub.toLowerCase()).not.toContain('down or unreachable')
  })

  // legacyRelengIndicator is also a soft component (RMS integration).
  it('degraded when only the legacyRelengIndicator soft component is down', () => {
    const r = deriveServiceStatus(
      { available: true, status: 'DOWN', reachable: true, downComponents: ['legacyRelengIndicator'] },
      'RMS',
    )
    expect(r.status).toBe('degraded')
    expect(r.sub).toContain('legacyRelengIndicator')
  })

  it('down when a core component (db) is among the down components', () => {
    const r = deriveServiceStatus(
      {
        available: false,
        status: 'DOWN',
        reachable: true,
        downComponents: ['db', 'employeeService'],
      },
      'CRS',
    )
    expect(r.status).toBe('down')
    expect(r.sub).toContain('db')
  })

  it('down when aggregate is non-UP but no down components are named', () => {
    const r = deriveServiceStatus({ available: false, status: 'DOWN', reachable: true, downComponents: [] }, 'CRS')
    expect(r.status).toBe('down')
  })
})

describe('deriveSystemStatus / deriveSystemBanner', () => {
  const base = (crs: ServiceRuntime, rms: ServiceRuntime = RMS_OK): SystemMetrics =>
    ({ portal: {} as SystemMetrics['portal'], crs, rms })

  it('operational when CRS and RMS are both UP and available', () => {
    expect(deriveSystemStatus(base({ available: true, status: 'UP', reachable: true }))).toBe('operational')
  })

  it('degraded when CRS is UP but JVM unavailable', () => {
    expect(
      deriveSystemStatus(base({ available: false, status: 'UP', reachable: true, reason: 'metrics require authentication' })),
    ).toBe('degraded')
  })

  it('down when CRS is DOWN (core) or unreachable', () => {
    expect(deriveSystemStatus(base({ available: false, status: 'DOWN', reachable: true, downComponents: ['db'] }))).toBe('down')
    expect(deriveSystemStatus(base({ available: false, reachable: false, reason: 'unreachable: X' }))).toBe('down')
  })

  it('overall is the WORST of CRS and RMS', () => {
    // CRS operational, RMS down → overall down.
    expect(
      deriveSystemStatus(base({ available: true, status: 'UP', reachable: true }, { available: false, reachable: false })),
    ).toBe('down')
  })

  it('banner surfaces the employeeService reason when CRS is only soft-degraded', () => {
    const banner = deriveSystemBanner(
      base({
        available: false,
        status: 'DOWN',
        reachable: true,
        downComponents: ['employeeService'],
        employeeService: { status: 'DOWN', reason: 'person lookup failed (credentials / gateway route)' },
      }),
    )
    expect(banner.status).toBe('degraded')
    expect(banner.sub).toContain('person lookup failed')
    expect(banner.sub.toLowerCase()).not.toContain('down or unreachable')
  })

  it('ties at the worst rank are driven by CRS', () => {
    const down: ServiceRuntime = { available: false, status: 'DOWN', reachable: true, downComponents: ['db'] }
    const banner = deriveSystemBanner(base(down, down))
    expect(banner.status).toBe('down')
    expect(banner.label).toContain('CRS')
  })

  it('CRS degraded + RMS down → overall down, banner driven by RMS', () => {
    const banner = deriveSystemBanner(
      base(
        {
          available: false,
          status: 'DOWN',
          reachable: true,
          downComponents: ['employeeService'],
          employeeService: { status: 'DOWN', reason: 'x' },
        },
        { available: false, reachable: false, reason: 'unreachable: ConnectException' },
      ),
    )
    expect(banner.status).toBe('down')
    expect(banner.label).toContain('RMS')
  })

  it('falls back to CRS-only when rms is absent (older backend)', () => {
    const metrics = {
      portal: {} as SystemMetrics['portal'],
      crs: { available: true, status: 'UP', reachable: true },
    } as SystemMetrics
    const banner = deriveSystemBanner(metrics)
    expect(banner.status).toBe('operational')
    expect(banner.sub).not.toContain('RMS')
  })
})
