import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { GlobalSearchBox } from './GlobalSearchBox'
import { globalSearchHref, QUICK_RESULTS_LIMIT } from '../lib/asCodeSearch'
import type { AsCodeSearchResponse } from '../lib/types'

const searchState = vi.hoisted(() => ({
  calls: [] as unknown[],
  data: undefined as AsCodeSearchResponse | undefined,
}))
vi.mock('../hooks/useAsCodeSearch', () => ({
  AS_CODE_SEARCH_MIN_QUERY: 2,
  useAsCodeSearch: (params: unknown) => {
    searchState.calls.push(params)
    return { data: searchState.data, isPending: false, isFetching: false, isError: false, error: null }
  },
}))
// No debounce delay in tests.
vi.mock('../hooks/useDebouncedValue', () => ({ useDebouncedValue: <T,>(v: T) => v }))

const response: AsCodeSearchResponse = {
  query: 'org.example',
  regex: false,
  totalComponents: 9,
  truncated: true,
  results: [
    {
      id: 'id-a',
      componentKey: 'alpha',
      archived: false,
      matchCount: 3,
      matches: [{ line: 12, text: 'groupId = "org.example"', path: ['alpha'], ranges: [{ start: 11, end: 22 }] }],
    },
    {
      id: 'id-b',
      componentKey: 'beta',
      archived: false,
      matchCount: 1,
      matches: [{ line: 4, text: 'org.example.beta', path: ['beta'], ranges: [{ start: 0, end: 11 }] }],
    },
  ],
}

function Where() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname + loc.search}</div>
}

function renderBox() {
  return render(
    <MemoryRouter initialEntries={['/components']}>
      <GlobalSearchBox />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

const field = () => screen.getByRole('combobox', { name: 'Global search' })
const loc = () => screen.getByTestId('loc').textContent

beforeEach(() => {
  searchState.calls = []
  searchState.data = response
})

describe('GlobalSearchBox', () => {
  it('asks for a short, active-only, one-line-per-component result set', async () => {
    renderBox()
    await userEvent.type(field(), 'org.example')
    expect(searchState.calls.at(-1)).toEqual({
      query: 'org.example',
      regex: false,
      archived: false,
      limit: QUICK_RESULTS_LIMIT,
      maxMatchesPerComponent: 1,
    })
  })

  it('shows no panel below the minimum query length', async () => {
    renderBox()
    await userEvent.type(field(), 'o')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('lists matching components with their first line and a "See all" entry', async () => {
    renderBox()
    await userEvent.type(field(), 'org.example')
    expect(screen.getByRole('listbox')).toBeDefined()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('alpha'),
      expect.stringContaining('beta'),
      expect.stringContaining('See all 9 results'),
    ])
    expect(screen.getAllByRole('option')[0]!.querySelector('mark')?.textContent).toBe('org.example')
  })

  it('a result opens that line in the As Code tab and clears the field', async () => {
    renderBox()
    await userEvent.type(field(), 'org.example')
    await userEvent.click(screen.getByRole('option', { name: /alpha/ }))
    expect(loc()).toBe('/components/id-a?tab=as-code&line=12')
    expect((field() as HTMLInputElement).value).toBe('')
  })

  it('Enter opens the full Global search page with the query', async () => {
    renderBox()
    await userEvent.type(field(), 'org.example{Enter}')
    expect(loc()).toBe('/search?q=org.example')
  })

  it('arrow keys pick a result for Enter', async () => {
    renderBox()
    await userEvent.type(field(), 'org.example')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('option', { name: /beta/ }).getAttribute('aria-selected')).toBe('true')
    await userEvent.keyboard('{Enter}')
    expect(loc()).toBe('/components/id-b?tab=as-code&line=4')
  })

  it('Escape closes the panel', async () => {
    renderBox()
    await userEvent.type(field(), 'org.example')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('says so when nothing matches', async () => {
    searchState.data = { ...response, totalComponents: 0, truncated: false, results: [] }
    renderBox()
    await userEvent.type(field(), 'nothing')
    expect(screen.getByText(/No active component mentions/)).toBeDefined()
    expect(screen.getByRole('option', { name: /Open in Global search/ })).toBeDefined()
  })

  it('"/" focuses the field, but not while typing elsewhere', async () => {
    render(
      <MemoryRouter>
        <input aria-label="other" />
        <GlobalSearchBox />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByLabelText('other'))
    await userEvent.keyboard('/')
    expect(document.activeElement).toBe(screen.getByLabelText('other'))
    act(() => (document.activeElement as HTMLElement).blur())
    await userEvent.keyboard('/')
    expect(document.activeElement).toBe(field())
  })
})

describe('globalSearchHref', () => {
  it('carries the trimmed query, or opens the bare page', () => {
    expect(globalSearchHref('  a b ')).toBe('/search?q=a%20b')
    expect(globalSearchHref('  ')).toBe('/search')
  })
})
