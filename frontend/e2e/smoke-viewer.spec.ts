import { test, expect } from '@playwright/test'

// Viewer storageState. Has REGISTRY_VIEWER → ACCESS_COMPONENTS + ACCESS_AUDIT.
// Does NOT have IMPORT_DATA, so /admin must NOT be exercised here — that
// belongs in smoke-admin.spec.ts under chromium-admin.
test.describe('Components Management Portal – viewer smoke', () => {
  test('loads and shows component list', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL('**/components')
    await expect(page.getByRole('heading', { name: 'Components' })).toBeVisible()

    const badge = page.locator('text=/\\d+ total/')
    await expect(badge).toBeVisible({ timeout: 10_000 })
    const text = await badge.textContent()
    const count = parseInt(text ?? '0')
    expect(count).toBeGreaterThan(0)

    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
  })

  test('audit nav link works', async ({ page }) => {
    await page.goto('/components')
    await page.getByRole('link', { name: /audit/i }).click()
    await page.waitForURL('**/audit')
    await expect(page.getByRole('heading', { name: /audit/i })).toBeVisible()

    await page.getByRole('link', { name: /components/i }).first().click()
    await page.waitForURL('**/components')
    await expect(page.getByRole('heading', { name: 'Components' })).toBeVisible()
  })

  test('component detail page loads', async ({ page }) => {
    const resp = await page.request.get('/rest/api/4/components?page=0&size=1')
    const data = await resp.json()
    const firstId = data.content[0].id

    await page.goto(`/components/${firstId}`, { waitUntil: 'networkidle' })
    await page.waitForURL('**/components/**')

    await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /delete/i })).toBeVisible()

    await expect(page.getByRole('tab', { name: /general/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /build/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /vcs/i })).toBeVisible()
  })

  test('no JS errors on viewer-accessible pages', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    for (const path of ['/components', '/audit']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
    }

    expect(errors).toEqual([])
  })
})
