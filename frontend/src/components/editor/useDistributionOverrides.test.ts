import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDistributionOverrides } from './useDistributionOverrides'
import type { FieldOverride } from '../../lib/types'

let mockEffective: FieldOverride[] = []
const mockQueueDelete = vi.fn()

vi.mock('./overridesDraft', () => ({
  useOverridesDraft: () => ({
    serverOverrides: mockEffective,
    effectiveOverrides: mockEffective,
    isLoading: false,
    isDirty: false,
    queueCreate: vi.fn(),
    queueUpdate: vi.fn(),
    queueDelete: mockQueueDelete,
    reset: vi.fn(),
  }),
}))

function fo(attr: string, range: string, id = `${attr}${range}`): FieldOverride {
  return {
    id,
    overriddenAttribute: attr,
    versionRange: range,
    rowType: 'MARKER',
    value: null,
    markerChildren: {},
    createdAt: null,
    updatedAt: null,
  }
}

beforeEach(() => {
  mockQueueDelete.mockReset()
  mockEffective = []
})

describe('useDistributionOverrides', () => {
  it('groups only the four distribution marker paths, ignoring scalar/other-marker paths', () => {
    mockEffective = [
      fo('distribution.docker', '[1,2)'),
      fo('distribution.docker', '[2,3)'),
      fo('distribution.maven', '[1,2)'),
      fo('build.javaVersion', '[1,2)'),
      fo('vcs.settings', '[1,2)'),
    ]
    const { result } = renderHook(() => useDistributionOverrides())
    expect(result.current.byPath['distribution.docker']).toHaveLength(2)
    expect(result.current.byPath['distribution.maven']).toHaveLength(1)
    expect(result.current.byPath['distribution.fileUrl']).toHaveLength(0)
    expect(result.current.byPath['distribution.packages']).toHaveLength(0)
    expect(result.current.total).toBe(3)
  })

  it('sorts variants within a path by version range (numeric-aware)', () => {
    mockEffective = [
      fo('distribution.docker', '[2,3)', 'b'),
      fo('distribution.docker', '[1,2)', 'a'),
    ]
    const { result } = renderHook(() => useDistributionOverrides())
    expect(result.current.byPath['distribution.docker'].map((o) => o.id)).toEqual(['a', 'b'])
  })

  it('passes queueDelete through', () => {
    const { result } = renderHook(() => useDistributionOverrides())
    result.current.queueDelete('fo-9')
    expect(mockQueueDelete).toHaveBeenCalledWith('fo-9')
  })
})
