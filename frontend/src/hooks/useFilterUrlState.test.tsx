import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter, useSearchParams } from 'react-router'
import type { ReactNode } from 'react'
import {
  parseFilterParams,
  serializeFilterState,
  useFilterUrlState,
  type FilterUrlState,
} from './useFilterUrlState'
import type { ComponentFilter } from '../lib/types'

describe('parseFilterParams', () => {
  it('returns active-only defaults for an empty query', () => {
    const state = parseFilterParams(new URLSearchParams(''))
    expect(state).toEqual<FilterUrlState>({ filter: { archived: false }, preset: null })
  })

  it('parses a CSV array param into a string array', () => {
    const rmsc = parseFilterParams(
      new URLSearchParams('releaseManager=alice&securityChampion=bob,carol'),
    )
    expect(rmsc.filter.releaseManager).toEqual(['alice'])
    expect(rmsc.filter.securityChampion).toEqual(['bob', 'carol'])

    const state = parseFilterParams(new URLSearchParams('owner=alice,bob&labels=core,infra'))
    expect(state.filter.owner).toEqual(['alice', 'bob'])
    expect(state.filter.labels).toEqual(['core', 'infra'])
  })

  it('parses a single ?owner=alice deep-link into a one-element array', () => {
    const state = parseFilterParams(new URLSearchParams('owner=alice'))
    expect(state.filter.owner).toEqual(['alice'])
  })

  it('parses scalar string filters', () => {
    const state = parseFilterParams(new URLSearchParams('search=foo&vcsPath=p/r&productionBranch=main'))
    expect(state.filter.search).toBe('foo')
    expect(state.filter.vcsPath).toBe('p/r')
    expect(state.filter.productionBranch).toBe('main')
  })

  it('parses tri-state booleans (true/false present, absent => undefined)', () => {
    const state = parseFilterParams(new URLSearchParams('solution=true&jiraTechnical=false'))
    expect(state.filter.solution).toBe(true)
    expect(state.filter.jiraTechnical).toBe(false)
    expect(state.filter.canBeParent).toBeUndefined()
  })

  it('parses archived=true', () => {
    expect(parseFilterParams(new URLSearchParams('archived=true')).filter.archived).toBe(true)
  })

  it('parses the preset param', () => {
    expect(parseFilterParams(new URLSearchParams('preset=mine')).preset).toBe('mine')
  })
})

describe('serializeFilterState', () => {
  it('omits archived=false (the default) and empty arrays from the query', () => {
    const params = serializeFilterState({ filter: { archived: false }, preset: null })
    expect(params.toString()).toBe('')
  })

  it('joins array filters as CSV', () => {
    const params = serializeFilterState({
      filter: { archived: false, owner: ['alice', 'bob'], labels: ['core'] },
      preset: null,
    })
    expect(params.get('owner')).toBe('alice,bob')
    expect(params.get('labels')).toBe('core')
  })

  it('writes archived=true when archived is set', () => {
    const params = serializeFilterState({ filter: { archived: true }, preset: null })
    expect(params.get('archived')).toBe('true')
  })

  it('writes tri-state booleans only when defined', () => {
    const params = serializeFilterState({
      filter: { archived: false, solution: true, jiraTechnical: false },
      preset: null,
    })
    expect(params.get('solution')).toBe('true')
    expect(params.get('jiraTechnical')).toBe('false')
    expect(params.has('canBeParent')).toBe(false)
  })

  it('writes the preset when present', () => {
    const params = serializeFilterState({ filter: { archived: false }, preset: 'mine' })
    expect(params.get('preset')).toBe('mine')
  })
})

describe('round-trip', () => {
  const cases: FilterUrlState[] = [
    { filter: { archived: false }, preset: null },
    { filter: { archived: true }, preset: 'archived' },
    {
      filter: {
        archived: false,
        owner: ['alice', 'bob'],
        system: ['S1'],
        labels: ['core', 'infra'],
        clientCode: ['C1', 'C2'],
        jiraProjectKey: ['JP'],
        parentComponentName: ['parent-a'],
        groupKey: ['g1'],
        buildSystem: ['MAVEN'],
        releaseManager: ['alice'],
        securityChampion: ['bob', 'carol'],
        search: 'foo',
        vcsPath: 'proj/repo',
        productionBranch: 'main',
        canBeParent: true,
        solution: false,
        jiraTechnical: true,
        distributionExplicit: false,
        distributionExternal: true,
      },
      preset: 'custom',
    },
  ]

  it.each(cases)('serialize -> parse is identity (%#)', (state) => {
    const round = parseFilterParams(serializeFilterState(state))
    expect(round).toEqual(state)
  })
})

describe('useFilterUrlState hook', () => {
  function wrapper(initialEntries: string[]) {
    return ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    )
  }

  it('reads the initial state from the URL', () => {
    const { result } = renderHook(() => useFilterUrlState(), {
      wrapper: wrapper(['/components?owner=alice&preset=mine']),
    })
    expect(result.current.filter.owner).toEqual(['alice'])
    expect(result.current.preset).toBe('mine')
  })

  it('defaults to active-only when the URL has no params', () => {
    const { result } = renderHook(() => useFilterUrlState(), {
      wrapper: wrapper(['/components']),
    })
    expect(result.current.filter).toEqual<ComponentFilter>({ archived: false })
    expect(result.current.preset).toBeNull()
  })

  it('setState pushes the serialized query back into the URL and round-trips', () => {
    // Track the live searchParams alongside the hook so we can assert the URL
    // actually changed (not just the returned state).
    const { result } = renderHook(
      () => ({ state: useFilterUrlState(), params: useSearchParams()[0] }),
      { wrapper: wrapper(['/components']) },
    )

    act(() => {
      result.current.state.setState({ filter: { archived: true, owner: ['carol'] }, preset: 'x' })
    })

    expect(result.current.params.get('archived')).toBe('true')
    expect(result.current.params.get('owner')).toBe('carol')
    expect(result.current.params.get('preset')).toBe('x')
    // And the hook re-parses the new URL into the same logical state.
    expect(result.current.state.filter.owner).toEqual(['carol'])
    expect(result.current.state.filter.archived).toBe(true)
    expect(result.current.state.preset).toBe('x')
  })
})
