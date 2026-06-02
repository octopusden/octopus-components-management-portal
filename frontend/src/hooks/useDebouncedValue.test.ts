import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from './useDebouncedValue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useDebouncedValue', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300))
    expect(result.current).toBe('a')
  })

  it('updates only after the delay elapses', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'a' },
    })
    rerender({ v: 'b' })
    expect(result.current).toBe('a') // not yet
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('a')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('b')
  })

  it('resets the timer on rapid changes (only the last value lands)', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'a' },
    })
    rerender({ v: 'b' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ v: 'c' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('a') // 'b' never settled
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('c')
  })
})
