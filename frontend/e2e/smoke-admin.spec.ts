import { test, expect } from '@playwright/test'

// Admin storageState. Has IMPORT_DATA, so /admin renders.
test.describe('Components Management Portal – admin smoke', () => {
  test('admin nav link is visible and lands on /admin', async ({ page }) => {
    await page.goto('/components')

    await page.getByRole('link', { name: /admin/i }).click()
    await page.waitForURL('**/admin')
    await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible()
  })

  test('no JS errors on /admin', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    expect(errors).toEqual([])
  })
})
