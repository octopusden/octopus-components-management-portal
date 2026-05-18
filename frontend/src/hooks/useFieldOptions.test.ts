import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useFieldOptions } from './useFieldOptions'
import { useFieldConfig } from './useAdminConfig'
import { api } from '../lib/api'

vi.mock('./useAdminConfig', () => ({
  useFieldConfig: vi.fn(),
}))
vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }))

const mockUseFieldConfig = vi.mocked(useFieldConfig)
const mockApi = vi.mocked(api)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

function mockAdminConfigEmpty() {
  mockUseFieldConfig.mockReturnValue({
    data: {},
    isLoading: false,
  } as unknown as ReturnType<typeof useFieldConfig>)
}

function mockAdminConfigWithOptions(fieldPath: string, options: string[]) {
  // Use flat shape for simplicity — useFieldConfigEntry handles both.
  mockUseFieldConfig.mockReturnValue({
    data: { fields: { [fieldPath]: { options } } },
    isLoading: false,
  } as unknown as ReturnType<typeof useFieldConfig>)
}

beforeEach(() => vi.clearAllMocks())

describe('useFieldOptions — domain meta fallback', () => {
  it('fetches /components/meta/build-systems when admin options are empty', async () => {
    mockAdminConfigEmpty()
    mockApi.get.mockResolvedValue(['GRADLE', 'MAVEN', 'WHISKEY'])

    const { result } = renderHook(() => useFieldOptions('buildSystem'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.options.length).toBeGreaterThan(0))
    expect(result.current.options).toEqual(['GRADLE', 'MAVEN', 'WHISKEY'])
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toBe('/components/meta/build-systems')
  })

  it('fetches /components/meta/repository-types for repositoryType field', async () => {
    mockAdminConfigEmpty()
    mockApi.get.mockResolvedValue(['GIT', 'MERCURIAL'])

    const { result } = renderHook(() => useFieldOptions('repositoryType'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.options.length).toBeGreaterThan(0))
    expect(result.current.options).toEqual(['GIT', 'MERCURIAL'])
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toBe('/components/meta/repository-types')
  })

  it('fetches /components/meta/escrow-generations for generation field', async () => {
    mockAdminConfigEmpty()
    mockApi.get.mockResolvedValue(['AUTO', 'MANUAL', 'UNSUPPORTED'])

    const { result } = renderHook(() => useFieldOptions('generation'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.options.length).toBeGreaterThan(0))
    expect(result.current.options).toEqual(['AUTO', 'MANUAL', 'UNSUPPORTED'])
    const url = (mockApi.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toBe('/components/meta/escrow-generations')
  })

  it('prefers admin field-config options[] over meta endpoint', async () => {
    mockAdminConfigWithOptions('buildSystem', ['MAVEN', 'CUSTOM_BUILDER'])

    const { result } = renderHook(() => useFieldOptions('buildSystem'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.options).toEqual(['MAVEN', 'CUSTOM_BUILDER'])
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('returns empty list for fields without a known meta endpoint', async () => {
    mockAdminConfigEmpty()

    const { result } = renderHook(() => useFieldOptions('javaVersion'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.options).toEqual([])
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('returns empty list when CRS meta endpoint 404s (graceful)', async () => {
    mockAdminConfigEmpty()
    mockApi.get.mockRejectedValue(new Error('404 Not Found'))

    const { result } = renderHook(() => useFieldOptions('buildSystem'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.options).toEqual([])
  })
})
