import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, Link } from 'react-router'
import { UnsavedChangesGuard } from './UnsavedChangesGuard'

function renderWithGuard(when: boolean) {
  const router = createMemoryRouter(
    [
      {
        path: '/edit',
        element: (
          <div>
            <UnsavedChangesGuard when={when} />
            <Link to="/other">Go elsewhere</Link>
          </div>
        ),
      },
      { path: '/other', element: <div>Other page</div> },
    ],
    { initialEntries: ['/edit'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('UnsavedChangesGuard', () => {
  it('blocks navigation and shows the confirm dialog when dirty', async () => {
    renderWithGuard(true)
    fireEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))
    await waitFor(() => expect(screen.getByText(/discard unsaved changes/i)).toBeDefined())
    // Still on the edit page (navigation intercepted).
    expect(screen.queryByText('Other page')).toBeNull()
  })

  it('"Stay" keeps the user on the page', async () => {
    renderWithGuard(true)
    fireEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))
    await screen.findByText(/discard unsaved changes/i)
    fireEvent.click(screen.getByRole('button', { name: /stay/i }))
    await waitFor(() => expect(screen.queryByText(/discard unsaved changes/i)).toBeNull())
    expect(screen.queryByText('Other page')).toBeNull()
  })

  it('"Leave without saving" proceeds with the navigation', async () => {
    renderWithGuard(true)
    fireEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))
    await screen.findByText(/discard unsaved changes/i)
    fireEvent.click(screen.getByRole('button', { name: /leave without saving/i }))
    await waitFor(() => expect(screen.getByText('Other page')).toBeDefined())
  })

  it('does NOT block navigation when clean', async () => {
    renderWithGuard(false)
    fireEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))
    await waitFor(() => expect(screen.getByText('Other page')).toBeDefined())
    expect(screen.queryByText(/discard unsaved changes/i)).toBeNull()
  })
})
