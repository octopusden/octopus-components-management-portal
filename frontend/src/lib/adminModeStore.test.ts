import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The Admin-mode toggle is the UX gate for dangerous admin actions
// (e.g. Run migration). It is NOT a security gate — those live on CRS
// (@PreAuthorize) — but it must persist across reloads so a careful
// admin doesn't have to re-enable it every time they navigate. The
// store also needs to survive a hard refresh because the toggle lives
// in the footer (always mounted) but the migration panel is a tab on
// /admin (mounted on demand) — without persistence, switching tabs
// would silently drop the user out of admin mode.
//
// Persistence is delegated to Zustand's `persist` middleware writing
// to `localStorage`. Storage key is namespaced (`octopus.portal.*`) so
// future portal modules can co-exist without collisions, mirroring the
// DMS Portal `adminPane` store pattern.

const STORAGE_KEY = 'octopus.portal.adminMode'

beforeEach(() => {
  localStorage.clear()
  // Vitest caches module imports, but this store reads localStorage at
  // import time (Zustand persist hydrates eagerly). Reset modules so
  // each test gets a fresh store backed by the freshly cleared storage.
  vi.resetModules()
})

afterEach(() => {
  localStorage.clear()
})

describe('useAdminMode store', () => {
  it('defaults enabled to false on first load', async () => {
    const { useAdminMode } = await import('./adminModeStore')

    expect(useAdminMode.getState().enabled).toBe(false)
  })

  it('toggle() flips the enabled flag', async () => {
    const { useAdminMode } = await import('./adminModeStore')

    useAdminMode.getState().toggle()
    expect(useAdminMode.getState().enabled).toBe(true)

    useAdminMode.getState().toggle()
    expect(useAdminMode.getState().enabled).toBe(false)
  })

  it('set(true) explicitly enables, set(false) explicitly disables', async () => {
    const { useAdminMode } = await import('./adminModeStore')

    useAdminMode.getState().set(true)
    expect(useAdminMode.getState().enabled).toBe(true)

    useAdminMode.getState().set(false)
    expect(useAdminMode.getState().enabled).toBe(false)
  })

  it('persists enabled flag under octopus.portal.adminMode in localStorage', async () => {
    const { useAdminMode } = await import('./adminModeStore')

    useAdminMode.getState().set(true)

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    // Zustand's persist middleware wraps state in { state: ..., version: N }.
    // Asserting on the parsed shape rather than a raw string keeps the test
    // resilient to incidental serialization changes (e.g. version bump).
    const parsed = JSON.parse(raw!) as { state: { enabled: boolean } }
    expect(parsed.state.enabled).toBe(true)
  })

  it('re-imported store reads enabled=true from previously persisted state', async () => {
    // Pre-seed localStorage with the persisted shape Zustand would produce.
    // Going through the store's own toggle would also work, but seeding
    // directly proves we're reading it back, not just remembering it from
    // the same module instance.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { enabled: true }, version: 0 }),
    )

    const { useAdminMode } = await import('./adminModeStore')

    expect(useAdminMode.getState().enabled).toBe(true)
  })
})
