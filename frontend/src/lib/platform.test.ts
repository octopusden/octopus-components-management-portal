import { describe, it, expect, afterEach, vi } from 'vitest'
import { isMac } from './platform'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isMac', () => {
  it('detects a Mac platform string', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' } as Navigator)
    expect(isMac()).toBe(true)
  })

  it('returns false for a Windows platform string', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' } as Navigator)
    expect(isMac()).toBe(false)
  })

  it('prefers userAgentData.platform when available', () => {
    vi.stubGlobal('navigator', {
      platform: 'Win32',
      userAgentData: { platform: 'macOS' },
    } as unknown as Navigator)
    expect(isMac()).toBe(true)
  })
})
