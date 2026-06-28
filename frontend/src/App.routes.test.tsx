import { describe, it, expect } from 'vitest'
import { isValidElement, type ReactElement } from 'react'
import { appRoutes } from './App'
import { RouteError } from './components/RouteError'

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
})
