import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../lib/api'
import { describeOptimisticConflict } from '../lib/conflict'
import type { ComponentDetail } from '../lib/types'

// Shared optimistic-locking (409) handler for component-PATCH callsites.
// Returns an async function that takes the caught error and returns the
// toast options ({ title, description }) if the error was a 409, or null
// otherwise. Callers fire their own toast — the hook stays toast-singleton
// agnostic so tab tests that mock a `toast` prop still intercept the call.
//
// When the error is a 409, refetchQueries — not invalidateQueries — so the
// next getQueryData sees the post-conflict server snapshot. invalidate only
// marks stale and resolves once an observer re-subscribes, which would
// leave getQueryData reading the old cache.
//
// Previously inline in ComponentDetailPage; tab-level Saves (Build / Jira /
// Vcs / Escrow / Distribution) only toasted "Please refresh and try again"
// without refetching, leaving the user in a stale-form loop where every
// retry would 409 again. Extracted so all callsites share the same UX.
export function useOptimisticConflict(componentId: string | undefined) {
  const queryClient = useQueryClient()
  return async (err: unknown): Promise<{ title: string; description: string } | null> => {
    if (!(err instanceof ApiError) || err.status !== 409) return null
    const key = ['component', componentId ?? '']
    await queryClient.refetchQueries({ queryKey: key, type: 'active' })
    const latest = queryClient.getQueryData<ComponentDetail>(key)
    return describeOptimisticConflict(latest)
  }
}
