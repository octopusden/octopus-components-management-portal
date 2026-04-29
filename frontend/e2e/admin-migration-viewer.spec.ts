import { test, expect } from '@playwright/test'
import { mockIdleMigration } from './fixtures/migration-routes'

// Runs under chromium-viewer (viewer storageState). The viewer has only
// ACCESS_COMPONENTS + ACCESS_AUDIT, so RequirePermission(IMPORT_DATA)
// guarding /admin redirects them to /components.
test.describe('Admin migration – viewer redirect', () => {
  test('non-admin /admin lands on /components, no migration content', async ({ page }) => {
    // Stub the migration endpoints anyway as belt-and-braces — if the
    // route gate ever flickers, the spec still doesn't reach live CRS.
    await mockIdleMigration(page)

    await page.goto('/admin')
    // RequirePermission redirects on missing permission.
    await page.waitForURL('**/components')
    await expect(page.getByRole('heading', { name: 'Components' })).toBeVisible()

    // No migration UI rendered.
    await expect(page.getByRole('tab', { name: /migration/i })).toHaveCount(0)
    // No Admin mode switch in the footer (AdminPane returns null without IMPORT_DATA).
    await expect(page.getByRole('switch', { name: /admin mode/i })).toHaveCount(0)
  })
})
