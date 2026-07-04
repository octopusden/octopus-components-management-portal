import { describe, it, expect } from 'vitest'
import { isValidElement, type ReactElement } from 'react'
import { matchRoutes } from 'react-router'
import { appRoutes } from './App'
import { RouteError } from './components/RouteError'
import { CreateComponentPage } from './pages/CreateComponentPage'

describe('appRoutes', () => {
  it('wires the RouteError boundary on the AppShell layout route (white-screen guard)', () => {
    const shell = appRoutes[0]
    expect(shell).toBeDefined()
    // It is the layout route (has the page routes as children).
    expect((shell!.children?.length ?? 0)).toBeGreaterThan(0)
    // Removing `errorElement: <RouteError />` from App.tsx must fail here, not regress silently.
    expect(isValidElement(shell!.errorElement)).toBe(true)
    expect((shell!.errorElement as ReactElement).type).toBe(RouteError)
  })

  it('resolves /components/new to the wizard, NOT the detail page with id="new"', () => {
    const matches = matchRoutes(appRoutes, '/components/new')
    expect(matches).not.toBeNull()
    const leaf = matches![matches!.length - 1]!
    // The static wizard route must win over the dynamic /components/:id route.
    expect(leaf.route.path).toBe('/components/new')
    expect((leaf.route.element as ReactElement).type).toBe(CreateComponentPage)
    // And it must not have matched as a param route with id="new".
    expect((leaf.params as { id?: string }).id).toBeUndefined()
  })
})
