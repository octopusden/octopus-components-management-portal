import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../lib/api'
import { classifyConflictBody, describeOptimisticConflict } from '../lib/conflict'
import type { ComponentDetail } from '../lib/types'

// Shared 409 handler for component-PATCH callsites. Returns an async function
// that takes the caught error and returns the toast options
// ({ title, description }) if the error was a 409, or null otherwise. Callers
// fire their own toast — the hook stays toast-singleton agnostic so tab tests
// that mock a `toast` prop still intercept the call.
//
// A 409 is NOT always an optimistic-lock conflict. Dispatch on the
// ErrorResponse.errorCode (CRS #358):
//  - UNIQUENESS_VIOLATION — the submitted value clashes with another component
//    (duplicate distribution GAV / jira pair / docker image / component name).
//    Show the SERVER's message verbatim; do NOT refetch — reload cannot fix a
//    value conflict, and the old "updated by another user, reload" advice sent
//    users into a futile loop (the QA incident this fixes).
//  - any other non-OPTIMISTIC_LOCK code — generic "Save failed" + server
//    message (unknown future codes degrade gracefully).
//  - OPTIMISTIC_LOCK, or no errorCode (older server) — the reload-and-reapply
//    flow: refetchQueries — not invalidateQueries — so the next getQueryData
//    sees the post-conflict server snapshot (invalidate only marks stale and
//    resolves once an observer re-subscribes, which would leave getQueryData
//    reading the old cache).
export function useOptimisticConflict(componentId: string | undefined) {
  const queryClient = useQueryClient()
  return async (err: unknown): Promise<{ title: string; description: string } | null> => {
    if (!(err instanceof ApiError) || err.status !== 409) return null
    const { errorCode, errorMessage } = classifyConflictBody(err.rawBody)
    if (errorCode === 'UNIQUENESS_VIOLATION') {
      return {
        title: 'Uniqueness violation',
        description: errorMessage ?? err.message,
      }
    }
    if (errorCode !== null && errorCode !== 'OPTIMISTIC_LOCK') {
      return {
        title: 'Save failed',
        description: errorMessage ?? err.message,
      }
    }
    const key = ['component', componentId ?? '']
    await queryClient.refetchQueries({ queryKey: key, type: 'active' })
    const latest = queryClient.getQueryData<ComponentDetail>(key)
    return describeOptimisticConflict(latest)
  }
}
