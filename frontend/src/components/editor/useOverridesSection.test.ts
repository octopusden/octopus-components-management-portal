import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import type { FieldOverride } from '../../lib/types'
import { OverridesDraftProvider, useOverridesDraft } from './overridesDraft'
import { useOverridesSection } from './useOverridesSection'

// Field-config data source (diff labels) — no network.
vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: () => ({ data: undefined, isLoading: false, isError: false }),
}))

function ov(over: Partial<FieldOverride> = {}): FieldOverride {
  return {
    id: 'o1',
    overriddenAttribute: 'build.javaVersion',
    versionRange: '[1.0,2.0)',
    rowType: 'SCALAR_OVERRIDE',
    value: '17',
    markerChildren: null,
    createdAt: null,
    updatedAt: null,
    ...over,
  }
}

// Render the draft + section hooks together under one provider so a test can
// drive the draft and read the resulting slice.
function useBoth() {
  return { draft: useOverridesDraft(), section: useOverridesSection() }
}

function setup(serverOverrides: FieldOverride[]) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(OverridesDraftProvider, { componentId: 'c1', serverOverrides, children })
  return renderHook(() => useBoth(), { wrapper })
}

type Upsert = { id?: string; overriddenAttribute: string; versionRange: string; value?: unknown }
function fieldOverrides(req: unknown): Upsert[] | undefined {
  return (req as { fieldOverrides?: Upsert[] }).fieldOverrides
}

describe('useOverridesSection', () => {
  it('is clean with no pending ops: empty request, empty diff', () => {
    const { result } = setup([ov()])
    expect(result.current.section.slice.isDirty).toBe(false)
    expect(fieldOverrides(result.current.section.slice.request)).toBeUndefined()
    expect(result.current.section.slice.diff).toHaveLength(0)
  })

  it('queued create makes the slice dirty and the request the desired full set', () => {
    const { result } = setup([ov({ id: 'o1' })])
    act(() => {
      result.current.draft.queueCreate({
        overriddenAttribute: 'jira.projectKey',
        versionRange: '[2.0,3.0)',
        value: 'ABC',
      })
    })
    expect(result.current.section.slice.isDirty).toBe(true)
    const set = fieldOverrides(result.current.section.slice.request)
    expect(set).toHaveLength(2) // existing server row + the new one
  })

  it('strips the temp id of a queued create while keeping real ids', () => {
    const { result } = setup([ov({ id: 'o1' })])
    act(() => {
      result.current.draft.queueCreate({
        overriddenAttribute: 'jira.projectKey',
        versionRange: '[2.0,3.0)',
        value: 'ABC',
      })
    })
    const set = fieldOverrides(result.current.section.slice.request) ?? []
    const created = set.find((u) => u.overriddenAttribute === 'jira.projectKey')
    const existing = set.find((u) => u.overriddenAttribute === 'build.javaVersion')
    expect(created && 'id' in created).toBe(false)
    expect(existing?.id).toBe('o1')
  })

  it('queued update is reflected in the request and produces a diff row', () => {
    const { result } = setup([ov({ id: 'o1', value: '17' })])
    act(() => result.current.draft.queueUpdate('o1', { versionRange: '[1.0,2.0)', value: '21' }))
    const set = fieldOverrides(result.current.section.slice.request) ?? []
    expect(set.find((u) => u.id === 'o1')?.value).toBe('21')
    expect(result.current.section.slice.diff).toHaveLength(1)
  })

  it('queued delete drops the row from the desired set and yields a delete diff row', () => {
    const { result } = setup([ov({ id: 'o1' }), ov({ id: 'o2', versionRange: '[2.0,3.0)' })])
    act(() => result.current.draft.queueDelete('o1'))
    const set = fieldOverrides(result.current.section.slice.request) ?? []
    expect(set.map((u) => u.id)).toEqual(['o2'])
    const row = result.current.section.slice.diff[0]
    expect(row?.newValue).toBe('(removed)')
  })

  it('reset() clears the draft so the section reads clean', () => {
    const { result } = setup([ov({ id: 'o1' })])
    act(() => result.current.draft.queueDelete('o1'))
    expect(result.current.section.slice.isDirty).toBe(true)
    act(() => result.current.section.reset())
    expect(result.current.section.slice.isDirty).toBe(false)
  })
})
