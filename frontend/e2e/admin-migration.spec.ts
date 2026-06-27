import { test, expect } from '@playwright/test'
import { mockHappyPathMigration, mockIdleMigration } from './fixtures/migration-routes'

// Runs under chromium-admin (admin storageState). Three of the four
// TD-001 journeys live here; the non-admin redirect lives in
// admin-migration-viewer.spec.ts so storageState stays one-to-one with
// the spec file.
test.describe('Admin migration – admin journeys', () => {
  test('admin lands on /admin and sees the migration tab + footer admin switch', async ({ page }) => {
    await mockIdleMigration(page)
    await page.goto('/admin')

    await expect(page.getByRole('heading', { name: /admin settings/i })).toBeVisible()
    await page.getByRole('tab', { name: /migration/i }).click()
    await expect(page.getByRole('button', { name: /run migration/i })).toBeVisible()

    // Footer Admin-mode switch (exact name — the Migration tab also has an
    // "Arm admin mode" switch, so /admin mode/i would be ambiguous).
    await expect(page.getByRole('switch', { name: 'Admin mode', exact: true })).toBeVisible()
    // The inline arm bar is the on-tab control for the destructive actions.
    await expect(page.getByRole('switch', { name: 'Arm admin mode', exact: true })).toBeVisible()
  })

  test('admin without Admin mode toggled sees disabled button + helper text', async ({ page }) => {
    await mockIdleMigration(page)
    await page.goto('/admin')

    await page.getByRole('tab', { name: /migration/i }).click()
    const runButton = page.getByRole('button', { name: /run migration/i })
    await expect(runButton).toBeDisabled()
    await expect(
      page.getByText(/Arm Admin mode above to run migration\./i),
    ).toBeVisible()
  })

  test('admin runs migration through to 4 result tiles + failed-components details + toast', async ({ page }) => {
    await mockHappyPathMigration(page)
    await page.goto('/admin')

    await page.getByRole('tab', { name: /migration/i }).click()
    // Arm Admin mode via the inline arm bar on the Migration tab (shares the
    // same store as the footer switch).
    await page.getByRole('switch', { name: 'Arm admin mode', exact: true }).click()
    await page.getByRole('button', { name: /run migration/i }).click()
    // Confirm dialog → Confirm.
    await page.getByRole('button', { name: /^confirm$/i }).click()

    // Progress block animates while RUNNING (1s polling cadence). We
    // don't pin to a specific counter value — the only contract is that
    // the progress block shows up at all.
    const progress = page.getByTestId('migration-progress')
    await expect(progress).toBeVisible({ timeout: 5_000 })

    // Once COMPLETED, four StatCards (Total / Migrated / Failed / Skipped).
    await expect(page.getByText(/^total$/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/^migrated$/i)).toBeVisible()
    await expect(page.getByText(/^failed$/i).first()).toBeVisible()
    await expect(page.getByText(/^skipped$/i)).toBeVisible()

    // Failed-components <details> with the one mocked failure.
    await expect(page.getByText(/Failed components \(1\)/i)).toBeVisible()
    // Completion toast (Toaster portal). The string appears in the toast
    // title, the live-region announcement, and a duplicate render in
    // some browsers — pick the live-region match unambiguously.
    await expect(page.getByRole('status').filter({ hasText: /migration completed/i })).toBeVisible()
  })
})
