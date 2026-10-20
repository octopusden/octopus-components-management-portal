import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router'
import React from 'react'
import { flushSync } from 'react-dom'
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

function renderAt(entry: string) {
  const router = createMemoryRouter([{ path: '/search', element: <AsCodeSearchPage /> }], { initialEntries: [entry] })
  render(<RouterProvider router={router} />)
  return router
}

const field = () => screen.getByRole('textbox', { name: 'Search text' }) as HTMLInputElement
const url = (router: ReturnType<typeof renderAt>) => router.state.location.pathname + router.state.location.search

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(useAsCodeSearch).mockReturnValue({ data: undefined, error: null, isLoading: false } as ReturnType<typeof useAsCodeSearch>)
})
afterEach(() => vi.useRealTimers())

describe('AsCodeSearchPage — navigation while mounted', () => {
  it('adopts a new ?q= (palette, header search) instead of writing the old query back', async () => {
    const router = renderAt('/search?q=alpha')
    await act(async () => { await router.navigate('/search?q=beta') })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(url(router)).toBe('/search?q=beta')
    expect(field().value).toBe('beta')
  })

  it('Back before the debounce restores the previous query (the superseded one is never written)', async () => {
    const router = renderAt('/search?q=alpha')
    await act(async () => { await router.navigate('/search?q=beta') })
    await act(async () => { vi.advanceTimersByTime(100) })
    await act(async () => { await router.navigate(-1) })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(url(router)).toBe('/search?q=alpha')
    expect(field().value).toBe('alpha')
  })

  it('returning to a query this page wrote earlier still follows the URL', async () => {
    const router = renderAt('/search?q=alpha')
    fireEvent.change(field(), { target: { value: 'gamma' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(url(router)).toBe('/search?q=gamma')
    await act(async () => { await router.navigate('/search?q=beta') })
    await act(async () => { await router.navigate('/search?q=gamma') })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(url(router)).toBe('/search?q=gamma')
    expect(field().value).toBe('gamma')
  })

  it('incoming navigation with the same q still replaces text typed before the debounce', async () => {
    const router = renderAt('/search?q=alpha')
    fireEvent.change(field(), { target: { value: 'beta' } })
    await act(async () => { await router.navigate('/search?q=alpha&regex=true&archived=all&limit=1000') })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(url(router)).toBe('/search?q=alpha&regex=true&archived=all&limit=1000')
    expect(field().value).toBe('alpha')
  })

  it("the page's own writes (Regex) keep text typed before the debounce", async () => {
    const router = renderAt('/search?q=alpha')
    fireEvent.change(field(), { target: { value: 'beta' } })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Regex' }))
    expect(url(router)).toBe('/search?q=alpha&regex=true')
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(url(router)).toBe('/search?q=beta&regex=true')
    expect(field().value).toBe('beta')
  })

  it.each([
    ['Back', -1, '/search?q=beta'],
    ['Forward', 1, '/search?q=alpha'],
  ])('%s to an entry this page wrote restores its query', async (_how, delta, other) => {
    const router = renderAt('/search?q=alpha')
    if (delta === 1) {
      await act(async () => { await router.navigate('/search?q=beta') })
      await act(async () => { vi.advanceTimersByTime(500) })
    }
    fireEvent.change(field(), { target: { value: 'gamma' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(url(router)).toBe('/search?q=gamma')
    // Leave the tagged entry, then return to it through history.
    if (delta === -1) await act(async () => { await router.navigate(other) })
    else await act(async () => { await router.navigate(-1) })
    await act(async () => { vi.advanceTimersByTime(100) })
    expect(url(router)).toBe(other)
    await act(async () => { await router.navigate(delta) })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(url(router)).toBe('/search?q=gamma')
    expect(field().value).toBe('gamma')
  })

  it('keeps the other params of the incoming URL', async () => {
    const router = renderAt('/search?q=alpha')
    await act(async () => { await router.navigate('/search?q=beta&limit=1000') })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(url(router)).toBe('/search?q=beta&limit=1000')
  })

  it('still writes typed text after the debounce', async () => {
    const router = renderAt('/search?q=alpha')
    fireEvent.change(field(), { target: { value: 'gamma' } })
    expect(url(router)).toBe('/search?q=alpha')
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(url(router)).toBe('/search?q=gamma')
    expect(field().value).toBe('gamma')
  })
})

// The data router moves its location at once and renders it in a transition: a debounce expiring
// in that window must neither overwrite the incoming location nor drop the page's own params.
describe('AsCodeSearchPage — writes racing a location the page has not rendered yet', () => {
  const INCOMING = '/search?q=incoming&archived=all&limit=1000'
  const routes = [{ path: '/search', element: <AsCodeSearchPage /> }]
  const factories = {
    memory: (entry: string) => createMemoryRouter(routes, { initialEntries: [entry] }),
    browser: (entry: string) => {
      window.history.replaceState(null, '', entry)
      return createBrowserRouter(routes)
    },
  }
  let router: ReturnType<typeof createMemoryRouter> | undefined
  afterEach(() => {
    router?.dispose()
    router = undefined
    window.history.replaceState(null, '', '/')
  })
  const start = (kind: keyof typeof factories, entry: string) => {
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

  describe.each(['memory', 'browser'] as const)('%s router', (kind) => {
    it('debounce expiry, then incoming navigation, before either renders: the navigation wins', async () => {
      const r = start(kind, '/search?q=alpha')
      fireEvent.change(field(), { target: { value: 'draft' } })
      await act(async () => {
        vi.advanceTimersByTime(300)
        await r.navigate(INCOMING)
      })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(at(r)).toBe(INCOMING)
      expect(field().value).toBe('incoming')
    })

    it('incoming navigation, then debounce expiry, before either renders: the navigation wins', async () => {
      const r = start(kind, '/search?q=alpha')
      fireEvent.change(field(), { target: { value: 'draft' } })
      await act(async () => {
        vi.advanceTimersByTime(299)
        await r.navigate(INCOMING)
        vi.advanceTimersByTime(1)
      })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(at(r)).toBe(INCOMING)
      expect(field().value).toBe('incoming')
    })

    it.each([
      ['Back', 'expiry first', -1, false],
      ['Back', 'navigation first', -1, true],
      ['Forward', 'expiry first', 1, false],
      ['Forward', 'navigation first', 1, true],
    ] as const)('%s to the entry the page wrote last, %s, before it renders: that entry wins', async (_how, _order, delta, navFirst) => {
      const r = start(kind, '/search?q=alpha')
      if (delta === 1) {
        await act(async () => { await r.navigate('/search?q=beta') })
        await act(async () => { vi.advanceTimersByTime(500) })
      }
      fireEvent.change(field(), { target: { value: 'gamma' } })
      await act(async () => { vi.advanceTimersByTime(300) })
      expect(at(r)).toBe('/search?q=gamma')
      if (delta === -1) await act(async () => { await r.navigate('/search?q=beta') })
      else await act(async () => { await go(r, -1) })
      await act(async () => { vi.advanceTimersByTime(500) })
      fireEvent.change(field(), { target: { value: 'delta' } })
      await act(async () => {
        vi.advanceTimersByTime(navFirst ? 298 : 300)
        await go(r, delta)
        if (navFirst) vi.advanceTimersByTime(1)
      })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(at(r)).toBe('/search?q=gamma')
      expect(field().value).toBe('gamma')
    })

    it.each([
      ['expiry first', false],
      ['navigation first', true],
    ] as const)('a write superseded by Back before it renders does not claim its entry later (Forward, %s)', async (_order, navFirst) => {
      const r = start(kind, '/search?q=alpha')
      fireEvent.change(field(), { target: { value: 'gamma' } })
      await act(async () => { vi.advanceTimersByTime(300) })
      await act(async () => { await r.navigate('/search?q=beta') })
      await act(async () => { vi.advanceTimersByTime(500) })
      fireEvent.change(field(), { target: { value: 'delta' } })
      await act(async () => {
        // The debounced delta reaches the router (it replaces the beta entry) while beta is still rendered…
        flushSync(() => { vi.advanceTimersByTime(300) })
        expect(at(r)).toBe('/search?q=delta')
        // …and Back supersedes it before it renders.
        await go(r, -1)
        expect(at(r)).toBe('/search?q=gamma')
      })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(at(r)).toBe('/search?q=gamma')
      expect(field().value).toBe('gamma')
      // Forward to the delta entry, with a new draft pending: the entry wins.
      fireEvent.change(field(), { target: { value: 'epsilon' } })
      await act(async () => {
        vi.advanceTimersByTime(navFirst ? 298 : 300)
        await go(r, 1)
        if (navFirst) vi.advanceTimersByTime(1)
      })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(at(r)).toBe('/search?q=delta')
      expect(field().value).toBe('delta')
    })

    it('two own writes before the first renders keep both params', async () => {
      const r = start(kind, '/search?q=alpha')
      fireEvent.change(field(), { target: { value: 'draft' } })
      await act(async () => {
        vi.advanceTimersByTime(300)
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'All' }))
      })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(at(r)).toBe('/search?q=draft&archived=all')
      expect(field().value).toBe('draft')
    })
  })
})

describe('AsCodeSearchPage — a navigation still loading', () => {
  it('a debounce expiring while a route loader runs does not cancel the navigation away', async () => {
    const router = createMemoryRouter(
      [
        { path: '/search', element: <AsCodeSearchPage /> },
        { path: '/other', loader: () => new Promise(() => {}), element: <div /> },
      ],
      { initialEntries: ['/search?q=alpha'] },
    )
    render(<RouterProvider router={router} />)
    fireEvent.change(field(), { target: { value: 'draft' } })
    await act(async () => {
      void router.navigate('/other')
      vi.advanceTimersByTime(300)
    })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(router.state.navigation.location?.pathname).toBe('/other')
    expect(router.state.location.search).toBe('?q=alpha')
    router.dispose()
  })
})

