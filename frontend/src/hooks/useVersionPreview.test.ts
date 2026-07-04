import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useVersionPreview, jiraOverridesToPreview, type VersionPreviewRequest } from './useVersionPreview'
import { api } from '../lib/api'
import type { DetailedComponentVersion, FieldOverride } from '../lib/types'

// Pin the wire path + body shape for the live preview. The endpoint path only
// lives in this hook; a typo would 404 in prod but pass the panel-level tests
// (which mock the hook).
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { ...actual.api, post: vi.fn() } }
})
const mockApi = vi.mocked(api)

const DETAILED: DetailedComponentVersion = {
  component: 'preview',
  minorVersion: { type: 'MINOR', version: '2.0', jiraVersion: '2.0' },
  lineVersion: { type: 'LINE', version: '2.0', jiraVersion: '2.0' },
  buildVersion: { type: 'BUILD', version: '2.0.89-4153', jiraVersion: '2.0.89-4153' },
  rcVersion: { type: 'RC', version: '2.0.89_RC', jiraVersion: '2.0.89_RC' },
  releaseVersion: { type: 'RELEASE', version: '2.0.89', jiraVersion: '2.0.89' },
  hotfixVersion: null,
}

function payload(version: string): VersionPreviewRequest {
  return {
    version,
    technical: false,
    hotfixEnabled: false,
    base: {
      minorVersionFormat: '$major.$minor',
      releaseVersionFormat: '$major.$minor.$service',
      buildVersionFormat: '$major.$minor.$service-$build',
      lineVersionFormat: '$major.$minor',
    },
    overrides: [],
  }
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useVersionPreview', () => {
  it('POSTs /versions/preview with the request body and returns the parsed DetailedComponentVersion', async () => {
    mockApi.post.mockResolvedValue(DETAILED)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useVersionPreview(payload('2.0.89-4153'), true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.post).toHaveBeenCalledWith('/versions/preview', payload('2.0.89-4153'))
    expect(result.current.data).toEqual(DETAILED)
  })

  it('does not fire when disabled', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useVersionPreview(payload('2.0.89-4153'), false), { wrapper })
    expect(mockApi.post).not.toHaveBeenCalled()
  })

  it('does not fire on a blank version', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useVersionPreview(payload('   '), true), { wrapper })
    expect(mockApi.post).not.toHaveBeenCalled()
  })

  it('trims the version so the gate, key and body all agree', async () => {
    mockApi.post.mockResolvedValue(DETAILED)
    const { wrapper } = makeWrapper()

    renderHook(() => useVersionPreview(payload('  2.0.89-4153  '), true), { wrapper })
    await waitFor(() => expect(mockApi.post).toHaveBeenCalled())

    const body = (mockApi.post.mock.calls[0]?.[1] ?? {}) as VersionPreviewRequest
    expect(body.version).toBe('2.0.89-4153')
  })
})

describe('jiraOverridesToPreview', () => {
  const override = (attr: string, range: string, value: unknown): FieldOverride => ({
    id: attr + range,
    overriddenAttribute: attr,
    versionRange: range,
    rowType: 'SCALAR_OVERRIDE',
    value,
    createdAt: null,
    updatedAt: null,
  })

  it('folds jira.* format overrides sharing a range into one per-range entry', () => {
    const result = jiraOverridesToPreview([
      override('jira.releaseVersionFormat', '(,1.0.107)', '$major.$minor.$service'),
      override('jira.minorVersionFormat', '(,1.0.107)', '$major'),
    ])
    expect(result).toEqual([
      { versionRange: '(,1.0.107)', releaseVersionFormat: '$major.$minor.$service', minorVersionFormat: '$major' },
    ])
  })

  it('ignores non-jira attributes and non-string values', () => {
    const result = jiraOverridesToPreview([
      override('build.javaVersion', '[1.0,2.0)', '17'),
      override('jira.minorVersionFormat', '[1.0,2.0)', 42),
      override('jira.releaseVersionFormat', '[1.0,2.0)', '$major.$minor'),
    ])
    expect(result).toEqual([{ versionRange: '[1.0,2.0)', releaseVersionFormat: '$major.$minor' }])
  })

  it('returns an empty list when there are no jira format overrides', () => {
    expect(jiraOverridesToPreview([])).toEqual([])
  })
})
