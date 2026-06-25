import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useComponents } from './useComponents'
import { api } from '../lib/api'
import type { Page, ComponentSummary, ComponentFilter } from '../lib/types'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

const mockApi = vi.mocked(api)

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const emptyPage: Page<ComponentSummary> = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 20,
  first: true,
  last: true,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useComponents — URL params', () => {
  it('requests page 0 with default size and sort', async () => {
    mockApi.get.mockResolvedValue(emptyPage)

    const { result } = renderHook(() => useComponents(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('page=0')
    expect(calledUrl).toContain('size=20')
    expect(calledUrl).toContain('sort=componentKey%2Casc')
  })

  it('passes canBeParent=true when set, and omits the param when unset', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { canBeParent: true } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('canBeParent=true')

    vi.clearAllMocks()
    mockApi.get.mockResolvedValue(emptyPage)
    const { result: r2 } = renderHook(() => useComponents(), { wrapper: makeWrapper() })
    await waitFor(() => expect(r2.current.isSuccess).toBe(true))
    const url2 = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url2).not.toContain('canBeParent')
  })

  it('passes system filter as a single-value CSV when one option is picked', async () => {
    mockApi.get.mockResolvedValue(emptyPage)

    const { result } = renderHook(
      () => useComponents({ filter: { system: ['ALFA'] } }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('system=ALFA')
  })

  it('passes system filter as a CSV when multiple options are picked', async () => {
    mockApi.get.mockResolvedValue(emptyPage)

    const { result } = renderHook(
      () => useComponents({ filter: { system: ['ALFA', 'BRAVO'] } }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    // URLSearchParams percent-encodes the comma in a CSV value.
    expect(calledUrl).toContain('system=ALFA%2CBRAVO')
  })

  it('passes archived filter when set', async () => {
    mockApi.get.mockResolvedValue(emptyPage)

    const { result } = renderHook(
      () => useComponents({ filter: { archived: true } }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('archived=true')
  })

  it('does not include system param when filter is undefined', async () => {
    mockApi.get.mockResolvedValue(emptyPage)

    const { result } = renderHook(() => useComponents(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('system=')
  })

  it('does not include system param when filter.system is an empty array', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { system: [] } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('system=')
  })

  it('uses custom page and size', async () => {
    mockApi.get.mockResolvedValue(emptyPage)

    const { result } = renderHook(
      () => useComponents({ page: 3, size: 50 }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('page=3')
    expect(calledUrl).toContain('size=50')
  })

  it('passes search filter when set', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { search: 'my-lib' } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('search=my-lib')
  })

  it('passes owner filter as a single-value CSV when one option is picked', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { owner: ['alice@example.com'] } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('owner=alice%40example.com')
  })

  it('passes owner filter as a CSV when multiple options are picked', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { owner: ['alice@example.com', 'bob@example.com'] } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    // URLSearchParams percent-encodes both the comma in the CSV and the @ in each value.
    expect(calledUrl).toContain('owner=alice%40example.com%2Cbob%40example.com')
  })

  it('does not include owner param when filter.owner is an empty array', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { owner: [] } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('owner=')
  })

  it('passes buildSystem filter as a single-value CSV when one option is picked', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { buildSystem: ['GRADLE'] } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toContain('buildSystem=GRADLE')
  })

  it('passes buildSystem filter as a CSV when multiple options are picked', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { buildSystem: ['GRADLE', 'MAVEN'] } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    // URLSearchParams percent-encodes the comma in a CSV value.
    expect(calledUrl).toContain('buildSystem=GRADLE%2CMAVEN')
  })

  it('does not include buildSystem param when filter is undefined or empty', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(() => useComponents(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('buildSystem=')
  })

  it('does not include buildSystem param when filter.buildSystem is an empty array', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { buildSystem: [] } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('buildSystem=')
  })

  it('passes labels filter as CSV when set', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const filter: ComponentFilter = { labels: ['x', 'y'] }
    const { result } = renderHook(
      () => useComponents({ filter }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    // URLSearchParams percent-encodes the comma in a CSV value.
    expect(calledUrl).toContain('labels=x%2Cy')
  })

  it('does not include labels param when filter.labels is empty or undefined', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const filter: ComponentFilter = { labels: [] }
    const { result } = renderHook(
      () => useComponents({ filter }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('labels=')
  })

  it('passes multi-value clientCode as CSV (SYS-046)', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { clientCode: ['ACME-PORTAL', 'OTHER-CC'] } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    // URLSearchParams percent-encodes the CSV comma.
    expect(url).toContain('clientCode=ACME-PORTAL%2COTHER-CC')
  })

  it('omits clientCode when the array is empty', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { clientCode: [] } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).not.toContain('clientCode=')
  })

  it('passes multi-value jiraProjectKey / parentComponentName / groupKey as CSV (SYS-046)', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () =>
        useComponents({
          filter: {
            jiraProjectKey: ['AAA', 'BBB'],
            parentComponentName: ['p1', 'p2'],
            groupKey: ['org.a', 'org.b'],
          },
        }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('jiraProjectKey=AAA%2CBBB')
    expect(url).toContain('parentComponentName=p1%2Cp2')
    expect(url).toContain('groupKey=org.a%2Corg.b')
  })

  it('passes multi-value releaseManager / securityChampion as CSV (Phase 1b)', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () =>
        useComponents({
          filter: { releaseManager: ['alice', 'bob'], securityChampion: ['carol'] },
        }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    // URLSearchParams percent-encodes the CSV comma.
    expect(url).toContain('releaseManager=alice%2Cbob')
    expect(url).toContain('securityChampion=carol')
  })

  it('omits releaseManager / securityChampion when the arrays are empty', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { releaseManager: [], securityChampion: [] } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).not.toContain('releaseManager=')
    expect(url).not.toContain('securityChampion=')
  })

  it('passes distributionExplicit / distributionExternal booleans (SYS-045)', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(
      () => useComponents({ filter: { distributionExplicit: true, distributionExternal: false } }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('distributionExplicit=true')
    expect(url).toContain('distributionExternal=false')
  })

  it('omits distribution params when unset', async () => {
    mockApi.get.mockResolvedValue(emptyPage)
    const { result } = renderHook(() => useComponents(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).not.toContain('distributionExplicit')
    expect(url).not.toContain('distributionExternal')
  })
})
