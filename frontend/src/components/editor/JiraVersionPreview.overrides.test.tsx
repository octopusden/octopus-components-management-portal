import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { JiraVersionPreview, type JiraVersionPreviewProps } from './JiraVersionPreview'
import { api } from '../../lib/api'
import type { DetailedComponentVersion } from '../../lib/types'
import type { VersionPreviewRequest } from '../../hooks/useVersionPreview'

// Exercises the REAL useVersionPreview + component wiring, mocking ONLY the
// network boundary (api.post) — NOT the hook. This is the level that catches
// "the preview does not apply per-range overrides": a hook-level mock (as the
// render tests use) would hide it, which is exactly how the gap shipped before.
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, api: { ...actual.api, post: vi.fn() } }
})
const mockApi = vi.mocked(api)

const DETAILED: DetailedComponentVersion = {
  component: 'preview',
  minorVersion: { type: 'MINOR', version: '1.0', jiraVersion: '1.0' },
  lineVersion: { type: 'LINE', version: '1.0', jiraVersion: '1.0' },
  buildVersion: { type: 'BUILD', version: '1.0.3', jiraVersion: '1.0.3' },
  rcVersion: { type: 'RC', version: '1.0.3', jiraVersion: '1.0.3_RC' },
  releaseVersion: { type: 'RELEASE', version: '1.0.3', jiraVersion: '1.0.3' },
  hotfixVersion: null,
}

function props(overrides: JiraVersionPreviewProps['overrides']): JiraVersionPreviewProps {
  return {
    versionPrefix: '',
    versionFormat: '',
    lineVersionFormat: '$major.$minor',
    minorVersionFormat: '',
    minorSeparate: false,
    releaseVersionFormat: '$major.$minor.$service-$fix',
    buildVersionFormat: '',
    buildSeparate: false,
    hotfixVersionFormat: '',
    technical: false,
    hotfixEnabled: false,
    hoveredField: null,
    onHoverField: () => {},
    overrides,
  }
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.post.mockResolvedValue(DETAILED)
})

describe('JiraVersionPreview — per-range overrides reach the endpoint (real hook, mocked network)', () => {
  it('POSTs /versions/preview with the jira per-range overrides in the body', async () => {
    render(
      <JiraVersionPreview {...props([{ versionRange: '(,1.0.107)', releaseVersionFormat: '$major.$minor.$service' }])} />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(mockApi.post).toHaveBeenCalled(), { timeout: 3000 })

    const call = mockApi.post.mock.calls.find((c) => c[0] === '/versions/preview')
    expect(call, 'the preview endpoint was not called — overrides never reach CRS').toBeTruthy()
    const body = (call?.[1] ?? {}) as VersionPreviewRequest
    expect(body.overrides).toContainEqual(
      expect.objectContaining({ versionRange: '(,1.0.107)', releaseVersionFormat: '$major.$minor.$service' }),
    )
  })
})
