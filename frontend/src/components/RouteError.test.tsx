import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { RouteError } from './RouteError'

function Boom(): never {
  throw new Error('kaboom: a page blew up while rendering')
}

describe('RouteError', () => {
  it('renders a recoverable error surface (not a blank screen) when a route render throws', () => {
    // React logs the boundary-caught error to console.error; silence the expected noise.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = createMemoryRouter(
      [{ path: '/', element: <Boom />, errorElement: <RouteError /> }],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)

    // A human-facing error page with a recovery path — the opposite of a white screen.
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeDefined()
    expect(screen.getByText(/kaboom: a page blew up/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /reload/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /components/i })).toBeDefined()

    spy.mockRestore()
  })

  it('shows the status for a thrown route Response (e.g. a loader 404)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = createMemoryRouter(
      [
        {
          path: '/',
          loader: () => {
            throw new Response('Not Found', { status: 404, statusText: 'Not Found' })
          },
          element: <div>unreachable</div>,
          errorElement: <RouteError />,
        },
      ],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)

    // isRouteErrorResponse path → "404 Not Found", not the generic fallback message.
    expect(await screen.findByText(/404 Not Found/i)).toBeDefined()
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeDefined()
    spy.mockRestore()
  })
})
