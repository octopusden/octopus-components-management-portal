import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useToast, toast } from './use-toast'

// The toast store is a module-level singleton, so each test asserts on the
// specific toast it created (by id), not on array position — that keeps the
// tests independent of residue from earlier tests.
describe('use-toast — sticky destructive toasts', () => {
  it('destructive toasts do not auto-dismiss (duration = Infinity)', () => {
    const { result } = renderHook(() => useToast())
    let handle: { id: string } | undefined
    act(() => {
      handle = toast({ variant: 'destructive', title: 'boom' })
    })
    expect(result.current.toasts.find((t) => t.id === handle!.id)?.duration).toBe(Infinity)
  })

  it('default toasts keep the normal (auto) duration', () => {
    const { result } = renderHook(() => useToast())
    let handle: { id: string } | undefined
    act(() => {
      handle = toast({ title: 'ok' })
    })
    expect(result.current.toasts.find((t) => t.id === handle!.id)?.duration).toBeUndefined()
  })

  it('an explicit duration overrides the destructive default', () => {
    const { result } = renderHook(() => useToast())
    let handle: { id: string } | undefined
    act(() => {
      handle = toast({ variant: 'destructive', title: 'x', duration: 3000 })
    })
    expect(result.current.toasts.find((t) => t.id === handle!.id)?.duration).toBe(3000)
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
        vi.runAllTimers()
      })
      expect(result.current.toasts.find((t) => t.id === id)).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
