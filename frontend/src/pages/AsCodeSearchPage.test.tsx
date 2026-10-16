import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import React from 'react'
import { AsCodeSearchPage } from './AsCodeSearchPage'
import { useAsCodeSearch } from '../hooks/useAsCodeSearch'
import { ApiError } from '../lib/api'
import type { AsCodeSearchResponse } from '../lib/types'

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'layout' }, children),
}))
vi.mock('../hooks/useAsCodeSearch', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useAsCodeSearch')>('../hooks/useAsCodeSearch')
  return { ...actual, useAsCodeSearch: vi.fn() }
})
// Identity debounce so typing reaches the URL synchronously.
vi.mock('../hooks/useDebouncedValue', () => ({ useDebouncedValue: (v: string) => v }))

const mockSearch = vi.mocked(useAsCodeSearch)

const response: AsCodeSearchResponse = {
  query: 'org.example',
  regex: false,
  totalComponents: 2,
  truncated: false,
  results: [
    {
      id: 'uuid-alpha',
      componentKey: 'alpha',
      archived: false,
      matchCount: 3,
      matches: [
        { line: 12, text: 'groupId = "org.example.alpha"', path: ['alpha'], ranges: [{ start: 11, end: 22 }] },
        { line: 31, text: 'groupId = "org.example.api"', path: ['alpha', '"[2.0,)"', 'distribution'], ranges: [{ start: 11, end: 22 }] },
      ],
    },
    {
      id: 'uuid-old',
      componentKey: 'old-component',
      archived: true,
      matchCount: 1,
      matches: [{ line: 8, text: 'groupId = "org.example.old"', path: ['"old-component"'], ranges: [{ start: 11, end: 22 }] }],
    },
  ],
}

function hookResult(overrides: Partial<ReturnType<typeof useAsCodeSearch>> = {}) {
  return { data: undefined, error: null, isLoading: false, ...overrides } as ReturnType<typeof useAsCodeSearch>
}

function LocationProbe() {
  const location = useLocation()
  return React.createElement('div', { 'data-testid': 'location' }, location.pathname + location.search)
}

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/search" element={<><AsCodeSearchPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

const location = () => screen.getByTestId('location').textContent ?? ''
const lastParams = () => mockSearch.mock.calls.at(-1)?.[0]

beforeEach(() => {
  vi.clearAllMocks()
  mockSearch.mockReturnValue(hookResult())
})

describe('AsCodeSearchPage', () => {
  it('asks for at least 2 characters before searching', () => {
    renderPage('/search')
    expect(screen.getByText(/type at least 2 characters/i)).toBeTruthy()
  })

  it('restores the search from the URL (shareable link)', () => {
    mockSearch.mockReturnValue(hookResult({ data: response }))
    renderPage('/search?q=org.example&regex=true&archived=all')
    expect((screen.getByLabelText('Search text') as HTMLInputElement).value).toBe('org.example')
    expect(lastParams()).toMatchObject({ query: 'org.example', regex: true, archived: undefined })
    expect(screen.getByRole('tab', { name: 'Regex' }).getAttribute('data-state')).toBe('active')
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('data-state')).toBe('active')
  })

  it('writes the typed query into the URL', async () => {
    renderPage('/search')
    await userEvent.type(screen.getByLabelText('Search text'), 'foo')
    expect(location()).toBe('/search?q=foo')
    // No archived param = the Active default: only active components are searched.
    expect(lastParams()).toMatchObject({ query: 'foo', regex: false, archived: false })
    expect(screen.getByRole('tab', { name: 'Active' }).getAttribute('data-state')).toBe('active')
  })

  it('groups matches by component, links each line to the As Code tab, and shows the block path', () => {
    mockSearch.mockReturnValue(hookResult({ data: response }))
    renderPage('/search?q=org.example')

    expect(screen.getByText(/2 components match/)).toBeTruthy()
    const alpha = screen.getByRole('region', { name: 'alpha' })
    expect(within(alpha).getByRole('link', { name: 'alpha' }).getAttribute('href')).toBe(
      '/components/uuid-alpha?tab=as-code&line=12',
    )
    expect(within(alpha).getByRole('link', { name: 'alpha line 31' }).getAttribute('href')).toBe(
      '/components/uuid-alpha?tab=as-code&line=31',
    )
    // Path minus the component block itself.
    expect(within(alpha).getByText(/distribution/)).toBeTruthy()
    // matchCount (3) > shown lines (2).
    expect(within(alpha).getByRole('link', { name: '+1 more in alpha' })).toBeTruthy()

    const old = screen.getByRole('region', { name: 'old-component' })
    expect(within(old).getByText('Archived')).toBeTruthy()
  })

  it('marks the server-reported match spans in Text and Regex mode alike', () => {
    mockSearch.mockReturnValue(hookResult({ data: response }))
    const { container, unmount } = renderPage('/search?q=org.example')
    expect(Array.from(container.querySelectorAll('mark')).map((m) => m.textContent)).toContain('org.example')
    unmount()

    mockSearch.mockReturnValue(hookResult({ data: { ...response, regex: true } }))
    const regexView = renderPage('/search?q=org%5C.example&regex=true')
    expect(Array.from(regexView.container.querySelectorAll('mark')).map((m) => m.textContent)).toContain('org.example')
  })

  it('switching to Regex and to Archived updates the URL', async () => {
    renderPage('/search?q=foo')
    await userEvent.click(screen.getByRole('tab', { name: 'Regex' }))
    expect(location()).toContain('regex=true')
    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }))
    expect(location()).toContain('archived=true')
    await userEvent.click(screen.getByRole('tab', { name: 'All' }))
    expect(location()).toContain('archived=all')
    await userEvent.click(screen.getByRole('tab', { name: 'Active' }))
    expect(location()).not.toContain('archived')
  })

  it("shows the server's 400 message inline", () => {
    mockSearch.mockReturnValue(
      hookResult({ error: new ApiError(400, 'Regular expression is too expensive to evaluate; simplify the pattern') }),
    )
    renderPage('/search?q=(a%2B)%2Bb&regex=true')
    expect(screen.getByRole('alert').textContent).toContain('too expensive')
  })

  it('says so when nothing matches', () => {
    mockSearch.mockReturnValue(hookResult({ data: { ...response, totalComponents: 0, results: [] } }))
    renderPage('/search?q=zzz')
    expect(screen.getByTestId('empty-state')).toBeTruthy()
  })

  it('offers to raise the limit when the result is truncated', async () => {
    mockSearch.mockReturnValue(hookResult({ data: { ...response, totalComponents: 134, truncated: true } }))
    renderPage('/search?q=org')
    expect(screen.getByText(/showing the first 2/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Show up to 1000' }))
    expect(location()).toContain('limit=1000')
    expect(lastParams()).toMatchObject({ limit: 1000 })
  })
})
