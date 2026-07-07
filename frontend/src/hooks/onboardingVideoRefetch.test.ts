import { describe, it, expect } from 'vitest'
import { onboardingVideoRefetchInterval, ONBOARDING_VIDEO_POLL_MS } from './useInfo'

describe('onboardingVideoRefetchInterval', () => {
  it('polls only while loading', () => {
    expect(onboardingVideoRefetchInterval('loading')).toBe(ONBOARDING_VIDEO_POLL_MS)
  })

  it.each(['ready', 'disabled', 'failed', undefined] as const)('stops on terminal state %s', (status) => {
    expect(onboardingVideoRefetchInterval(status)).toBe(false)
  })
})
