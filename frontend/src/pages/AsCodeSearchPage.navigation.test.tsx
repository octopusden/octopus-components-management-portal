import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router'
import React from 'react'
import { AsCodeSearchPage } from './AsCodeSearchPage'
import { useAsCodeSearch } from '../hooks/useAsCodeSearch'

// The real debounce and router: the page stays mounted while the URL changes under it.
vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
}))
vi.mock('../hooks/useAsCodeSearch', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useAsCodeSearch')>('../hooks/useAsCodeSearch')
  return { ...actual, useAsCodeSearch: vi.fn() }
})

const routes = [{ path: '/search', element: <AsCodeSearchPage /> }, { path: '/other', element: <div /> }]
const factories = {
  memory: (entry: string) => createMemoryRouter(routes, { initialEntries: [entry] }),
  browser: (entry: string) => {
    window.history.replaceState(null, '', entry)
    return createBrowserRouter(routes)
  },
}
let router: ReturnType<typeof createMemoryRouter> | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(useAsCodeSearch).mockReturnValue({ data: undefined, error: null, isLoading: false } as ReturnType<typeof useAsCodeSearch>)
})
afterEach(() => {
  router?.dispose()
  router = undefined
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
})

const field = () => screen.getByRole('textbox', { name: 'Search text' }) as HTMLInputElement
// The arguments of the page's latest search.
const searched = () => vi.mocked(useAsCodeSearch).mock.lastCall?.[0]

describe.each(['memory', 'browser'] as const)('AsCodeSearchPage — %s router', (kind) => {
  const start = (entry: string) => {
    router = factories[kind](entry)
    render(<RouterProvider router={router} />)
    return router
  }
  const at = (r: NonNullable<typeof router>) => r.state.location.pathname + r.state.location.search
  // A history step resolves on popstate, which jsdom dispatches from a (faked) 1 ms timer.
  const go = async (r: NonNullable<typeof router>, delta: number) => {
    const done = r.navigate(delta)
    await vi.advanceTimersByTimeAsync(1)
    await done
  }
  const type = async (text: string) => {
    fireEvent.change(field(), { target: { value: text } })
    await act(async () => { vi.advanceTimersByTime(300) })
  }
  const enter = () => act(async () => { fireEvent.keyDown(field(), { key: 'Enter' }) })

  it('typing searches after the debounce and leaves the URL alone', async () => {
    const r = start('/search?q=alpha')
    fireEvent.change(field(), { target: { value: 'beta' } })
    await act(async () => { vi.advanceTimersByTime(299) })
    expect(searched()?.query).toBe('alpha')
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(searched()?.query).toBe('beta')
    expect(at(r)).toBe('/search?q=alpha')
  })

  it.each([
    ['Enter', () => fireEvent.keyDown(field(), { key: 'Enter' })],
    ['leaving the field', () => fireEvent.blur(field())],
  ])('%s writes the typed text, replacing the history entry', async (_how, commit) => {
    const r = start('/search?q=alpha')
    const entries = window.history.length
    await type('beta')
    await act(async () => { commit() })
    expect(at(r)).toBe('/search?q=beta')
    if (kind === 'browser') expect(window.history.length).toBe(entries)
    expect(field().value).toBe('beta')
  })

  it('a mode or scope change writes the typed text with it, and a blur right after keeps both', async () => {
    const r = start('/search?q=alpha&limit=1000')
    await type('beta')
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Regex' }))
      fireEvent.blur(field())
    })
    expect(at(r)).toBe('/search?q=beta&regex=true')
    await act(async () => { fireEvent.mouseDown(screen.getByRole('tab', { name: 'All' })) })
    expect(at(r)).toBe('/search?q=beta&regex=true&archived=all')
    expect(field().value).toBe('beta')
  })

  it('incoming navigation replaces the field and the results at once; the draft is never written', async () => {
    const r = start('/search?q=alpha')
    fireEvent.change(field(), { target: { value: 'draft' } })
    await act(async () => { await r.navigate('/search?q=beta&archived=all') })
    expect(field().value).toBe('beta')
    expect(searched()?.query).toBe('beta')
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(at(r)).toBe('/search?q=beta&archived=all')
    expect(searched()?.query).toBe('beta')
  })

  it('incoming navigation with the same q still drops a draft', async () => {
    const r = start('/search?q=alpha')
    await type('draft')
    await act(async () => { await r.navigate('/search?q=alpha&regex=true') })
    expect(field().value).toBe('alpha')
    expect(searched()?.query).toBe('alpha')
    expect(at(r)).toBe('/search?q=alpha&regex=true')
  })

  it('Back and Forward restore the query of each entry', async () => {
    const r = start('/search?q=alpha')
    await act(async () => { await r.navigate('/search?q=beta') })
    await type('gamma')
    await enter()
    await act(async () => { await go(r, -1) })
    expect(field().value).toBe('alpha')
    expect(searched()?.query).toBe('alpha')
    fireEvent.change(field(), { target: { value: 'draft' } })
    await act(async () => { await go(r, 1) })
    expect(field().value).toBe('gamma')
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(at(r)).toBe('/search?q=gamma')
    expect(searched()?.query).toBe('gamma')
  })

  it('typing the previous query again after navigation searches for it', async () => {
    const r = start('/search?q=alpha')
    await act(async () => { await r.navigate('/search?q=beta') })
    await type('alpha')
    expect(searched()?.query).toBe('alpha')
    await enter()
    expect(at(r)).toBe('/search?q=alpha')
  })

  it('a raised limit applies only to the query it was raised for, and Enter on it keeps it', async () => {
    const r = start('/search?q=alpha&limit=1000')
    expect(searched()?.limit).toBe(1000)
    await enter()
    expect(at(r)).toBe('/search?q=alpha&limit=1000')
    await type('beta')
    expect(searched()?.limit).toBeUndefined()
    await enter()
    expect(at(r)).toBe('/search?q=beta')
  })

  it('leaving the page does not write an uncommitted draft', async () => {
    const r = start('/search?q=alpha')
    fireEvent.change(field(), { target: { value: 'draft' } })
    await act(async () => { await r.navigate('/other') })
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(at(r)).toBe('/other')
    await act(async () => { await go(r, -1) })
    expect(at(r)).toBe('/search?q=alpha')
  })
})
