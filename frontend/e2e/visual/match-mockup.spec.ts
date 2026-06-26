import { test, expect } from '@playwright/test'
import componentsFixture from './fixtures/components-with-archived.json' with { type: 'json' }
import fieldConfigFixture from './fixtures/field-config-mixed-visibility.json' with { type: 'json' }
import { mockComponentDetail, mockComponentList, mockFieldConfig, mockLabels, mockOwners } from './_helpers'

// §7.0.6 visual closeup: four runtime assertions that pin the prototype-
// match work to behaviour the design specs called out as HIGH/MEDIUM
// severity diffs. Each assertion belongs to a distinct PR (A/B/C/D) and
// guards a single observable: tabs underline (no bg-muted), 36px input
// height, zinc-900 primary button, and the circular-initials avatar in
// the header. All assertions share the same route mocks pattern as the
// rest of the visual suite — no live CRS dependency.

const summary = (componentsFixture as { content: Array<Record<string, unknown>> }).content[0]
const detailFixture = {
  ...summary,
  archived: false,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  metadata: {},
  buildConfigurations: [],
  vcsSettings: [],
  distributions: [],
  jiraComponentConfigs: [],
  escrowConfigurations: [],
  versions: [],
}

test.describe('§7.0.6 match mockup — PR-A tabs underline variant', () => {
  test('/components/{id} TabsList does not carry bg-muted (underline variant active)', async ({
    page,
  }) => {
    await mockComponentList(page, componentsFixture)
    await mockComponentDetail(page, detailFixture)
    await mockFieldConfig(page, fieldConfigFixture)
    await mockOwners(page, [])

    await page.goto(`/components/${summary.id}`)

    const tabList = page.getByRole('tablist').first()
    await expect(tabList).toBeVisible()
    // Pill variant carries `bg-muted`; underline variant must not.
    await expect(tabList).not.toHaveClass(/bg-muted/)
    await expect(tabList).toHaveClass(/border-b/)
  })
})

test.describe('§7.0.6 match mockup — PR-B 36px form controls', () => {
  test('/components filter-row Input renders at h-9 (36px)', async ({ page }) => {
    await mockComponentList(page, componentsFixture)
    await mockLabels(page, [])
    await page.goto('/components')

    const filterBar = page.getByTestId('filter-bar')
    await expect(filterBar).toBeVisible()
    const input = filterBar.locator('input').first()
    await expect(input).toBeVisible()

    const box = await input.boundingBox()
    expect(box?.height).toBe(36)
  })
})

test.describe('§7.0.6 match mockup — PR-C zinc primary token', () => {
  test('/components/{id} Save button computed background is rgb(24, 24, 27)', async ({ page }) => {
    await mockComponentList(page, componentsFixture)
    await mockComponentDetail(page, detailFixture)
    await mockFieldConfig(page, fieldConfigFixture)
    await mockOwners(page, [])

    await page.goto(`/components/${summary.id}`)

    // The single sticky SaveBar button (was the per-tab "Save"); label is now
    // "Save changes". It carries the same default Button variant / primary token.
    const save = page.getByRole('button', { name: 'Save changes' }).first()
    await expect(save).toBeVisible()
    // Default Button variant uses bg-primary; zinc-900 → rgb(24, 24, 27).
    await expect(save).toHaveCSS('background-color', 'rgb(24, 24, 27)')
  })
})

test.describe('§7.0.6 match mockup — PR-D header initials avatar', () => {
  test('/components header user-area renders a 28×28 rounded avatar with two uppercase chars', async ({
    page,
  }) => {
    await mockComponentList(page, componentsFixture)
    await mockLabels(page, [])
    await page.goto('/components')

    const header = page.locator('header')
    const avatar = header.locator('span.rounded-full[aria-hidden]').first()
    await expect(avatar).toBeVisible()
    // h-7/w-7 → 28px.
    const box = await avatar.boundingBox()
    expect(box?.height).toBe(28)
    expect(box?.width).toBe(28)
    // e2e-admin → "EA" — two uppercase ASCII chars.
    await expect(avatar).toHaveText(/^[A-Z]{2}$/)
  })
})
