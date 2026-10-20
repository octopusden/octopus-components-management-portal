import { describe, expect, it } from 'vitest'
import { getTeamCityValidationTypeInfo } from './teamcityValidationTypes'

describe('getTeamCityValidationTypeInfo', () => {
  it('labels the VCS roots finding', () => {
    expect(getTeamCityValidationTypeInfo('VCS_ROOTS_DIFFER_FROM_REGISTRY').label).toBe('VCS roots differ from the registry')
  })

  it('falls back to the raw type for an unknown value', () => {
    expect(getTeamCityValidationTypeInfo('SOMETHING_NEW').label).toBe('SOMETHING_NEW')
  })
})
