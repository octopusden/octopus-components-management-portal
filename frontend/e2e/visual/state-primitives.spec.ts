import { test, expect } from '@playwright/test'
import componentsFixture from './fixtures/components-with-archived.json' with { type: 'json' }
import auditFixture from './fixtures/audit-actions.json' with { type: 'json' }
import {
  mockComponentList,
  mockComponentListError,
  mockAuditRecent,
  mockAuditRecentError,
  mockLabels,
} from './_helpers'

// PR-3 visual-acceptance: every page that previously inlined an empty /
// loading / error block now reaches it through one of the four state
// primitives — EmptyState, InlineError, StatusBanner, SkeletonBlock /
// SkeletonTable. Specs target their `data-testid` attributes so the
// asserts survive any future class-name churn.

const EMPTY_LIST_FIXTURE = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 20,
  first: true,
  last: true,
}

test.describe('state primitives — /components', () => {
  test('renders <SkeletonTable> while the list is loading', async ({ page }) => {
    // Stall the list response indefinitely so the skeleton stays mounted.
    await page.route('**/rest/api/4/components?**', (route) => {
      // Intentionally never call route.fulfill / continue / abort — the
      // request hangs until the test ends.
      void route
    })
    await mockLabels(page, [])
    await page.goto('/components')
    await expect(page.getByTestId('skeleton-table')).toBeVisible()
  })

  test('renders <EmptyState> when the list comes back empty', async ({ page }) => {
    await mockComponentList(page, EMPTY_LIST_FIXTURE)
    await mockLabels(page, [])
    await page.goto('/components')
    const empty = page.getByTestId('empty-state')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('No components found')
  })

  test('renders <InlineError> when the list endpoint errors', async ({ page }) => {
    await mockComponentListError(page)
    await mockLabels(page, [])
    await page.goto('/components')
    const err = page.getByTestId('inline-error')
    await expect(err).toBeVisible()
    await expect(err).toContainText(/Failed to load/i)
  })
})

test.describe('state primitives — /audit', () => {
  test('renders <EmptyState> when audit is empty', async ({ page }) => {
    await mockAuditRecent(page, EMPTY_LIST_FIXTURE)
    await page.goto('/audit')
    const empty = page.getByTestId('empty-state')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('No audit log entries found.')
  })

  test('renders <InlineError> when audit endpoint errors', async ({ page }) => {
    await mockAuditRecentError(page)
    await page.goto('/audit')
    await expect(page.getByTestId('inline-error')).toBeVisible()
  })

  test('renders rows when audit returns the canonical action fixture', async ({ page }) => {
    await mockAuditRecent(page, auditFixture)
    await page.goto('/audit')
    // Row-render sanity check — guarantees the PR-2 variants are reachable.
    await expect(page.getByText('CREATE')).toBeVisible()
    await expect(page.getByText('UPDATE')).toBeVisible()
    await expect(page.getByText('DELETE')).toBeVisible()
    await expect(page.getByText('RENAME')).toBeVisible()
  })
})

test.describe('state primitives — list with data', () => {
  test('archived row is dimmed via opacity-50 when fixture contains an archived entry', async ({
    page,
  }) => {
    await mockComponentList(page, componentsFixture)
    await mockLabels(page, [])
    await page.goto('/components')

    // The fixture has one row with archived: true — find it by name and
    // walk up to the closest <tr> to read its computed opacity.
    const archivedNameCell = page.getByText('legacy-archived', { exact: true }).first()
    await expect(archivedNameCell).toBeVisible()
    const tr = archivedNameCell.locator('xpath=ancestor::tr[1]')
    await expect(tr).toHaveCSS('opacity', '0.5')
  })
})

test.describe('state primitives — test components', () => {
  test('list hides test components by default and shows them with a "Test" badge under the preset', async ({
    page,
  }) => {
    // Route-mocked: one test component added to the shared fixture (kept
    // inline so the other specs' row counts are untouched). The handler
    // honours ?testComponent= like CRS, so the absent/present asserts below
    // prove the SPA sends the right filter.
    const rows = [
      ...componentsFixture.content,
      {
        id: '7d3f9a2e-5b1c-4e8f-9a6d-2c4b8e1f0a37',
        name: 'cvelab-test',
        displayName: null,
        componentOwner: 'alice',
        systems: [],
        productType: null,
        archived: false,
        testComponent: true,
        updatedAt: '2026-01-15T10:00:00Z',
      },
    ]
    await page.route('**/rest/api/4/components?**', (route) => {
      const flag = new URL(route.request().url()).searchParams.get('testComponent')
      const content =
        flag === null
          ? rows
          : rows.filter((r) => (('testComponent' in r && r.testComponent) || false) === (flag === 'true'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...componentsFixture, content, totalElements: content.length }),
      })
    })
    await mockLabels(page, [])

    await page.goto('/components')
    await expect(page.getByText('alpha', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('cvelab-test', { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Test components' }).click()
    const name = page.getByText('cvelab-test', { exact: true }).first()
    await expect(name).toBeVisible()
    await expect(page.getByText('alpha', { exact: true })).toHaveCount(0)
    await expect(name.locator('xpath=ancestor::tr[1]').getByText('Test', { exact: true })).toBeVisible()
  })
})
