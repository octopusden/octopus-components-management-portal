import { test, expect } from '@playwright/test'
import fieldConfigFixture from './fixtures/field-config-mixed-visibility.json' with { type: 'json' }
import { mockFieldConfig } from './_helpers'

// Config-as-code admin surface is read-only (CRS ADR-016). These route-mocked,
// admin-authenticated specs (chromium-admin project, via e2e/visual/) cover the
// two new behaviours that component tests assert but no e2e did: the Reload
// button (POST /admin/reload-config) and the read-only Component Defaults tab.

const COMPONENT_DEFAULTS = '**/rest/api/4/config/component-defaults'
const RELOAD_CONFIG = '**/rest/api/4/admin/reload-config'

test.describe('admin config-as-code — Reload + read-only forms', () => {
  test('Reload calls POST /admin/reload-config, gated behind Admin mode', async ({ page }) => {
    await mockFieldConfig(page, fieldConfigFixture)
    await page.route(COMPONENT_DEFAULTS, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ buildSystem: 'MAVEN' }) }),
    )
    let reloadCalls = 0
    await page.route(RELOAD_CONFIG, (route) => {
      reloadCalls += 1
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'reloaded', changedKeys: [] }),
      })
    })

    await page.goto('/admin')

    const reloadBtn = page.getByRole('button', { name: /^reload$/i })
    await expect(reloadBtn).toBeVisible()
    // Disabled until Admin mode is enabled (the footer switch).
    await expect(reloadBtn).toBeDisabled()
    await page.getByRole('switch', { name: /admin mode/i }).click()
    await expect(reloadBtn).toBeEnabled()

    await reloadBtn.click()
    await expect.poll(() => reloadCalls).toBeGreaterThan(0)
  })

  test('Component Defaults tab is read-only — no Save / Import controls', async ({ page }) => {
    await mockFieldConfig(page, fieldConfigFixture)
    await page.route(COMPONENT_DEFAULTS, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ buildSystem: 'MAVEN' }) }),
    )

    await page.goto('/admin')
    await page.getByRole('tab', { name: /component defaults/i }).click()

    // The loaded default renders, read-only; the legacy write controls are gone.
    // `getByDisplayValue` is a Testing-Library method, not a Playwright one — locate the
    // read-only input as the sibling of its (non-htmlFor-associated) label and assert its value.
    await expect(
      page.getByText('Build System (default)', { exact: true }).locator('xpath=following-sibling::input'),
    ).toHaveValue('MAVEN')
    await expect(page.getByRole('button', { name: /^save$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /import from git/i })).toHaveCount(0)
  })
})
