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
  | { kind: 'rejected'; run: TemplateRun }
  | ({ kind: 'failed' } & RunFailure)
  /** A rejection or failure that arrived after a newer dry run, or a discard; nothing changed. */
  | { kind: 'stale' }

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
 * [discard] dropped, is ignored, and [dryRun] resolves to `null` for it. [create] takes its place in
 * that order too: a created component always counts, since it exists, but a rejection or failure
 * that a newer run or a discard overtook resolves to `stale` and changes nothing.
 */
export function useTemplateRun(templateId: string) {
  const [run, setRun] = useState<TemplateRun | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<RunFailure | null>(null)
  const latest = useRef(0)
  const path = `/component-templates/${encodeURIComponent(templateId)}/components`

  const dryRun = useCallback(
    async (body: TemplateRunBody): Promise<TemplateRun | null> => {
      const seq = ++latest.current
      setRunning(true)
      try {
        const result = await api.post<TemplateRun>(`${path}?dryRun=true`, body)
        if (seq !== latest.current) return null
        setRun(result)
        setError(null)
        return result
      } catch (e) {
        if (seq !== latest.current) return null
        setRun(null)
        setError(failureOf(e))
        return null
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
      const seq = ++latest.current
      try {
        return { kind: 'created', component: await api.post<ComponentDetail>(`${path}?dryRun=false`, body) }
      } catch (e) {
        if (seq !== latest.current) return { kind: 'stale' }
        const rejected = runOf(e)
        if (!rejected) return { kind: 'failed', ...failureOf(e) }
        setRun(rejected)
        setError(null)
        return { kind: 'rejected', run: rejected }
      }
    },
    [path],
  )

  return { run, running, error, dryRun, discard, create }
}
