import { test, expect } from '@playwright/test'

// Admin storageState. Has IMPORT_DATA, so /admin renders.
test.describe('Components Management Portal – admin smoke', () => {
  test('admin nav link is visible and lands on /admin', async ({ page }) => {
    await page.goto('/components')

    await page.getByRole('link', { name: /admin/i }).click()
    await page.waitForURL('**/admin')
    await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible()
  })

  test('component detail page loads with Archive button', async ({ page }) => {
    const resp = await page.request.get('/rest/api/4/components?page=0&size=1')
    const data = await resp.json()
    const firstId = data.content[0].id

    await page.goto(`/components/${firstId}`, { waitUntil: 'networkidle' })
    await page.waitForURL('**/components/**')

    await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 10_000 })
    // Archive button requires DELETE_COMPONENTS — admin has it.
    await expect(page.getByRole('button', { name: /archive/i })).toBeVisible()

    await expect(page.getByRole('tab', { name: /general/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /build/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /vcs/i })).toBeVisible()
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
