import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
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
