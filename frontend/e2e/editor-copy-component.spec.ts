import { test, expect, type Page } from '@playwright/test'
import {
  mockComponentList,
  mockComponentDefaults,
  mockFieldConfig,
  mockOwners,
  mockLabels,
} from './visual/_helpers'

// ---------------------------------------------------------------------------
// Create/Clone-component smoke — route-mocked, chromium-admin.
//
// Exercises the real built SPA through the full-page wizard at /components/new
// via both entry points:
//   1. detail-page header Clone → /components/new?from={id} → step through the
//      wizard → POST payload contract → navigate to the created component;
//   2. list-row Clone action → same wizard route, prefilled from the source;
//   3. New Component → scratch wizard (profile gate first).
//
// ALL CRS data calls are intercepted via page.route, so the spec is
// self-contained; the POST body assertion is the executable version of the
// copied-vs-excluded contract documented in buildCreateRequest.ts.
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
  systems: ['SYS1'],
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
        systems: sourceDetail.systems,
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
  // The Escrow step's Generation select reads useFieldOptions('generation') →
  // /components/meta/escrow-generations. Mock it so the scratch path can pick a
  // value deterministically without the live CRS meta endpoint.
  await page.route('**/rest/api/4/components/meta/escrow-generations', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(['AUTO', 'MANUAL']) }),
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

test.describe('Clone component — admin smoke', () => {
  test('detail-page Clone: prefill, POST contract (copied vs excluded), navigate to clone', async ({
    page,
  }) => {
    const state = await setupRoutes(page)
    await page.goto(`/components/${SOURCE_ID}`)

    await page.getByRole('button', { name: 'Clone', exact: true }).click()
    await page.waitForURL('**/components/new?from=*')
    await expect(page.getByRole('heading', { name: 'Clone svc-copy-source' })).toBeVisible()

    // Clone skips the Profile step and opens on General. Display Name is NOT
    // prefilled from the source (it is unique); Component Key starts empty; the
    // owner IS prefilled. (^-anchored labels skip the FieldInfo buttons.)
    await expect(page.getByLabel(/^display name/i)).toHaveValue('')
    await expect(page.getByLabel(/^component key/i)).toHaveValue('')
    await expect(page.getByPlaceholder('AD userkey')).toHaveValue('owner-oscar')
    await page.getByLabel(/^component key/i).fill('svc-copy-clone')
    await page.getByLabel(/^display name/i).fill('Copy Clone Name')

    // VCS step (GRADLE requires VCS). Tag/branch are reusable format patterns:
    // branch prefills from the source BASE VCS entry ('main'), tag (absent on
    // the source entry) from component-defaults. The VCS Path is unique + empty.
    await page.getByRole('button', { name: /VCS/ }).click()
    await expect(page.getByLabel(/^tag/i)).toHaveValue('$module-$version')
    await expect(page.getByLabel(/^production branch/i)).toHaveValue('main')
    await page.getByLabel(/^vcs path/i).fill('ssh://git@host/proj/clone-repo.git')

    // Jira step.
    await page.getByRole('button', { name: /Jira/ }).click()
    await page.getByLabel(/^jira project key/i).fill('CLONE')

    // Review & create step — Jira task key is required.
    await page.getByRole('button', { name: /Review/ }).click()
    await page.getByLabel(/^jira task key/i).fill('ABC-123')
    await page.getByRole('button', { name: 'Create component' }).click()

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
      systems: ['SYS1'],
      solution: false,
      copyright: 'ACME',
      releasesInDefaultBranch: true,
      distributionExplicit: true,
      distributionExternal: false,
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
    // Hotfix format is never carried on create (P-4/Q8): hotfixes are always
    // disabled at creation (no hotfix branch yet), so the create form has no
    // Hotfix Version Format control and never sends it — even from a source
    // component that defines one.
    expect('jiraHotfixVersionFormat' in body, 'jiraHotfixVersionFormat must not be copied on create').toBe(false)
    expect('group' in body, 'group is migration-owned').toBe(false)
  })

  test('list-row Clone: the wizard fetches the source detail itself and prefills', async ({ page }) => {
    await setupRoutes(page)
    await page.goto('/components')

    // The list-row action's aria-label is "Clone <key> into a new component".
    await page.getByRole('button', { name: 'Clone svc-copy-source into a new component' }).click()
    await page.waitForURL('**/components/new?from=*')
    await expect(page.getByRole('heading', { name: 'Clone svc-copy-source' })).toBeVisible()
    // Owner prefill proves the wizard loaded the FULL detail from a summary-only
    // row. (displayName is intentionally NOT prefilled — it is unique.)
    await expect(page.getByLabel(/^display name/i)).toHaveValue('')
    await expect(page.getByPlaceholder('AD userkey')).toHaveValue('owner-oscar')

    await page.getByRole('button', { name: 'Cancel' }).first().click()
    await page.waitForURL('**/components')
  })

  test('explicit+external source: gated coordinate, user fills it, POST carries it', async ({
    page,
  }) => {
    const state = await setupRoutes(page, {
      distributionExplicit: true,
      distributionExternal: true,
      releaseManager: ['rm-alice'],
      securityChampion: ['sc-carol'],
    })
    await page.goto(`/components/${SOURCE_ID}`)
    await page.getByRole('button', { name: 'Clone', exact: true }).click()
    await page.waitForURL('**/components/new?from=*')

    // General — RM/SC prefilled from the source (required for explicit+external).
    await expect(page.getByText('rm-alice')).toBeVisible()
    await expect(page.getByText('sc-carol')).toBeVisible()
    await page.getByLabel(/^component key/i).fill('svc-copy-clone')
    await page.getByLabel(/^display name/i).fill('Copy Clone Name')

    // VCS step.
    await page.getByRole('button', { name: /VCS/ }).click()
    await page.getByLabel(/^vcs path/i).fill('ssh://git@host/proj/clone-repo.git')

    // Jira step.
    await page.getByRole('button', { name: /Jira/ }).click()
    await page.getByLabel(/^jira project key/i).fill('CLONE')

    // Distribution step — Maven coordinate (gated on explicit+external).
    await page.getByRole('button', { name: /Distribution/ }).click()
    await page.getByLabel('Group ID').fill('org.acme')
    await page.getByLabel('Artifact ID').fill('svc')

    // Review & create.
    await page.getByRole('button', { name: /Review/ }).click()
    await page.getByLabel(/^jira task key/i).fill('ABC-123')
    await page.getByRole('button', { name: 'Create component' }).click()

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
  test('profile gate → explicit external → fill RM/SC + docker coordinate, POST carries them', async ({
    page,
  }) => {
    const state = await setupRoutes(page)
    await page.goto('/components')

    // Exact match: the per-row Clone action's aria-label ("Clone <key> into a
    // new component") also matches /new component/i, so a regex resolves to 2
    // buttons (strict-mode violation). The header create button is exactly "New Component".
    await page.getByRole('button', { name: 'New Component', exact: true }).click()
    await page.waitForURL('**/components/new')
    await expect(page.getByRole('heading', { name: 'Create component' })).toBeVisible()

    // Profile gate: Regular external + "Has explicit distribution? Yes" ⇒
    // external+explicit (gated).
    await page.getByRole('radio', { name: 'Regular external component' }).click()
    await page.getByRole('radio', { name: 'Yes', exact: true }).click()
    await page.getByRole('button', { name: /^next$/i }).click()

    // General — key, display name, owner + RM/SC (required for explicit+external).
    await page.getByLabel(/^component key/i).fill('scratch-svc')
    await page.getByLabel(/^display name/i).fill('Scratch Svc')
    const ownerInput = page.getByPlaceholder('AD userkey')
    await ownerInput.fill('owner-oscar')
    await page.getByRole('button', { name: /owner-oscar/i }).click()
    await expect(page.getByText('Validating person...')).toHaveCount(0)

    // RM / SC via the add-row autocomplete (both live in Ownership now).
    const listRows = page.getByTestId('people-list-rows')
    const peopleInputs = page.getByPlaceholder('Add person')
    await peopleInputs.nth(0).fill('rm-bob')
    await peopleInputs.nth(0).blur()
    await expect(listRows.getByText('rm-bob', { exact: true })).toBeVisible()
    await peopleInputs.nth(1).fill('sc-bob')
    await peopleInputs.nth(1).blur()
    await expect(listRows.getByText('sc-bob', { exact: true })).toBeVisible()

    // Build — MAVEN.
    await page.getByRole('button', { name: /Build/ }).click()
    await page.getByLabel(/^build system/i).selectOption('MAVEN')

    // VCS — MAVEN requires it; tag/branch prefilled, URL typed.
    await page.getByRole('button', { name: /VCS/ }).click()
    await expect(page.getByLabel(/^tag/i)).toHaveValue('$module-$version')
    await expect(page.getByLabel(/^production branch/i)).toHaveValue('master')
    await page.getByLabel(/^vcs path/i).fill('ssh://git@host/proj/scratch-repo.git')

    // Jira.
    await page.getByRole('button', { name: /Jira/ }).click()
    await page.getByLabel(/^jira project key/i).fill('SCR')

    // Distribution — Docker coordinate.
    await page.getByRole('button', { name: /Distribution/ }).click()
    await page.getByLabel(/^distribution coordinate/i).selectOption('docker')
    await page.getByLabel('Image name').fill('acme/scratch')

    // Escrow — pick a Generation (the only escrow field on the wizard). It sits
    // between Distribution and Review.
    await page.getByRole('button', { name: 'Escrow', exact: true }).click()
    await page.getByLabel(/^generation/i).selectOption('MANUAL')

    // Review & create.
    await page.getByRole('button', { name: /Review/ }).click()
    await page.getByLabel(/^jira task key/i).fill('ABC-123')
    await page.getByRole('button', { name: 'Create component' }).click()
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
        // The chosen escrow Generation flows through (form-supplied).
        escrow: { generation: 'MANUAL' },
        vcsEntries: [
          { vcsPath: 'ssh://git@host/proj/scratch-repo.git', tag: '$module-$version', branch: 'master' },
        ],
      },
    })
  })
})
