import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useComponentTemplate } from './useComponentTemplate'
import { useTemplateRun, type TemplateRun } from './useTemplateRun'
import { api, ApiError } from '../lib/api'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } }
})
const mockApi = vi.mocked(api)

function makeWrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children)
}

const component = (name: string) => ({ name, baseConfiguration: {} }) as NonNullable<TemplateRun['component']>

function run(overrides: Partial<TemplateRun> = {}): TemplateRun {
  return { valid: true, parameterProblems: [], problems: [], component: component('abc-plugin-pay'), sources: {}, overridden: [], ...overrides }
}

const BODY = { parameters: { CODE: ['PAY'] }, overrides: {} }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => vi.clearAllMocks())

describe('useComponentTemplate', () => {
  it('reads the template description', async () => {
    mockApi.get.mockResolvedValue({ id: 'client-plugin', parameters: [] })
    const { result } = renderHook(() => useComponentTemplate('client-plugin'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith('/component-templates/client-plugin')
  })

  it('is read again when a new consumer mounts, so a reloaded template is seen', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockApi.get.mockResolvedValue({ id: 'client-plugin', parameters: [] })
    const first = renderHook(() => useComponentTemplate('client-plugin'), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
    first.unmount()
    renderHook(() => useComponentTemplate('client-plugin'), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledTimes(2))
  })

  it('asks for nothing without a template', () => {
    renderHook(() => useComponentTemplate(null), { wrapper: makeWrapper() })
    expect(mockApi.get).not.toHaveBeenCalled()
  })
})

describe('useTemplateRun', () => {
  it('sends a dry run and keeps its result', async () => {
    mockApi.post.mockResolvedValue(run())
    const { result } = renderHook(() => useTemplateRun('client-plugin'))
    await act(() => result.current.dryRun(BODY))
    expect(mockApi.post).toHaveBeenCalledWith('/component-templates/client-plugin/components?dryRun=true', BODY)
    expect(result.current.run).toEqual(run())
    expect(result.current.running).toBe(false)
  })

  it('returns the run it kept, and nothing for one a newer run replaced', async () => {
    const older = deferred<TemplateRun>()
    mockApi.post.mockReturnValueOnce(older.promise).mockResolvedValueOnce(run())
    const { result } = renderHook(() => useTemplateRun('client-plugin'))
    let first: Promise<TemplateRun | null> | undefined
    act(() => {
      first = result.current.dryRun(BODY)
    })
    let second: TemplateRun | null | undefined
    await act(async () => {
      second = await result.current.dryRun(BODY)
    })
    await act(async () => older.resolve(run()))
    expect(second).toEqual(run())
    expect(await first).toBeNull()
  })

  it('reports that a dry run is in flight', async () => {
    const pending = deferred<TemplateRun>()
    mockApi.post.mockReturnValue(pending.promise)
    const { result } = renderHook(() => useTemplateRun('client-plugin'))
    act(() => void result.current.dryRun(BODY))
    expect(result.current.running).toBe(true)
    await act(async () => pending.resolve(run()))
    expect(result.current.running).toBe(false)
  })

  it('discards the answer of a run a newer one replaced', async () => {
    const older = deferred<TemplateRun>()
    const newer = deferred<TemplateRun>()
    mockApi.post.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const { result } = renderHook(() => useTemplateRun('client-plugin'))
    act(() => void result.current.dryRun(BODY))
    act(() => void result.current.dryRun(BODY))
    await act(async () => newer.resolve(run({ component: component('newer') })))
    await act(async () => older.resolve(run({ component: component('older') })))
    expect(result.current.run?.component?.name).toBe('newer')
  })

  it('forgets the shown run when asked, and ignores a run still in flight', async () => {
    const pending = deferred<TemplateRun>()
    mockApi.post.mockResolvedValueOnce(run()).mockReturnValueOnce(pending.promise)
    const { result } = renderHook(() => useTemplateRun('client-plugin'))
    await act(() => result.current.dryRun(BODY))
    act(() => void result.current.dryRun(BODY))
    act(() => result.current.discard())
    await act(async () => pending.resolve(run({ component: component('late') })))
    expect(result.current.run).toBeNull()
    expect(result.current.running).toBe(false)
  })

  it('keeps the registry message and status of a refused dry run', async () => {
    mockApi.post.mockRejectedValue(new ApiError(403, 'overriding fields of template is not allowed for this user'))
    const { result } = renderHook(() => useTemplateRun('client-plugin'))
    await act(() => result.current.dryRun(BODY))
    expect(result.current.error).toEqual({ status: 403, message: 'overriding fields of template is not allowed for this user' })
    expect(result.current.run).toBeNull()
  })

  describe('create', () => {
    const CREATE = { ...BODY, jiraTaskKey: 'CD-1234', changeComment: 'first plugin' }

    it('posts without a dry run and returns the created component', async () => {
      mockApi.post.mockResolvedValue({ id: 'c-1', name: 'abc-plugin-pay' })
      const { result } = renderHook(() => useTemplateRun('client-plugin'))
      let outcome: Awaited<ReturnType<typeof result.current.create>> | undefined
      await act(async () => {
        outcome = await result.current.create(CREATE)
      })
      expect(mockApi.post).toHaveBeenCalledWith('/component-templates/client-plugin/components?dryRun=false', CREATE)
      expect(outcome).toEqual({ kind: 'created', component: { id: 'c-1', name: 'abc-plugin-pay' } })
    })

    it('shows the run a rejected create returns', async () => {
      const rejected = run({ valid: false, problems: [{ fields: ['name'], parameters: ['CODE'], templateProblem: false, message: 'name: taken' }] })
      mockApi.post.mockRejectedValue(new ApiError(422, 'rejected', JSON.stringify(rejected)))
      const { result } = renderHook(() => useTemplateRun('client-plugin'))
      let outcome: Awaited<ReturnType<typeof result.current.create>> | undefined
      await act(async () => {
        outcome = await result.current.create(CREATE)
      })
      expect(outcome).toEqual({ kind: 'rejected' })
      expect(result.current.run).toEqual(rejected)
    })

    it.each([
      [404, "Component template 'client-plugin' not found"],
      [403, 'You do not have permission to create components'],
      [400, 'Validation failed: jiraTaskKey: must be a Jira task key like ABC-123'],
    ])('returns a %i with the registry message', async (status, message) => {
      mockApi.post.mockRejectedValue(new ApiError(status, message))
      const { result } = renderHook(() => useTemplateRun('client-plugin'))
      let outcome: Awaited<ReturnType<typeof result.current.create>> | undefined
      await act(async () => {
        outcome = await result.current.create(CREATE)
      })
      expect(outcome).toEqual({ kind: 'failed', status, message })
    })
  })
})
