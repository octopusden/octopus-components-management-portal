import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useToast, toast } from './use-toast'

describe('use-toast — sticky destructive toasts', () => {
  it('destructive toasts do not auto-dismiss (duration = Infinity)', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      toast({ variant: 'destructive', title: 'boom' })
    })
    expect(result.current.toasts[0]?.duration).toBe(Infinity)
  })

  it('default toasts keep the normal (auto) duration', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      toast({ title: 'ok' })
    })
    expect(result.current.toasts[0]?.duration).toBeUndefined()
  })

  it('an explicit duration overrides the destructive default', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      toast({ variant: 'destructive', title: 'x', duration: 3000 })
    })
    expect(result.current.toasts[0]?.duration).toBe(3000)
  })

  it('a destructive toast is still removed after an explicit dismiss', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useToast())
      let handle: { id: string; dismiss: () => void } | undefined
      act(() => {
        handle = toast({ variant: 'destructive', title: 'bye' })
      })
      const id = handle!.id
      expect(result.current.toasts.find((t) => t.id === id)).toBeTruthy()
      act(() => {
        handle!.dismiss()
      })
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(result.current.toasts.find((t) => t.id === id)).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
