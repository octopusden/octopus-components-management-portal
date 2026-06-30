import { describe, it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import type { FieldOverride } from '../../lib/types'
import { OverridesDraftProvider, useOverridesDraft } from './overridesDraft'
import { isDraftId } from './overrideDraftUtil'

// Capture the live context value into an outer handle each render so tests can
// drive the mutators and read the derived state. Using render + rerender (not
// renderHook's fixed wrapper) lets us change the provider's componentId /
// serverOverrides props between renders.
type DraftApi = ReturnType<typeof useOverridesDraft>
let api: DraftApi
function Consumer() {
  api = useOverridesDraft()
  return null
}

function override(over: Partial<FieldOverride> = {}): FieldOverride {
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

function renderProvider(componentId: string, serverOverrides: FieldOverride[]) {
  return render(
    <OverridesDraftProvider componentId={componentId} serverOverrides={serverOverrides}>
      <Consumer />
    </OverridesDraftProvider>,
  )
}

describe('OverridesDraftProvider', () => {
  it('starts clean: effectiveOverrides mirrors the server list', () => {
    const server = [override()]
    renderProvider('c1', server)
    expect(api.isDirty).toBe(false)
    expect(api.effectiveOverrides).toHaveLength(1)
    expect(api.effectiveOverrides[0]).toMatchObject({ id: 'o1', value: '17' })
  })

  it('queueCreate appends a draft row (draft id, inferred rowType) and goes dirty', () => {
    renderProvider('c1', [])
    act(() => {
      api.queueCreate({ overriddenAttribute: 'build.javaVersion', versionRange: '[1.0,2.0)', value: '21' })
    })
    expect(api.isDirty).toBe(true)
    expect(api.effectiveOverrides).toHaveLength(1)
    const row = api.effectiveOverrides[0]
    expect(row ? isDraftId(row.id) : false).toBe(true)
    expect(row).toMatchObject({ overriddenAttribute: 'build.javaVersion', value: '21', rowType: 'SCALAR_OVERRIDE' })
  })

  it('queueCreate with markerChildren infers MARKER rowType', () => {
    renderProvider('c1', [])
    act(() => {
      api.queueCreate({
        overriddenAttribute: 'vcs.settings',
        versionRange: '[1.0,2.0)',
        markerChildren: { vcsEntries: [] },
      })
    })
    expect(api.effectiveOverrides[0]?.rowType).toBe('MARKER')
  })

  it('queueUpdate patches an existing server row in the effective view', () => {
    renderProvider('c1', [override({ id: 'o1', value: '17' })])
    act(() => api.queueUpdate('o1', { versionRange: '[1.0,2.0)', value: '21' }))
    expect(api.isDirty).toBe(true)
    expect(api.effectiveOverrides[0]).toMatchObject({ id: 'o1', value: '21' })
  })

  it('queueUpdate back to the server value clears dirty (revert-to-clean)', () => {
    renderProvider('c1', [override({ id: 'o1', versionRange: '[1.0,2.0)', value: '17' })])
    act(() => api.queueUpdate('o1', { versionRange: '[1.0,2.0)', value: '21' }))
    expect(api.isDirty).toBe(true)
    act(() => api.queueUpdate('o1', { versionRange: '[1.0,2.0)', value: '17' }))
    expect(api.isDirty).toBe(false)
    expect(api.effectiveOverrides[0]).toMatchObject({ value: '17' })
  })

  it('queueDelete on a server row removes it from the effective view and goes dirty', () => {
    renderProvider('c1', [override({ id: 'o1' }), override({ id: 'o2', versionRange: '[2.0,3.0)' })])
    act(() => api.queueDelete('o1'))
    expect(api.isDirty).toBe(true)
    expect(api.effectiveOverrides.map((o) => o.id)).toEqual(['o2'])
  })

  it('queueDelete on a pending create just drops it (back to clean)', () => {
    renderProvider('c1', [])
    let draftId = ''
    act(() => {
      draftId = api.queueCreate({ overriddenAttribute: 'build.javaVersion', versionRange: '[1.0,2.0)', value: '21' })
    })
    expect(api.effectiveOverrides).toHaveLength(1)
    act(() => api.queueDelete(draftId))
    expect(api.effectiveOverrides).toHaveLength(0)
    expect(api.isDirty).toBe(false)
  })

  it('queueUpdate addressed by a draft id mutates that pending create (not a new op)', () => {
    renderProvider('c1', [])
    let draftId = ''
    act(() => {
      draftId = api.queueCreate({ overriddenAttribute: 'build.javaVersion', versionRange: '[1.0,2.0)', value: '21' })
    })
    act(() => api.queueUpdate(draftId, { versionRange: '[1.0,3.0)', value: '23' }))
    expect(api.effectiveOverrides).toHaveLength(1)
    expect(api.effectiveOverrides[0]).toMatchObject({ id: draftId, value: '23', versionRange: '[1.0,3.0)' })
  })

  it('ignores queueUpdate on a row already queued for delete (effective view stays deleted)', () => {
    renderProvider('c1', [override({ id: 'o1', value: '17' })])
    act(() => api.queueDelete('o1'))
    act(() => api.queueUpdate('o1', { versionRange: '[1.0,2.0)', value: '21' }))
    // The row remains gone (delete wins) and is never resurrected as an update.
    expect(api.effectiveOverrides.map((o) => o.id)).toEqual([])
    expect(api.isDirty).toBe(true)
  })

  it('reset() clears all pending ops', () => {
    renderProvider('c1', [override({ id: 'o1' })])
    act(() => api.queueDelete('o1'))
    act(() => api.queueCreate({ overriddenAttribute: 'jira.projectKey', versionRange: '[1.0,2.0)', value: 'ABC' }))
    expect(api.isDirty).toBe(true)
    act(() => api.reset())
    expect(api.isDirty).toBe(false)
    expect(api.effectiveOverrides.map((o) => o.id)).toEqual(['o1'])
  })

  it('clears pending ops when the componentId changes (no leak across components)', () => {
    const { rerender } = renderProvider('c1', [override({ id: 'o1' })])
    act(() => api.queueDelete('o1'))
    expect(api.isDirty).toBe(true)
    rerender(
      <OverridesDraftProvider componentId="c2" serverOverrides={[override({ id: 'x1' })]}>
        <Consumer />
      </OverridesDraftProvider>,
    )
    expect(api.isDirty).toBe(false)
    expect(api.effectiveOverrides.map((o) => o.id)).toEqual(['x1'])
  })
})
