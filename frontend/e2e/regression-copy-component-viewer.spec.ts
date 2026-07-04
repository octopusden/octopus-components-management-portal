import { test, expect, type Page } from '@playwright/test'
import { mockComponentList, mockFieldConfig, mockOwners, mockLabels } from './visual/_helpers'

// ---------------------------------------------------------------------------
// Copy-component permission gate — viewer side (PR #83), route-mocked.
//
// Viewer storageState has ACCESS_COMPONENTS but NOT CREATE_COMPONENTS, so
// neither entry point may render: no per-row Copy action on the list, no
// Copy button in the detail header. The admin-side flow lives in
// editor-copy-component.spec.ts under chromium-admin.
// ---------------------------------------------------------------------------

const SOURCE_ID = '22222222-2222-2222-2222-222222222222'
const DETAIL_RE = /\/rest\/api\/4\/components\/[^/?]+(?:\?.*)?$/
const FIELD_OVERRIDES = '**/rest/api/4/components/*/field-overrides'
const EMPLOYEE_STATUS = '**/rest/api/4/components/meta/employees/status'

const sourceDetail = {
  id: SOURCE_ID,
  name: 'svc-copy-source',
  displayName: 'Copy Source',
  componentOwner: 'owner-oscar',
  productType: null,
  systems: ['SYS1'],
  clientCode: null,
  archived: false,
  solution: false,
  canEdit: false,
  parentComponentName: null,
  version: 1,
  createdAt: null,
  updatedAt: null,
  labels: [],
  group: null,
  docs: [],
  artifactIds: [],
  securityGroups: [],
  teamcityProjects: [],
  configurations: [],
}

async function setupRoutes(page: Page) {
  await mockComponentList(page, {
    content: [
      {
        id: SOURCE_ID,
        name: sourceDetail.name,
        displayName: sourceDetail.displayName,
        componentOwner: sourceDetail.componentOwner,
        systems: sourceDetail.systems,
        productType: null,
        archived: false,
        updatedAt: null,
        labels: [],
      },
    ],
    totalElements: 1,
    totalPages: 1,
    number: 0,
    size: 20,
    first: true,
    last: true,
  })
  await mockFieldConfig(page, {})
  await mockOwners(page, [])
  await mockLabels(page, [])
  await page.route(EMPLOYEE_STATUS, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.route(FIELD_OVERRIDES, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route(DETAIL_RE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sourceDetail),
    }),
  )
}

test.describe('Copy component — viewer permission gate', () => {
  test('list rows render no Copy action without CREATE_COMPONENTS', async ({ page }) => {
    await setupRoutes(page)
    await page.goto('/components')
    await expect(page.getByRole('link', { name: 'svc-copy-source' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^create similar to /i })).toHaveCount(0)
  })

  test('detail header renders no Copy button without CREATE_COMPONENTS', async ({ page }) => {
    await setupRoutes(page)
    await page.goto(`/components/${SOURCE_ID}`)
    await expect(page.getByRole('heading', { name: 'svc-copy-source' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create Similar', exact: true })).toHaveCount(0)
  })
})
