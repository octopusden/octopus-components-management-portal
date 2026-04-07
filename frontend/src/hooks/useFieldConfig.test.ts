import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useFieldConfigOptions } from './useFieldConfig'
import { useFieldConfig } from './useAdminConfig'

vi.mock('./useAdminConfig', () => ({
  useFieldConfig: vi.fn(),
  useUpdateFieldConfig: vi.fn(),
  useComponentDefaults: vi.fn(),
  useUpdateComponentDefaults: vi.fn(),
  useMigrateDefaults: vi.fn(),
}))
const mockUseFieldConfig = vi.mocked(useFieldConfig)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => vi.clearAllMocks())

describe('useFieldConfigOptions', () => {
  it('returns empty options while loading', () => {
    mockUseFieldConfig.mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigOptions('buildSystem'),
      { wrapper: makeWrapper() },
    )
    expect(result.current).toEqual({ options: [], isLoading: true })
  })

  it('returns empty options when field has no config', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { fields: {} },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigOptions('buildSystem'),
      { wrapper: makeWrapper() },
    )
    expect(result.current).toEqual({ options: [], isLoading: false })
  })

  it('returns options when field config has options', () => {
    mockUseFieldConfig.mockReturnValue({
      data: { fields: { buildSystem: { options: ['MAVEN', 'GRADLE'] } } },
      isLoading: false,
    } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigOptions('buildSystem'),
      { wrapper: makeWrapper() },
    )
    expect(result.current).toEqual({ options: ['MAVEN', 'GRADLE'], isLoading: false })
  })

  it('returns empty options when data is null', () => {
    mockUseFieldConfig.mockReturnValue({ data: null, isLoading: false } as unknown as ReturnType<typeof useFieldConfig>)
    const { result } = renderHook(
      () => useFieldConfigOptions('buildSystem'),
      { wrapper: makeWrapper() },
    )
    expect(result.current).toEqual({ options: [], isLoading: false })
  })
})
