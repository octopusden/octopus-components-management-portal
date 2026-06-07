import { test, expect, type Page } from '@playwright/test'
import {
  mockComponentList,
  mockFieldConfig,
  mockOwners,
  mockLabels,
} from './visual/_helpers'

// ---------------------------------------------------------------------------
// Copy-component smoke (PR #83) — route-mocked, chromium-admin.
//
// Exercises the real built SPA end-to-end through both entry points:
//   1. detail-page header Copy → dialog prefill → POST payload contract →
//      navigate to the created component;
//   2. list-row Copy action → dialog fetches the full detail itself.
//
// ALL CRS data calls are intercepted via page.route, so the spec is
// self-contained; the POST body assertion is the executable version of the
// copied-vs-excluded contract documented in buildCopyRequest.ts.
// ---------------------------------------------------------------------------

const SOURCE_ID = '22222222-2222-2222-2222-222222222222'
const CREATED_ID = '33333333-3333-3333-3333-333333333333'
const DETAIL_RE = /\/rest\/api\/4\/components\/[^/?]+(?:\?.*)?$/
// POST /components has no query string, so the list-glob in _helpers
// (`...components?**`) never matches it — register the exact path too.
const COMPONENTS_BASE = '**/rest/api/4/components'
const FIELD_OVERRIDES = '**/rest/api/4/components/*/field-overrides'
const EMPLOYEE_STATUS = '**/rest/api/4/components/meta/employees/status'

const sourceDetail = {
  id: SOURCE_ID,
  name: 'svc-copy-source',
  displayName: 'Copy Source',
  componentOwner: 'owner-oscar',
  productType: 'TYPE_A',
  system: 'SYS1',
  clientCode: null,
  archived: false,
  solution: false,
  canEdit: true,
  parentComponentName: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  releaseManager: ['rm-alice'],
  securityChampion: ['sc-carol'],
  copyright: 'ACME',
  releasesInDefaultBranch: true,
  labels: ['backend'],
  jiraDisplayName: 'Copy Source Svc',
  jiraHotfixVersionFormat: '%d.%d.%d.%d',
  vcsExternalRegistry: null,
  distributionExplicit: true,
  distributionExternal: false,
  group: null,
  docs: [{ id: 'd-1', docComponentKey: 'docs-a', majorVersion: '1.x', sortOrder: 0 }],
  artifactIds: [{ id: 'a-1', groupPattern: 'org.x', artifactPattern: 'src-*' }],
  securityGroups: [{ id: 'sg-1', groupType: 'LAS', groupName: 'las-src' }],
  teamcityProjects: [{ id: 'tc-1', projectId: 'SrcProject', projectUrl: null, sortOrder: 0 }],
  configurations: [
    {
      id: 'cfg-base',
      versionRange: '(,0),[0,)',
      rowType: 'BASE',
      overriddenAttribute: null,
      isSyntheticBase: false,
      build: { buildSystem: 'GRADLE', gradleVersion: '8.5' },
      escrow: null,
      jira: { projectKey: 'SRC', majorVersionFormat: '%d.%d' },
      vcsEntries: [{ id: 'v-1', vcsPath: 'proj/src-repo', branch: 'main', sortOrder: 0 }],
      mavenArtifacts: [
        { id: 'm-1', groupPattern: 'org.x', artifactPattern: 'src', sortOrder: 0 },
      ],
      fileUrlArtifacts: [],
      dockerImages: [],
      packages: [],
      requiredTools: ['tool-a'],
    },
    {
      id: 'cfg-ovr',
      versionRange: '[1.0,2.0)',
      rowType: 'SCALAR_OVERRIDE',
      overriddenAttribute: 'build.buildSystem',
      isSyntheticBase: false,
      build: { buildSystem: 'MAVEN' },
      escrow: null,
      jira: null,
      vcsEntries: [],
      mavenArtifacts: [],
      fileUrlArtifacts: [],
      dockerImages: [],
      packages: [],
      requiredTools: [],
    },
  ],
}

function summaryPage() {
  return {
    content: [
      {
        id: SOURCE_ID,
        name: sourceDetail.name,
        displayName: sourceDetail.displayName,
        componentOwner: sourceDetail.componentOwner,
        system: sourceDetail.system,
        productType: sourceDetail.productType,
        archived: false,
        updatedAt: sourceDetail.updatedAt,
        labels: sourceDetail.labels,
      },
    ],
    totalElements: 1,
    totalPages: 1,
    number: 0,
    size: 20,
    first: true,
    last: true,
  }
}

async function setupRoutes(page: Page) {
  const state: { creates: Array<Record<string, unknown>> } = { creates: [] }

  await mockComponentList(page, summaryPage())
  await mockFieldConfig(page, {})
  await mockOwners(page, ['owner-oscar'])
  await mockLabels(page, ['backend'])
  await page.route(EMPLOYEE_STATUS, (route) => {
    const usernames = (route.request().postDataJSON() ?? []) as string[]
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(Object.fromEntries(usernames.map((u) => [u, true]))),
    })
  })
  await page.route(FIELD_OVERRIDES, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // POST /components — the copy itself. Echo a minimal created detail so the
  // SPA can navigate to /components/{CREATED_ID} and render it.
  await page.route(COMPONENTS_BASE, (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
    state.creates.push(body)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...sourceDetail,
        id: CREATED_ID,
        name: body.name,
        displayName: body.displayName ?? null,
        configurations: [],
        teamcityProjects: [],
        artifactIds: [],
      }),
    })
  })

  await page.route(DETAIL_RE, (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const created = route.request().url().includes(CREATED_ID)
    const detail = created
      ? {
          ...sourceDetail,
          id: CREATED_ID,
          name: 'svc-copy-clone',
          displayName: 'Copy Clone',
          configurations: [],
          teamcityProjects: [],
          artifactIds: [],
        }
      : sourceDetail
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(detail),
    })
  })

  return state
}

test.describe('Copy component — admin smoke', () => {
  test('detail-page Copy: prefill, POST contract (copied vs excluded), navigate to clone', async ({
    page,
  }) => {
    const state = await setupRoutes(page)
    await page.goto(`/components/${SOURCE_ID}`)

    await page.getByRole('button', { name: 'Create Similar', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Create Similar Component')).toBeVisible()

    // Display Name prefilled from the source; Component Key starts empty.
    await expect(dialog.getByLabel(/display name/i)).toHaveValue('Copy Source')
    await expect(dialog.getByLabel(/component key/i)).toHaveValue('')

    await dialog.getByLabel(/component key/i).fill('svc-copy-clone')
    await dialog.getByRole('button', { name: 'Create' }).click()

    // Navigates to the created component.
    await page.waitForURL(`**/components/${CREATED_ID}`)
    await expect(page.getByRole('heading', { name: 'svc-copy-clone' })).toBeVisible()

    // POST body = the copied-vs-excluded contract.
    expect(state.creates).toHaveLength(1)
    const body = state.creates[0]!
    expect(body).toMatchObject({
      name: 'svc-copy-clone',
      displayName: 'Copy Source',
      componentOwner: 'owner-oscar',
      system: 'SYS1',
      solution: false,
      copyright: 'ACME',
      releasesInDefaultBranch: true,
      distributionExplicit: true,
      distributionExternal: false,
      jiraHotfixVersionFormat: '%d.%d.%d.%d',
      archived: false,
      releaseManager: ['rm-alice'],
      securityChampion: ['sc-carol'],
      labels: ['backend'],
      docs: [{ docComponentKey: 'docs-a', majorVersion: '1.x' }],
      securityGroups: [{ groupType: 'LAS', groupName: 'las-src' }],
      // Required by the create contract but NOT copied (unique per component).
      artifactIds: [],
      teamcityProjects: [],
      baseConfiguration: {
        build: { buildSystem: 'GRADLE', gradleVersion: '8.5' },
        // jira.projectKey stripped; version formats kept.
        jira: { majorVersionFormat: '%d.%d' },
        requiredTools: ['tool-a'],
      },
    })
    const baseConfiguration = body.baseConfiguration as Record<string, unknown>
    for (const key of ['vcsEntries', 'mavenArtifacts', 'versionRange']) {
      expect(key in baseConfiguration, `${key} must not be copied`).toBe(false)
    }
    expect((baseConfiguration.jira as Record<string, unknown>).projectKey).toBeUndefined()
    expect('jiraDisplayName' in body, 'jiraDisplayName must not be copied').toBe(false)
    expect('group' in body, 'group is migration-owned').toBe(false)
  })

  test('list-row Copy: dialog fetches the source detail itself and prefills', async ({ page }) => {
    await setupRoutes(page)
    await page.goto('/components')

    await page.getByRole('button', { name: 'Create similar to svc-copy-source' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Create Similar Component')).toBeVisible()
    // Prefill proves the dialog loaded the FULL detail from a summary-only row.
    await expect(dialog.getByLabel(/display name/i)).toHaveValue('Copy Source')

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})
