import { test, expect, type Page } from '@playwright/test'
import {
  mockComponentList,
  mockFieldConfig,
  mockOwners,
  mockLabels,
} from './visual/_helpers'

// ---------------------------------------------------------------------------
// SYS-039 multi-value Release Managers / Security Champions — editor e2e.
//
// Runs under chromium-admin (route-mocked + admin storageState), the same
// shape as the visual/* and admin-migration specs. ALL CRS data calls are
// intercepted by page.route, so this spec is self-contained and does NOT
// depend on the multi-value CRS image being published — it exercises the real
// built SPA + portal BFF with mocked component data.
//
// The detail route is STATEFUL: a PATCH applies REPLACE semantics to the two
// ordered lists and a subsequent GET (after page.reload()) returns the updated
// component — so the "save → reload → order persists" assertion is meaningful
// against the SPA's real save/refetch wiring (useUpdateComponent.onSuccess +
// useComponent), with persistence simulated by the mock.
//
// Integration note: a true containerized persistence variant (real Postgres +
// CRS feature build, asserting the order survives a real DB round-trip) is the
// `./gradlew e2eTest` harness's job and needs the multi-value CRS image. This
// route-mocked spec is the portal-side contract guard runnable without it.
// ---------------------------------------------------------------------------

const COMPONENT_ID = '11111111-1111-1111-1111-111111111111'
const DETAIL_RE = /\/rest\/api\/4\/components\/[^/?]+(?:\?.*)?$/
const FIELD_OVERRIDES = '**/rest/api/4/components/*/field-overrides'

interface MutableDetail {
  [key: string]: unknown
  releaseManager: string[]
  securityChampion: string[]
  version: number
}

function makeDetail(overrides: Partial<MutableDetail> = {}): MutableDetail {
  return {
    id: COMPONENT_ID,
    name: 'svc-multilist',
    displayName: 'Service Multilist',
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
    copyright: null,
    releasesInDefaultBranch: false,
    labels: [],
    group: null,
    docs: [],
    artifactIds: [],
    securityGroups: [],
    teamcityProjects: [],
    configurations: [],
    ...overrides,
  }
}

function summaryFor(detail: MutableDetail) {
  return {
    content: [
      {
        id: detail.id,
        name: detail.name,
        displayName: detail.displayName,
        componentOwner: detail.componentOwner,
        system: detail.system,
        productType: detail.productType,
        archived: detail.archived,
        updatedAt: detail.updatedAt,
        labels: [],
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

/**
 * Registers the stateful component routes. Returns a handle exposing the
 * captured PATCH bodies and the current server-side detail (post-PATCH).
 */
async function setupRoutes(page: Page, initial: MutableDetail) {
  const state: { detail: MutableDetail; patches: Array<Record<string, unknown>> } = {
    detail: JSON.parse(JSON.stringify(initial)) as MutableDetail,
    patches: [],
  }

  await mockComponentList(page, summaryFor(state.detail))
  // {} field-config → every useFieldConfigEntry falls back to 'editable', so
  // RM / SC / componentOwner all render editable and visible.
  await mockFieldConfig(page, {})
  await mockOwners(page, ['rm-alice', 'rm-bob', 'rm-carol', 'sc-carol', 'sc-dave', 'owner-oscar'])
  await mockLabels(page, [])
  // FieldOverrides fires on mount (enabled: !!componentId) regardless of the
  // active tab — stub it so the spec stays self-contained.
  await page.route(FIELD_OVERRIDES, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  await page.route(DETAIL_RE, async (route) => {
    const req = route.request()
    const method = req.method()
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.detail),
      })
    }
    if (method === 'PATCH') {
      const body = (req.postDataJSON() ?? {}) as Record<string, unknown>
      state.patches.push(body)
      const next: MutableDetail = { ...state.detail, version: state.detail.version + 1 }
      // PATCH = REPLACE the whole ordered list when the field is present.
      if (Array.isArray(body.releaseManager)) next.releaseManager = body.releaseManager as string[]
      if (Array.isArray(body.securityChampion)) {
        next.securityChampion = body.securityChampion as string[]
      }
      state.detail = next
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.detail),
      })
    }
    return route.fallback()
  })

  return state
}

/** Field wrapper div for a labelled people editor (label's parent). */
function peopleField(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('..')
}

/** Ordered person-name spans rendered inside a PeopleListInput field. */
function rowNames(page: Page, label: string) {
  return peopleField(page, label).locator('[data-testid^="person-row-"] > span')
}

/** Add a person to a labelled people editor via the add-row autocomplete. */
async function addPerson(page: Page, label: string, person: string) {
  const input = peopleField(page, label).getByRole('textbox')
  await input.fill(person)
  // PeopleInput commits the typed value via its onBlur → onChange; the
  // PeopleListInput then trims + dedupes + appends and remounts the add-row.
  await input.blur()
}

test.describe('Editor — multi-value Release Managers / Security Champions (SYS-039)', () => {
  test('plural labels are shown and componentOwner stays a single input (not a list)', async ({
    page,
  }) => {
    await setupRoutes(page, makeDetail())
    await page.goto(`/components/${COMPONENT_ID}`)

    await expect(page.getByTestId('section-ownership')).toBeVisible()
    // Plural labels (field keys/JSON stay singular; only the human labels changed).
    await expect(page.getByText('Release Managers', { exact: true })).toBeVisible()
    await expect(page.getByText('Security Champions', { exact: true })).toBeVisible()

    // componentOwner is a single PeopleInput: one textbox, NO list rows, NO
    // move/remove controls.
    const ownerField = peopleField(page, 'Component Owner')
    await expect(ownerField.getByRole('textbox')).toHaveCount(1)
    await expect(ownerField.getByTestId('people-list-rows')).toHaveCount(0)
    // Single-value input → no reorderable list rows, hence no drag grips.
    await expect(ownerField.getByRole('button', { name: /to reorder$/i })).toHaveCount(0)

    // RM/SC hydrate as ordered rows from the arrays.
    await expect(rowNames(page, 'Release Managers')).toHaveText(['rm-alice'])
    await expect(rowNames(page, 'Security Champions')).toHaveText(['sc-carol'])
  })

  test('add → reorder → remove → save sends the reordered array; reload persists the order', async ({
    page,
  }) => {
    const state = await setupRoutes(page, makeDetail())
    await page.goto(`/components/${COMPONENT_ID}`)

    // Seeded with [rm-alice]; add two more → [rm-alice, rm-bob, rm-carol].
    await addPerson(page, 'Release Managers', 'rm-bob')
    await expect(rowNames(page, 'Release Managers')).toHaveText(['rm-alice', 'rm-bob'])
    await addPerson(page, 'Release Managers', 'rm-carol')
    await expect(rowNames(page, 'Release Managers')).toHaveText(['rm-alice', 'rm-bob', 'rm-carol'])

    // Reorder rm-carol up one slot via a real pointer drag on its grip.
    // dnd-kit's PointerSensor has a 4px activation distance and tracks the
    // sortable via pointermove, so a reliable drag is: press on the grip, a small
    // move to pass the threshold, then a multi-step move onto the target row
    // (rm-bob, currently index 1) before releasing → [rm-alice, rm-carol, rm-bob].
    const carolGrip = peopleField(page, 'Release Managers').getByRole('button', {
      name: 'Drag rm-carol to reorder',
    })
    const bobRow = peopleField(page, 'Release Managers').getByTestId('person-row-1')
    const grip = await carolGrip.boundingBox()
    const target = await bobRow.boundingBox()
    if (!grip || !target) throw new Error('reorder: missing bounding box for grip/target')
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    // Exceed the 4px PointerSensor activation distance.
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 - 8, { steps: 5 })
    // Drag up onto rm-bob's row (many steps so dnd-kit tracks the collision),
    // landing slightly above its centre so rm-carol inserts before rm-bob.
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 })
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2 - 6, { steps: 5 })
    await page.mouse.up()
    // dnd-kit swallows the first `click` after a drag via a capture-phase document
    // listener it only removes ~50ms later (PointerSensor.detach → setTimeout(…, 50)).
    // Wait it out so the following Remove / Save clicks actually fire.
    await page.waitForTimeout(100)
    await expect(rowNames(page, 'Release Managers')).toHaveText(['rm-alice', 'rm-carol', 'rm-bob'])

    // Remove rm-alice → [rm-carol, rm-bob].
    await page.getByRole('button', { name: 'Remove rm-alice' }).click()
    await expect(rowNames(page, 'Release Managers')).toHaveText(['rm-carol', 'rm-bob'])

    // Save.
    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByText(/component saved/i).first()).toBeVisible({ timeout: 10_000 })

    // PATCH body carried the reordered, canonicalized array (REPLACE).
    await expect.poll(() => state.patches.length).toBeGreaterThan(0)
    const lastPatch = state.patches[state.patches.length - 1]!
    expect(lastPatch.releaseManager).toEqual(['rm-carol', 'rm-bob'])

    // Reload → GET returns the persisted (mock) state → order survives.
    await page.reload()
    await expect(rowNames(page, 'Release Managers')).toHaveText(['rm-carol', 'rm-bob'])
  })

  test('dedupe: adding a person already present is a no-op', async ({ page }) => {
    await setupRoutes(page, makeDetail({ releaseManager: ['rm-alice', 'rm-bob'] }))
    await page.goto(`/components/${COMPONENT_ID}`)

    await expect(rowNames(page, 'Release Managers')).toHaveText(['rm-alice', 'rm-bob'])
    // Try to add an already-present person → keep-first dedupe → unchanged.
    await addPerson(page, 'Release Managers', 'rm-alice')
    await expect(rowNames(page, 'Release Managers')).toHaveText(['rm-alice', 'rm-bob'])
  })

  test('security champions: add + save sends the ordered securityChampion array', async ({
    page,
  }) => {
    const state = await setupRoutes(page, makeDetail({ securityChampion: ['sc-carol'] }))
    await page.goto(`/components/${COMPONENT_ID}`)

    await addPerson(page, 'Security Champions', 'sc-dave')
    await expect(rowNames(page, 'Security Champions')).toHaveText(['sc-carol', 'sc-dave'])

    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByText(/component saved/i).first()).toBeVisible({ timeout: 10_000 })

    await expect.poll(() => state.patches.length).toBeGreaterThan(0)
    const lastPatch = state.patches[state.patches.length - 1]!
    expect(lastPatch.securityChampion).toEqual(['sc-carol', 'sc-dave'])

    await page.reload()
    await expect(rowNames(page, 'Security Champions')).toHaveText(['sc-carol', 'sc-dave'])
  })
})
