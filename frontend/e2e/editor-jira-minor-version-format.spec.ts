import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Jira "Minor Version Format" round-trip — real-CRS journey (NOT route-mocked),
// chromium-admin (picked up by the existing `editor-[^/]+` testMatch).
//
// This is the ONE test that actually exercises the Portal ↔ live-CRS contract
// for the majorVersionFormat → minorVersionFormat rename. The route-mocked
// editor-copy-component spec only proves the Portal's own POST-body shape
// against its own mock; it cannot catch a real wire mismatch. Here the Portal
// seeds, edits, saves (via the ONE combined PATCH) and re-reads the base jira
// minor version format from a real CRS.
//
// RED/GREEN ON PURPOSE — this is a cross-repo contract gate, NOT a feature-gated
// skip. Unlike editor-field-overrides / editor-attribute-matrix (which self-skip
// on older images to stay green), this spec asserts the round-trip
// UNCONDITIONALLY so it DETECTS the incompatibility:
//   • RED  against a CRS image predating the rename (e.g. the currently pinned
//          crs.version): the server ignores the unknown `minorVersionFormat`
//          field, the value never round-trips, and the setup assertion fails
//          loudly — that failure IS the signal that CRS must ship the rename.
//   • GREEN once crs.version is bumped to a CRS build carrying the rename.
// So this spec must be introduced together with (or just before) the CRS image
// bump; a red run here means "deploy the renamed CRS first", not a flaky test.
//
// Serial: the UI test reuses the component created in setup.
// ---------------------------------------------------------------------------

const SUFFIX = Date.now().toString(36)
const COMPONENT = `e2e-mvf-${SUFFIX}`
// Free-form templates (CRS does not validate the format string). SEEDED proves
// the read path; EDITED (unique per run) proves the write round-trip.
const SEEDED = '$major.$minor'
const EDITED = `$major.$minor.${SUFFIX}`
// P-2a: Minor Version Format now MIRRORS Line by default (read-only), and the
// LEADING "Line Version Format" field materializes its value into BOTH line and
// minor on save (Q9 UI-materialization). The component is created with only
// jira.minorVersionFormat set (no line) → on load the leading Line field shows
// the stored minor value, and editing it round-trips minorVersionFormat. Target
// the Line field by its stable data-field-input attribute (labels/placeholders
// are field-config-relabelable).
const LINE_FIELD = '[data-field-input="jira.lineVersionFormat"]'

// The BFF double-submits CSRF: state-changing /rest calls must echo the
// XSRF-TOKEN cookie in X-XSRF-TOKEN. The cookie is set on the first response,
// so issue one GET before reading it.
async function mutationHeaders(page: Page): Promise<Record<string, string>> {
  await page.request.get('/rest/api/4/components?page=0&size=1')
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value
  return {
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
  }
}

// The single save flow: sticky SaveBar "Save changes" → "Review changes" dialog
// "Confirm" → ONE combined PATCH.
async function saveViaReviewBar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save changes' }).click()
  const dialog = page.getByRole('dialog', { name: /review changes/i })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
}

test.describe.serial('Jira minor version format rides the combined Save (admin, real CRS)', () => {
  let id: string | undefined

  test('setup: create a component and assert jira.minorVersionFormat round-trips through CRS', async ({ page }) => {
    const api = page.request
    const headers = await mutationHeaders(page)

    const create = await api.post('/rest/api/4/components', {
      headers,
      data: {
        name: COMPONENT,
        componentOwner: 'e2e-admin',
        baseConfiguration: { build: { buildSystem: 'MAVEN' }, jira: { minorVersionFormat: SEEDED } },
      },
    })
    expect(create.ok(), `cannot create ${COMPONENT} (HTTP ${create.status()})`).toBeTruthy()
    id = ((await create.json()) as { id: string }).id

    // Contract gate (red/green): the seeded value MUST come back on the BASE
    // row's jira aspect. A CRS image predating the rename drops the unknown
    // `minorVersionFormat` on create → this assertion fails, which is the
    // intended signal that the renamed CRS is not yet deployed.
    const detail = (await (await api.get(`/rest/api/4/components/${id}`)).json()) as {
      configurations?: Array<{ rowType: string; jira?: { minorVersionFormat?: string | null } }>
    }
    const base = detail.configurations?.find((c) => c.rowType === 'BASE')
    expect(
      base?.jira?.minorVersionFormat,
      'CRS did not round-trip jira.minorVersionFormat — the CRS image predates the ' +
        'majorVersionFormat→minorVersionFormat rename; bump crs.version to a build that carries it',
    ).toBe(SEEDED)
  })

  test('edit Minor Version Format on the Jira tab → combined Save → it persists', async ({ page }) => {
    expect(id, 'setup did not create the component').toBeTruthy()

    await page.goto(`/components/${id}`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /jira/i }).click()

    // Read path: the seeded minor value round-tripped from CRS and surfaces as
    // the leading Line value (Minor mirrors Line when both are equal / line null).
    const line = page.locator(LINE_FIELD)
    await expect(line).toHaveValue(SEEDED)

    // Write path: edit the leading Line; on save it materializes into BOTH line
    // and minor. Save through the ONE bar+dialog, confirm the toast.
    await line.fill(EDITED)
    await expect(page.getByText('Unsaved changes')).toBeVisible()
    await saveViaReviewBar(page)
    await expect(page.getByText('Component saved').first()).toBeVisible({ timeout: 10_000 })

    // Persisted through real CRS: reload → the Jira tab shows the edited value
    // (line == minor → still mirrored, leading shows EDITED).
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /jira/i }).click()
    await expect(page.locator(LINE_FIELD)).toHaveValue(EDITED)
  })

  test.afterAll(async ({ playwright }) => {
    if (!id) return
    const use = test.info().project.use
    const ctx = await playwright.request.newContext({
      baseURL: use.baseURL,
      storageState: use.storageState as string | undefined,
    })
    try {
      await ctx.get('/rest/api/4/components?page=0&size=1')
      const token = (await ctx.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')?.value
      const headers = {
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
      }
      const del = await ctx.delete(`/rest/api/4/components/${id}`, { headers })
      expect(del.ok(), `cleanup delete failed (HTTP ${del.status()}) for ${id}`).toBeTruthy()
    } finally {
      await ctx.dispose()
    }
  })
})
