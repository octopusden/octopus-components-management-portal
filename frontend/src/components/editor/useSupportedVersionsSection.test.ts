import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { SupportedVersionsResponse } from '../../lib/types'

// The section hook reads coverage from the dedicated supported-versions endpoint
// (NOT ComponentDetail), so mock those two hooks. `mockData` is swapped between
// renders to exercise the re-seed rules; `mockMutateAsync` captures the PUT.
let mockData: SupportedVersionsResponse | undefined
const mockMutateAsync = vi.fn<(req: unknown) => Promise<SupportedVersionsResponse>>()

vi.mock('../../hooks/useComponent', () => ({
  useSupportedVersions: () => ({ data: mockData, isLoading: mockData === undefined }),
  useUpdateSupportedVersions: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}))

import { useSupportedVersionsSection } from './useSupportedVersionsSection'

function resp(over: Partial<SupportedVersionsResponse> = {}): SupportedVersionsResponse {
  return { all: false, ranges: [], warnings: [], ...over }
}

beforeEach(() => {
  mockData = undefined
  mockMutateAsync.mockReset()
})

describe('useSupportedVersionsSection', () => {
  it('is clean initially and carries no diff', () => {
    mockData = resp({ ranges: ['[1.0,2.0)'] })
    const { result } = renderHook(() => useSupportedVersionsSection('c-1'))
    expect(result.current.isDirty).toBe(false)
    expect(result.current.diff).toEqual([])
    expect(result.current.state).toEqual({ all: false, ranges: ['[1.0,2.0)'] })
  })

  it('sorts the seeded ranges into canonical order', () => {
    mockData = resp({ ranges: ['[2.0,)', '[1.0,2.0)'] })
    const { result } = renderHook(() => useSupportedVersionsSection('c-1'))
    expect(result.current.state.ranges).toEqual(['[1.0,2.0)', '[2.0,)'])
  })

  it('addRange makes it dirty and appends in canonical order', () => {
    mockData = resp({ ranges: ['[1.0,2.0)'] })
    const { result } = renderHook(() => useSupportedVersionsSection('c-1'))
    act(() => result.current.addRange('[2.0,)'))
    expect(result.current.isDirty).toBe(true)
    expect(result.current.state.ranges).toEqual(['[1.0,2.0)', '[2.0,)'])
    expect(result.current.diff).toHaveLength(1)
    expect(result.current.diff[0]?.label).toBe('Supported Versions')
  })

  it('removeRange (multi) filters the range and stays bounded', () => {
    mockData = resp({ ranges: ['[1.0,2.0)', '[2.0,)'] })
    const { result } = renderHook(() => useSupportedVersionsSection('c-1'))
    act(() => result.current.removeRange('[2.0,)'))
    expect(result.current.isDirty).toBe(true)
    expect(result.current.state).toEqual({ all: false, ranges: ['[1.0,2.0)'] })
  })

  it('setAllVersions flips to all=true and the diff reads "All versions"', () => {
    mockData = resp({ ranges: ['[1.0,2.0)'] })
    const { result } = renderHook(() => useSupportedVersionsSection('c-1'))
    act(() => result.current.setAllVersions())
    expect(result.current.isDirty).toBe(true)
    expect(result.current.state).toEqual({ all: true, ranges: [] })
    expect(result.current.diff[0]?.newValue).toMatch(/all versions/i)
  })

  it('reset reverts the draft to the server snapshot', () => {
    mockData = resp({ ranges: ['[1.0,2.0)'] })
    const { result } = renderHook(() => useSupportedVersionsSection('c-1'))
    act(() => result.current.addRange('[2.0,)'))
    expect(result.current.isDirty).toBe(true)
    act(() => result.current.reset())
    expect(result.current.isDirty).toBe(false)
    expect(result.current.state.ranges).toEqual(['[1.0,2.0)'])
  })

  it('save() PUTs the bounded set and re-seeds to the MERGED server response (clean, no phantom dirty)', async () => {
    mockData = resp({ ranges: ['[1.0,2.0)'] })
    // Server merges the overlapping input into a single range on the way back.
    mockMutateAsync.mockResolvedValue(resp({ ranges: ['[1.0,3.0)'] }))
    const { result } = renderHook(() => useSupportedVersionsSection('c-1'))
    act(() => result.current.addRange('[1.5,3.0)'))
    await act(async () => {
      await result.current.save()
    })
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockMutateAsync.mock.calls[0]?.[0]).toEqual({ ranges: ['[1.0,2.0)', '[1.5,3.0)'] })
    // Re-seeded to the merged response → clean, showing the canonical set.
    expect(result.current.isDirty).toBe(false)
    expect(result.current.state.ranges).toEqual(['[1.0,3.0)'])
  })

  it('save() sends {all:true} when the draft is all-versions', async () => {
    mockData = resp({ ranges: ['[1.0,2.0)'] })
    mockMutateAsync.mockResolvedValue(resp({ all: true }))
    const { result } = renderHook(() => useSupportedVersionsSection('c-1'))
    act(() => result.current.setAllVersions())
    await act(async () => {
      await result.current.save()
    })
    expect(mockMutateAsync.mock.calls[0]?.[0]).toEqual({ all: true })
    expect(result.current.isDirty).toBe(false)
    expect(result.current.state.all).toBe(true)
  })

  it('save() forwards jiraTaskKey/changeComment into the PUT when present (variant B)', async () => {
    mockData = resp({ ranges: ['[1.0,2.0)'] })
    mockMutateAsync.mockResolvedValue(resp({ ranges: ['[1.0,2.0)', '[2.0,)'] }))
    const { result } = renderHook(() => useSupportedVersionsSection('c-1'))
    act(() => result.current.addRange('[2.0,)'))
    await act(async () => {
      await result.current.save({ jiraTaskKey: 'ABC-123', changeComment: 'widen coverage' })
    })
    expect(mockMutateAsync.mock.calls[0]?.[0]).toEqual({
      ranges: ['[1.0,2.0)', '[2.0,)'],
      jiraTaskKey: 'ABC-123',
      changeComment: 'widen coverage',
    })
  })

  it('save() omits blank/absent metadata from the PUT body (clean request)', async () => {
    mockData = resp({ ranges: ['[1.0,2.0)'] })
    mockMutateAsync.mockResolvedValue(resp({ all: true }))
    const { result } = renderHook(() => useSupportedVersionsSection('c-1'))
    act(() => result.current.setAllVersions())
    await act(async () => {
      await result.current.save({ jiraTaskKey: '   ', changeComment: '' })
    })
    // Blank values are dropped — the body stays exactly {all:true}, no empty strings.
    expect(mockMutateAsync.mock.calls[0]?.[0]).toEqual({ all: true })
  })

  it('save() throws and does NOT call the mutation on an empty bounded set (no silent widen — P3-2)', async () => {
    mockData = resp({ ranges: ['[1.0,2.0)'] })
    const { result } = renderHook(() => useSupportedVersionsSection('c-1'))
    // Filter the only range away directly (bypassing the tab's confirm→setAllVersions
    // guard) → a bounded, empty draft. save() must fail loudly, not PUT {ranges:[]}
    // (which the server collapses to all=true — a silent widen).
    act(() => result.current.removeRange('[1.0,2.0)'))
    expect(result.current.state).toEqual({ all: false, ranges: [] })
    await act(async () => {
      await expect(result.current.save()).rejects.toThrow(/empty|all versions/i)
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('adopts a fresh server value while clean (refetch), but keeps an in-progress edit', () => {
    mockData = resp({ ranges: ['[1.0,2.0)'] })
    const { result, rerender } = renderHook(() => useSupportedVersionsSection('c-1'))

    // Clean refetch brings a new server value → draft adopts it.
    mockData = resp({ ranges: ['[1.0,2.0)', '[2.0,)'] })
    rerender()
    expect(result.current.state.ranges).toEqual(['[1.0,2.0)', '[2.0,)'])
    expect(result.current.isDirty).toBe(false)

    // Now edit locally, then a same-value sibling refetch arrives → keep the edit.
    act(() => result.current.addRange('[3.0,)'))
    expect(result.current.isDirty).toBe(true)
    mockData = resp({ ranges: ['[2.0,)', '[1.0,2.0)'] }) // same set, different object/order
    rerender()
    expect(result.current.isDirty).toBe(true)
    expect(result.current.state.ranges).toContain('[3.0,)')
  })

  it('starts a fresh draft when the component id changes', () => {
    mockData = resp({ ranges: ['[1.0,2.0)'] })
    let id = 'c-1'
    const { result, rerender } = renderHook(() => useSupportedVersionsSection(id))
    act(() => result.current.addRange('[2.0,)'))
    expect(result.current.isDirty).toBe(true)

    // Navigate to a different component (new id + new server data) → fresh, clean.
    id = 'c-2'
    mockData = resp({ ranges: ['[5.0,)'] })
    rerender()
    expect(result.current.isDirty).toBe(false)
    expect(result.current.state.ranges).toEqual(['[5.0,)'])
  })
})
