import { test, expect, type Page } from '@playwright/test'
import {
  mockComponentList,
  mockComponentDefaults,
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
const EMPLOYEE_SEARCH = '**/rest/api/4/components/meta/employees?*'

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
  artifactIds: [{ id: 'a-1', versionRange: null, groupPattern: 'org.x', mode: 'ALL', artifactTokens: [] }],
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
      jira: { projectKey: 'SRC', minorVersionFormat: '%d.%d' },
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

async function setupRoutes(page: Page, sourceOverride: Record<string, unknown> = {}) {
  const state: { creates: Array<Record<string, unknown>> } = { creates: [] }
  const detail = { ...sourceDetail, ...sourceOverride }

  await mockComponentList(page, summaryPage())
  await mockFieldConfig(page, {})
  // The create dialog gates its form mount on component-defaults and prefills
  // the VCS tag from it.
  await mockComponentDefaults(page)
  await mockOwners(page, ['owner-oscar'])
  await mockLabels(page, ['backend'])
  // The unified dialog reads build systems via useFieldOptions('buildSystem');
  // mock it so the scratch path can deterministically pick MAVEN without
  // depending on the live CRS meta endpoint (keeps this spec fully route-mocked).
  await page.route('**/rest/api/4/components/meta/build-systems', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(['MAVEN', 'GRADLE']) }),
  )
  // The create dialog pre-validates the maven Group ID against the supported
  // groupId prefixes (CRS v2 /common/supported-groups). Mock it so the spec is
  // self-contained and the 'org.acme' coordinate used below passes the check —
  // otherwise the real stand's prefixes block the submit and the create never POSTs.
  await page.route('**/rest/api/2/common/supported-groups', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(['org.acme']) }),
  )
  // PeopleInput commits a typed/picked person only after the directory lookup
  // resolves with an exact active match (PR #79) — every typed person in this
  // spec is active, so echo the query back as an active match.
  await page.route(EMPLOYEE_SEARCH, (route) => {
    const username = new URL(route.request().url()).searchParams.get('search')?.trim() ?? ''
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(username ? [{ username, active: true }] : []),
    })
  })
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

  // POST /components — the create itself. Echo a minimal created detail so the
  // SPA can navigate to /components/{CREATED_ID} and render it.
  await page.route(COMPONENTS_BASE, (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
    state.creates.push(body)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...detail,
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
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        created
          ? { ...detail, id: CREATED_ID, name: 'svc-copy-clone', displayName: 'Copy Clone', configurations: [], teamcityProjects: [], artifactIds: [] }
          : detail,
      ),
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

    // Display Name is NOT prefilled from the source (it is unique); Component Key starts empty.
    await expect(dialog.getByLabel(/^display name/i)).toHaveValue('')
    await expect(dialog.getByLabel(/^component key/i)).toHaveValue('')

    // GRADLE requires VCS → the block is visible. Tag/branch are reusable
    // format patterns: branch prefills from the source BASE VCS entry ('main'),
    // tag (absent on the source entry) from component-defaults. The URL is
    // unique and starts empty. (^-anchored labels skip the FieldInfo buttons.)
    await expect(dialog.getByLabel(/^vcs url/i)).toHaveValue('')
    await expect(dialog.getByLabel(/^tag/i)).toHaveValue('$module-$version')
    await expect(dialog.getByLabel(/^production branch/i)).toHaveValue('main')

    await dialog.getByLabel(/^component key/i).fill('svc-copy-clone')
    await dialog.getByLabel(/^display name/i).fill('Copy Clone Name')
    await dialog.getByLabel(/^vcs url/i).fill('ssh://git@host/proj/clone-repo.git')
    await dialog.getByLabel(/^jira project key/i).fill('CLONE')
    await dialog.getByRole('button', { name: 'Create' }).click()

    // Navigates to the created component.
    await page.waitForURL(`**/components/${CREATED_ID}`)
    await expect(page.getByRole('heading', { name: 'svc-copy-clone' })).toBeVisible()

    // POST body = the copied-vs-excluded contract.
    expect(state.creates).toHaveLength(1)
    const body = state.creates[0]!
    expect(body).toMatchObject({
      name: 'svc-copy-clone',
      displayName: 'Copy Clone Name',
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
        // source jira.projectKey stripped; the form's key wins. Version formats kept.
        jira: { minorVersionFormat: '%d.%d', projectKey: 'CLONE' },
        requiredTools: ['tool-a'],
        // The VCS entry is form-driven: URL typed fresh, branch from the
        // source entry, tag from component-defaults. The source vcsPath
        // ('proj/src-repo') must never leak into the payload.
        vcsEntries: [
          { vcsPath: 'ssh://git@host/proj/clone-repo.git', tag: '$module-$version', branch: 'main' },
        ],
      },
    })
    const baseConfiguration = body.baseConfiguration as Record<string, unknown>
    for (const key of ['mavenArtifacts', 'versionRange']) {
      expect(key in baseConfiguration, `${key} must not be copied`).toBe(false)
    }
    expect('jiraDisplayName' in body, 'jiraDisplayName must not be copied').toBe(false)
    expect('group' in body, 'group is migration-owned').toBe(false)
  })

  test('list-row Clone: dialog fetches the source detail itself and prefills', async ({ page }) => {
    await setupRoutes(page)
    await page.goto('/components')

    // The list-row action is now "Clone" (was "Create similar"); its aria-label
    // is "Clone <key> into a new component". The detail-page button stays
    // "Create Similar".
    await page.getByRole('button', { name: 'Clone svc-copy-source into a new component' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Create Similar Component')).toBeVisible()
    // Owner prefill proves the dialog loaded the FULL detail from a summary-only row.
    // (displayName is intentionally NOT prefilled — it is unique.)
    await expect(dialog.getByLabel(/^display name/i)).toHaveValue('')
    await expect(dialog.getByPlaceholder('AD userkey')).toHaveValue('owner-oscar')

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('explicit+external source: gated block prefilled, user fills coordinate, POST carries it', async ({
    page,
  }) => {
    const state = await setupRoutes(page, {
      distributionExplicit: true,
      distributionExternal: true,
      releaseManager: ['rm-alice'],
      securityChampion: ['sc-carol'],
    })
    await page.goto(`/components/${SOURCE_ID}`)
    await page.getByRole('button', { name: 'Create Similar', exact: true }).click()
    const dialog = page.getByRole('dialog')

    // Gated block visible, RM/SC prefilled, coordinate empty.
    await expect(dialog.getByText(/required for explicit \+ external/i)).toBeVisible()
    await expect(dialog.getByText('rm-alice')).toBeVisible()
    await expect(dialog.getByText('sc-carol')).toBeVisible()

    await dialog.getByLabel(/^component key/i).fill('svc-copy-clone')
    await dialog.getByLabel(/^display name/i).fill('Copy Clone Name')
    await dialog.getByLabel(/^vcs url/i).fill('ssh://git@host/proj/clone-repo.git')
    await dialog.getByLabel(/^jira project key/i).fill('CLONE')
    // Fill a maven coordinate (default type).
    await dialog.getByLabel('Group ID').fill('org.acme')
    await dialog.getByLabel('Artifact ID').fill('svc')
    await dialog.getByRole('button', { name: 'Create' }).click()

    await page.waitForURL(`**/components/${CREATED_ID}`)
    expect(state.creates).toHaveLength(1)
    const body = state.creates[0]!
    expect(body).toMatchObject({
      distributionExplicit: true,
      distributionExternal: true,
      releaseManager: ['rm-alice'],
      securityChampion: ['sc-carol'],
      baseConfiguration: {
        mavenArtifacts: [{ groupPattern: 'org.acme', artifactPattern: 'svc' }],
      },
    })
  })
})

test.describe('Create component from scratch — admin smoke', () => {
  test('explicit+external gated block: fill RM/SC + docker coordinate, POST carries them', async ({
    page,
  }) => {
    const state = await setupRoutes(page)
    await page.goto('/components')

    // Exact match: the per-row Clone action's aria-label ("Clone <key> into a
    // new component") also matches /new component/i, so a regex resolves to 2
    // buttons (strict-mode violation). The header create button is exactly "New Component".
    await page.getByRole('button', { name: 'New Component', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Create Component')).toBeVisible()

    await dialog.getByLabel(/^component key/i).fill('scratch-svc')
    await dialog.getByLabel(/^display name/i).fill('Scratch Svc')
    // Build System is a native <select> — selectOption is unambiguous and
    // closes cleanly (no portal overlay to block later clicks).
    await dialog.getByLabel(/^build system/i).selectOption('MAVEN')
    // MAVEN requires VCS → block appears, tag prefilled from component-defaults
    // and branch from the portal fallback; only the URL needs typing.
    await expect(dialog.getByLabel(/^tag/i)).toHaveValue('$module-$version')
    await expect(dialog.getByLabel(/^production branch/i)).toHaveValue('master')
    await dialog.getByLabel(/^vcs url/i).fill('ssh://git@host/proj/scratch-repo.git')
    await dialog.getByLabel(/^jira project key/i).fill('SCR')
    const ownerInput = dialog.getByPlaceholder('AD userkey')
    await ownerInput.fill('owner-oscar')
    // Click the suggestion to commit + close the popup. (Enter would submit the
    // whole form; blur commits but leaves the popup open over the checkbox.)
    // A fast click lands before the 300ms suggestion debounce annotates the
    // entry with `active`, so the commit may go through the (mocked) network
    // validation — wait out the indicator so the Create button isn't held by
    // the validating guard later. (Post-debounce clicks short-circuit and the
    // indicator never shows; the wait then resolves immediately.)
    await dialog.getByRole('button', { name: /owner-oscar/i }).click()
    await expect(dialog.getByText('Validating person...')).toHaveCount(0)

    // Toggle Explicit (External is on by default) → gated block appears.
    await dialog.getByLabel(/^explicit/i).check()
    await expect(dialog.getByText(/required for explicit \+ external/i)).toBeVisible()

    // RM / SC via the add-row autocomplete. A typed person lands as a list row
    // only after the async lookup validates it — await each COMMITTED row
    // (scoped to the list container; bare getByText could match the still-open
    // suggestion popup button) before moving on.
    const listRows = dialog.getByTestId('people-list-rows')
    const peopleInputs = dialog.getByPlaceholder('Add person')
    await peopleInputs.nth(0).fill('rm-bob')
    await peopleInputs.nth(0).blur()
    await expect(listRows.getByText('rm-bob', { exact: true })).toBeVisible()
    await peopleInputs.nth(1).fill('sc-bob')
    await peopleInputs.nth(1).blur()
    await expect(listRows.getByText('sc-bob', { exact: true })).toBeVisible()

    // Docker coordinate.
    await dialog.getByLabel(/^distribution coordinate/i).selectOption('docker')
    await dialog.getByLabel('Image name').fill('acme/scratch')

    await dialog.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL(`**/components/${CREATED_ID}`)

    expect(state.creates).toHaveLength(1)
    const body = state.creates[0]!
    expect(body).toMatchObject({
      name: 'scratch-svc',
      distributionExplicit: true,
      distributionExternal: true,
      releaseManager: ['rm-bob'],
      securityChampion: ['sc-bob'],
      baseConfiguration: {
        build: { buildSystem: 'MAVEN' },
        dockerImages: [{ imageName: 'acme/scratch' }],
        jira: { projectKey: 'SCR' },
        vcsEntries: [
          { vcsPath: 'ssh://git@host/proj/scratch-repo.git', tag: '$module-$version', branch: 'master' },
        ],
      },
    })
  })
})
