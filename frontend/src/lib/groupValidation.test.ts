import { describe, it, expect } from 'vitest'
import { splitGroupIds, hasSupportedPrefix, findUnsupportedGroupId } from './groupValidation'

describe('splitGroupIds', () => {
  it('splits on comma and pipe, trims, drops blanks', () => {
    expect(splitGroupIds('com.a , com.b|com.c ,, ')).toEqual(['com.a', 'com.b', 'com.c'])
  })
  it('returns [] for blank/empty', () => {
    expect(splitGroupIds('')).toEqual([])
    expect(splitGroupIds('  ')).toEqual([])
  })
})

describe('hasSupportedPrefix', () => {
  it('matches by plain startsWith (mirrors CRS)', () => {
    expect(hasSupportedPrefix('com.openwaygroup.foo', ['com.openwaygroup'])).toBe(true)
    expect(hasSupportedPrefix('com.openwaygroup', ['com.openwaygroup'])).toBe(true)
    expect(hasSupportedPrefix('org.other.foo', ['com.openwaygroup'])).toBe(false)
  })
})

describe('findUnsupportedGroupId', () => {
  const supported = ['com.openwaygroup']
  it('returns undefined when all tokens are supported', () => {
    expect(findUnsupportedGroupId('com.openwaygroup.a, com.openwaygroup.b', supported)).toBeUndefined()
  })
  it('returns the first offending token', () => {
    expect(findUnsupportedGroupId('com.openwaygroup.a, org.bad.b', supported)).toBe('org.bad.b')
  })
  it('SKIPS (undefined) when the supported list is empty', () => {
    expect(findUnsupportedGroupId('literally.anything', [])).toBeUndefined()
  })
})
