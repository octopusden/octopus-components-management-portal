import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { GlobalSearchBox } from './GlobalSearchBox'
import { globalSearchHref } from '../lib/asCodeSearch'
import type { AsCodeSearchResponse } from '../lib/types'

// The real 250 ms debounce: the panel keeps the previous query's results until it catches up.
const response: AsCodeSearchResponse = {
  query: 'org.example',
  regex: false,
  totalComponents: 1,
  truncated: false,
  results: [
    {
      id: 'id-a',
      componentKey: 'alpha',
      archived: false,
      matchCount: 1,
      matches: [{ line: 12, text: 'groupId = "org.example"', path: ['alpha'], ranges: [{ start: 11, end: 22 }] }],
    },
  ],
}
vi.mock('../hooks/useAsCodeSearch', () => ({
  AS_CODE_SEARCH_MIN_QUERY: 2,
  useAsCodeSearch: () => ({ data: response, isPending: false, isFetching: false, isError: false, error: null }),
}))

function Where() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname + loc.search}</div>
}

const field = () => screen.getByRole('combobox', { name: 'Global search' })
const loc = () => screen.getByTestId('loc').textContent

beforeEach(() => {
  vi.useFakeTimers()
  render(
    <MemoryRouter initialEntries={['/components']}>
      <GlobalSearchBox />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.focus(field())
  fireEvent.change(field(), { target: { value: 'org.example' } })
  act(() => { vi.advanceTimersByTime(250) })
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

  it('the previous results cannot be picked with the keyboard before the debounce catches up', () => {
    fireEvent.change(field(), { target: { value: 'different' } })
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(loc()).toBe(globalSearchHref('different'))
  })

  it('once the debounce catches up, the results are selectable again', () => {
    fireEvent.change(field(), { target: { value: 'different' } })
    act(() => { vi.advanceTimersByTime(250) })
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(loc()).toBe('/components/id-a?tab=as-code&line=12')
  })
})
