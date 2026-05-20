import { test, expect } from '@playwright/test'
import auditFixture from './fixtures/audit-actions.json' with { type: 'json' }
import componentsFixture from './fixtures/components-with-archived.json' with { type: 'json' }
import fieldConfigFixture from './fixtures/field-config-mixed-visibility.json' with { type: 'json' }
import {
  mockAuditRecent,
  mockComponentDetail,
  mockComponentList,
  mockFieldConfig,
  mockOwners,
  mockLabels,
} from './_helpers'

// PR-4 visual-acceptance: cross-page layout invariants. Filter rows
// share one wrapper with no card; main container width matches the
// prototype's max-w-7xl; GeneralTab uses gap-6 between sections; the
// header Archive button surfaces destructive variant via data-variant.

test.describe('layout conformance — FilterBar', () => {
  test('/components filter row is a single FilterBar with no card wrapper', async ({ page }) => {
    await mockComponentList(page, componentsFixture)
    await mockLabels(page, [])
    await page.goto('/components')

    const bars = page.getByTestId('filter-bar')
    await expect(bars).toHaveCount(1)
    const bar = bars.first()

    // No card-style ancestor (rounded-md + border + bg-card). The
    // prototype renders the row inline.
    await expect(bar).not.toHaveClass(/rounded-md/)
    await expect(bar).not.toHaveClass(/bg-card/)

    // Default variant for the components page = label-less, items-center.
    await expect(bar).toHaveClass(/items-center/)
  })

  test('/audit filter row uses FilterBar withLabels (items-end) and no card wrapper', async ({
    page,
  }) => {
    await mockAuditRecent(page, auditFixture)
    await page.goto('/audit')

    const bars = page.getByTestId('filter-bar')
    await expect(bars).toHaveCount(1)
    const bar = bars.first()

    await expect(bar).not.toHaveClass(/rounded-md/)
    await expect(bar).not.toHaveClass(/bg-card/)
    // withLabels=true → items-end so labelled controls bottom-align.
    await expect(bar).toHaveClass(/items-end/)
  })
})

test.describe('layout conformance — main container width', () => {
  test('main content uses max-w-screen-xl (80rem) — matches prototype max-w-7xl', async ({
    page,
  }) => {
    await mockComponentList(page, componentsFixture)
    await mockLabels(page, [])
    await page.goto('/components')

    const main = page.locator('main')
    await expect(main).toHaveCSS('max-width', '1280px')
  })
})

test.describe('layout conformance — ComponentDetailPage', () => {
  // ComponentDetailPage hits four endpoints on render: the list (header
  // breadcrumb), the detail body, the registry-wide field config (visibility
  // gating in GeneralTab), and the owners list (PeopleInput suggestions).
  // All four MUST be route-mocked — leaving any unmocked makes the spec
  // dependent on live CRS state and risks flakiness when admins change
  // field-config or owners drift.
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

  test.beforeEach(async ({ page }) => {
    await mockComponentList(page, componentsFixture)
    await mockComponentDetail(page, detailFixture)
    await mockFieldConfig(page, fieldConfigFixture)
    await mockOwners(page, [])
  })

  test('GeneralTab renders 3 sections (Identity / Ownership / Metadata) with gap-6', async ({
    page,
  }) => {
    await page.goto(`/components/${summary.id}`)

    // GeneralTab is the default tab; section data-testids land in DOM.
    const identity = page.getByTestId('section-identity')
    await expect(identity).toBeVisible()
    await expect(page.getByTestId('section-ownership')).toBeVisible()
    await expect(page.getByTestId('section-metadata')).toBeVisible()

    // Inner grid carries gap-6 → computed gap === 24px.
    const grid = identity.locator('.grid').first()
    await expect(grid).toHaveCSS('gap', '24px')
  })

  test('Archive button is rendered with data-variant="destructive"', async ({ page }) => {
    await page.goto(`/components/${summary.id}`)

    const archive = page.getByRole('button', { name: /^archive$/i })
    await expect(archive).toBeVisible()
    await expect(archive).toHaveAttribute('data-variant', 'destructive')
  })
})
