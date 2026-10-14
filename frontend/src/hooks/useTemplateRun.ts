import { useCallback, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { components } from '../lib/api/schema'
import type { ComponentDetail } from '../lib/types'
import type { TemplateRunBody } from '../lib/component/templateParameters'

export type TemplateRun = components['schemas']['TemplateRunResponse']

export interface TemplateCreateBody extends TemplateRunBody {
  jiraTaskKey?: string
  changeComment?: string
}

export interface RunFailure {
  status: number
  message: string
}

export type CreateOutcome =
  | { kind: 'created'; component: ComponentDetail }
  /** The registry found problems; they replace the shown run. */
  | { kind: 'rejected' }
  | ({ kind: 'failed' } & RunFailure)

const failureOf = (e: unknown): RunFailure =>
  e instanceof ApiError ? { status: e.status, message: e.message } : { status: 0, message: String(e) }

function runOf(e: unknown): TemplateRun | null {
  if (!(e instanceof ApiError) || e.status !== 422) return null
  try {
    return JSON.parse(e.rawBody) as TemplateRun
  } catch {
    return null
  }
}

/**
 * Dry runs and the create for one template, with the run Review shows.
 *
 * Only the newest dry run's answer is kept: an answer to a run that a newer one replaced, or that
 * [discard] dropped, is ignored. [create] does not go through that ordering; the caller waits for it.
 */
export function useTemplateRun(templateId: string) {
  const [run, setRun] = useState<TemplateRun | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<RunFailure | null>(null)
  const latest = useRef(0)
  const path = `/component-templates/${encodeURIComponent(templateId)}/components`

  const dryRun = useCallback(
    async (body: TemplateRunBody) => {
      const seq = ++latest.current
      setRunning(true)
      try {
        const result = await api.post<TemplateRun>(`${path}?dryRun=true`, body)
        if (seq !== latest.current) return
        setRun(result)
        setError(null)
      } catch (e) {
        if (seq !== latest.current) return
        setRun(null)
        setError(failureOf(e))
      } finally {
        if (seq === latest.current) setRunning(false)
      }
    },
    [path],
  )

  const discard = useCallback(() => {
    latest.current++
    setRun(null)
    setError(null)
    setRunning(false)
  }, [])

  const create = useCallback(
    async (body: TemplateCreateBody): Promise<CreateOutcome> => {
      try {
        return { kind: 'created', component: await api.post<ComponentDetail>(`${path}?dryRun=false`, body) }
      } catch (e) {
        const rejected = runOf(e)
        if (!rejected) return { kind: 'failed', ...failureOf(e) }
        latest.current++
        setRun(rejected)
        setError(null)
        return { kind: 'rejected' }
      }
    },
    [path],
  )

  return { run, running, error, dryRun, discard, create }
}
