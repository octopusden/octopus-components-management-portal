import { test, expect } from '@playwright/test'

// Real-CRS journey (NOT route-mocked, unlike the other editor-* specs): edit a
// build-section field through the UI and verify the change lands in the History
// tab. Guards the CRS SYS-053 fix — section-only saves (Build/VCS/Jira/…)
// previously produced identical audit snapshots, were dropped by the SYS-048
// no-op guard, and History stayed empty while the value persisted.
//
// Feature gate (same spirit as component-as-code.spec.ts, but narrower): the
// spec creates its own component via the v4 API, then probes the section-field
// audit behaviour API-side first — against a CRS image that predates SYS-053
// the probe finds no UPDATE row and the spec skips instead of failing. Plain
// HTTP failures of create/PATCH/audit are NOT skip conditions: those endpoints
// exist on every CRS image the portal targets (the SPA itself uses them), so
// a non-2xx there means a real stand problem (auth/CSRF/outage) and must fail.
test.describe('Components Management Portal – Build tab edit lands in History (admin)', () => {
  // The BFF double-submits CSRF (CookieServerCsrfTokenRepository.withHttpOnlyFalse):
  // state-changing /rest calls must echo the XSRF-TOKEN cookie in X-XSRF-TOKEN,
  // exactly like the SPA's api client does. The cookie is set on the first
  // response (csrfCookieWebFilter), so issue one GET before reading it.
  async function mutationHeaders(page: import('@playwright/test').Page): Promise<Record<string, string>> {
    await page.request.get('/rest/api/4/components?page=0&size=1')
    const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value
    return {
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
    }
  }

  // Best-effort hygiene for long-lived stands (`npm run test:e2e` against a
  // dev stand would otherwise accumulate e2e-audit-* components; the gradle
  // testcontainers stack is ephemeral anyway): archive the spec's component.
  let cleanup: { id: string; headers: Record<string, string> } | undefined
  test.afterEach(async ({ page }) => {
    if (!cleanup) return
    const del = await page.request.delete(`/rest/api/4/components/${cleanup.id}`, { headers: cleanup.headers })
    expect(del.ok(), `cleanup delete failed (HTTP ${del.status()}) for ${cleanup.id}`).toBeTruthy()
    cleanup = undefined
  })

  test('changing Maven Version via Save Build writes a History entry with build.mavenVersion', async ({ page }) => {
    const api = page.request
    const headers = await mutationHeaders(page)

    // Create a dedicated MAVEN component so the Maven Version select renders
    // and the audit log contains only this spec's entries.
    const name = `e2e-audit-${Date.now().toString(36)}`
    const create = await api.post('/rest/api/4/components', {
      headers,
      data: {
        name,
        componentOwner: 'e2e-admin',
        group: { groupKey: 'org.example.e2e', isFake: false },
        baseConfiguration: { build: { buildSystem: 'MAVEN' } },
      },
    })
    expect(create.ok(), `cannot create component via v4 API (HTTP ${create.status()})`).toBeTruthy()
    const created = await create.json()
    const id = created.id as string
    cleanup = { id, headers }

    // SYS-053 feature gate: a section-only PATCH must write an UPDATE audit
    // row. Old CRS images silently drop it (the original bug) — skip there.
    const probe = await api.patch(`/rest/api/4/components/${id}`, {
      headers,
      data: { version: created.version, baseConfiguration: { build: { mavenVersion: '3.8' } } },
    })
    expect(probe.ok(), `component PATCH failed (HTTP ${probe.status()})`).toBeTruthy()
    const audit = await api.get(`/rest/api/4/audit/Component/${id}?page=0&size=50`)
    expect(audit.ok(), `audit endpoint not available (HTTP ${audit.status()})`).toBeTruthy()
    const probeRows = ((await audit.json()).content ?? []) as Array<{ action: string }>
    test.skip(
      !probeRows.some((r) => r.action === 'UPDATE'),
      'CRS predates SYS-053 (section-field audit) — skipping UI journey',
    )

    // UI journey: open the Build tab and pick a different Maven version.
    await page.goto(`/components/${id}`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /build/i }).click()

    const mavenTrigger = page.locator('#build-mavenVersion')
    await expect(mavenTrigger).toBeVisible()
    await mavenTrigger.click()
    const optionTexts = await page.getByRole('option').allTextContents()
    const target = optionTexts.find((t) => t !== 'None' && t !== '3.8')
    test.skip(target === undefined, 'no alternative Maven version configured in /meta/maven-versions')
    await page.getByRole('option', { name: target!, exact: true }).click()

    await page.getByRole('button', { name: 'Save Build' }).click()
    // .first(): the toast text renders twice (toast body + the toaster's
    // aria-live status region) — strict mode would reject the bare locator.
    await expect(page.getByText('Build configuration saved').first()).toBeVisible({ timeout: 10_000 })

    // History tab: the API probe + the UI save = two UPDATE entries, each
    // carrying the field-level diff key in the "Changed Fields" column.
    await page.getByRole('tab', { name: /history/i }).click()
    await expect(page.getByText('UPDATE', { exact: true })).toHaveCount(2, { timeout: 10_000 })
    await expect(page.getByText('build.mavenVersion').first()).toBeVisible()

    // Expand the newest entry (the UI save — entity history is "newest
    // first" per the CRS default sort) and check the rendered diff carries
    // the value picked in the UI, scoped to the expanded panel so a stray
    // match elsewhere on the page can't satisfy the assertion.
    await page
      .getByRole('row')
      .filter({ hasText: 'UPDATE' })
      .filter({ hasText: 'build.mavenVersion' })
      .first()
      .click()
    const expandedPanel = page.locator('td[colspan="7"]')
    await expect(expandedPanel.getByText(target!, { exact: true }).first()).toBeVisible()
  })
})
