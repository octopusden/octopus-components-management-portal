import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { GlobalSearchBox } from './GlobalSearchBox'
import { globalSearchHref } from '../lib/asCodeSearch'
import type { AsCodeSearchResponse } from '../lib/types'

// The real 250 ms debounce and the real query hook (keepPreviousData): the panel keeps the
// previous query's results until the new response arrives. Each request waits for `answer`.
const pending = vi.hoisted(() => new Map<string, (r: unknown) => void>())
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    api: { ...actual.api, get: (path: string) => new Promise((resolve) => pending.set(new URL(path, 'http://x').searchParams.get('q')!, resolve)) },
  }
})

function hit(id: string, line: number): AsCodeSearchResponse['results'][number] {
  return { id, componentKey: id, archived: false, matchCount: 1, matches: [{ line, text: id, path: [id], ranges: [{ start: 0, end: 1 }] }] }
}
const answer = async (q: string, ...results: AsCodeSearchResponse['results']) => {
  await act(async () => {
    pending.get(q)!({ query: q, regex: false, totalComponents: results.length, truncated: false, results })
  })
  // React Query notifies on a zero-delay timer.
  await act(async () => { vi.advanceTimersByTime(0) })
}

function Where() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname + loc.search}</div>
}

const field = () => screen.getByRole('combobox', { name: 'Global search' })
const loc = () => screen.getByTestId('loc').textContent
const type = async (text: string) => {
  fireEvent.change(field(), { target: { value: text } })
  await act(async () => { vi.advanceTimersByTime(250) })
}

beforeEach(async () => {
  vi.useFakeTimers()
  pending.clear()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/components']}>
        <GlobalSearchBox />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  fireEvent.focus(field())
  await type('alpha')
  await answer('alpha', hit('id-alpha', 12))
})
afterEach(() => vi.useRealTimers())

describe('GlobalSearchBox — selection across queries', () => {
  it('Enter after editing the query searches the new text, not the result picked before', () => {
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(field().getAttribute('aria-activedescendant')).not.toBeNull()
    fireEvent.change(field(), { target: { value: 'different' } })
    expect(field().getAttribute('aria-activedescendant')).toBeNull()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(loc()).toBe(globalSearchHref('different'))
  })

  it('before the debounce catches up, the previous results cannot be picked', () => {
    fireEvent.change(field(), { target: { value: 'beta' } })
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(loc()).toBe(globalSearchHref('beta'))
  })

  it('while the new response is pending, the retained results cannot be picked either', async () => {
    await type('beta')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(field().getAttribute('aria-activedescendant')).toBeNull()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(loc()).toBe(globalSearchHref('beta'))
  })

  it('a selection never carries over into a newly arrived result set', async () => {
    await type('beta')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    await answer('beta', hit('id-beta', 4))
    expect(field().getAttribute('aria-activedescendant')).toBeNull()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(loc()).toBe(globalSearchHref('beta'))
  })

  it('once the new results are in, they are selectable', async () => {
    await type('beta')
    await answer('beta', hit('id-beta', 4))
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(loc()).toBe('/components/id-beta?tab=as-code&line=4')
  })
})
