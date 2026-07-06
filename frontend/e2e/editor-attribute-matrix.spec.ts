import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Editor attribute matrix — real-CRS journey (NOT route-mocked), chromium-admin
// (picked up by the existing `editor-[^/]+` testMatch in playwright.config.ts).
//
// Closes the "real-CRS edit e2e covering all main attributes" backlog item:
// every tab's primary save path must land WITHOUT a false optimistic-conflict
// toast. Guards the conflict-classification fix (CRS #358 errorCode dispatch in
// useOptimisticConflict): before it, ANY 409 — including a uniqueness clash —
// was reported as "updated by another user … reload", which sent QA into a
// futile reload loop on a plain single-user save (the QA incident reproduced
// by the Build-tab Java Version test below).
//
// Matrix coverage — ONE robust field per tab, all six main-attribute tabs.
// The per-tab Save buttons + per-tab success toasts are GONE: the editor now
// has ONE sticky SaveBar ("Save changes") → a "Review changes" dialog
// ("Confirm") → a SINGLE combined PATCH → ONE 'Component saved' toast. Every
// matrix row therefore edits its field on its tab, then saves through that one
// bar+dialog flow (see saveViaReviewBar). Tabs covered:
//   General → Display Name, Build → Build File Path, VCS → Entry branch,
//   Jira → Project Key, Distribution → Docker image, Escrow → Disk Space.
// No tab is omitted. VCS is exercised by ADDING an entry via the UI (the v4
// create API does not seed baseConfiguration.vcsEntries) and setting its branch,
// driving the same VCS PATCH plumbing. Escrow edits the Disk Space scalar.
//
// Negative case: component B flips its maven artifact extension to EXACTLY
// duplicate component A's GAV → CRS 409 UNIQUENESS_VIOLATION → the toast must
// be 'Uniqueness violation' with the SERVER's message, and must NOT be the
// optimistic-lock "updated by another user" advice.
//
// Feature gates (same spirit as editor-build-history.spec.ts): only the
// uniqueness-specific steps self-skip against an older CRS image — once if the
// image's GAV identity ignores the extension (B's `g:a:apk` create collides
// with A's `g:a:zip` and 409s), and once if its 409 body predates #358 (no
// errorCode). Plain HTTP failures of create/GET/PATCH/delete are NOT skip
// conditions: those endpoints exist on every CRS image the portal targets, so
// a non-2xx there means a real stand problem (auth/CSRF/outage) and must fail.
//
// Serial on purpose (matches the suite's workers:1): later tests reuse the
// components created in the setup test; a setup failure aborts the chain.
// ---------------------------------------------------------------------------

const SUFFIX = Date.now().toString(36)
const COMPONENT_A = `e2e-attr-a-${SUFFIX}`
const COMPONENT_B = `e2e-attr-b-${SUFFIX}`
// Must start with one of the stand's supported group prefixes
// (COMPONENTS_REGISTRY_SUPPORTEDGROUPIDS=org.octopusden.octopus,… in
// E2ETestcontainersDriver) or the create 400s on groupId-prefix validation.
const GAV_GROUP = 'org.octopusden.octopus.test'
// Unique per run — the artifactPattern is compared as a regex/CSV pattern by
// the CRS GAV-collision rule, so keep it metacharacter-free.
const GAV_ARTIFACT = `e2e-gav-${SUFFIX}`

// The BFF double-submits CSRF (CookieServerCsrfTokenRepository.withHttpOnlyFalse):
// state-changing /rest calls must echo the XSRF-TOKEN cookie in X-XSRF-TOKEN,
// exactly like the SPA's api client does. The cookie is set on the first
// response (csrfCookieWebFilter), so issue one GET before reading it.
async function mutationHeaders(page: Page): Promise<Record<string, string>> {
  await page.request.get('/rest/api/4/components?page=0&size=1')
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value
  return {
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
  }
}

async function openTab(page: Page, componentId: string, tab: RegExp): Promise<void> {
  await page.goto(`/components/${componentId}`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: tab }).click()
}

// The single save flow that replaced the per-tab Save buttons: click the
// sticky SaveBar "Save changes", then the "Review changes" dialog's "Confirm".
// One combined PATCH fires; the caller asserts the outcome toast.
async function saveViaReviewBar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save changes' }).click()
  const dialog = page.getByRole('dialog', { name: /review changes/i })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
}

// The two texts the optimistic-lock path renders (lib/conflict.ts): the toast
// title 'Save conflict' and the "updated by another user … reload" advice.
// Neither may appear after a clean save (the QA incident) nor after a
// uniqueness 409 (reload cannot fix a value clash). Callers invoke this ONLY
// after awaiting the outcome toast of the same mutation (success or
// 'Uniqueness violation'), so the mutation has settled and its toasts are
// final — the success and conflict toasts are mutually exclusive branches of
// one promise, no late-render window remains.
async function expectNoOptimisticConflictToast(page: Page): Promise<void> {
  await expect(page.getByText(/updated by another user/i)).not.toBeVisible()
  await expect(page.getByText('Save conflict')).not.toBeVisible()
}

test.describe.serial('Editor attribute matrix — every tab saves without a false conflict (admin)', () => {
  let idA: string | undefined
  let idB: string | undefined
  const createdIds: string[] = []

  test('setup: create components A and B via the v4 API (shared GAV group:artifact, different extension)', async ({ page }) => {
    const api = page.request
    const headers = await mutationHeaders(page)

    const createBody = (name: string, extension: string) => ({
      name,
      componentOwner: 'e2e-admin',
      baseConfiguration: {
        // MAVEN so the Build tab renders its full toolchain block.
        build: { buildSystem: 'MAVEN' },
        // No VCS entry is seeded here: the v4 create API does not persist
        // baseConfiguration.vcsEntries, so the VCS matrix row adds one via the UI.
        mavenArtifacts: [{ groupPattern: GAV_GROUP, artifactPattern: GAV_ARTIFACT, extension }],
      },
    })

    const createA = await api.post('/rest/api/4/components', {
      headers,
      data: createBody(COMPONENT_A, 'zip'),
    })
    expect(createA.ok(), `cannot create ${COMPONENT_A} via v4 API (HTTP ${createA.status()})`).toBeTruthy()
    idA = ((await createA.json()) as { id: string }).id
    createdIds.push(idA)

    const createB = await api.post('/rest/api/4/components', {
      headers,
      data: createBody(COMPONENT_B, 'apk'),
    })
    // Feature gate: GAV identity is the FULL coordinate (g:a:zip ≠ g:a:apk,
    // MavenGavCollision). An older CRS image that collides on group:artifact
    // alone rejects B here — skip the B-dependent tests instead of failing.
    // (Component A is created, so the regression + matrix tests still run.)
    test.skip(
      createB.status() === 409,
      'CRS GAV identity predates full-coordinate (extension) matching — skipping component B setup',
    )
    expect(createB.ok(), `cannot create ${COMPONENT_B} via v4 API (HTTP ${createB.status()})`).toBeTruthy()
    idB = ((await createB.json()) as { id: string }).id
    createdIds.push(idB)
  })

  test('regression (QA incident): Build tab Java Version save succeeds with no "updated by another user" toast', async ({ page }) => {
    test.skip(!idA, 'setup did not create component A')
    await openTab(page, idA!, /build/i)

    // Java Version is an EnumSelect sourced from /meta/java-versions
    // (configured in CRS application.yml). Pick the first real option — the
    // component was created without a javaVersion, so anything but 'None' is
    // a change. An empty list is a stand misconfiguration, not a skip.
    const javaTrigger = page.locator('#build-javaVersion')
    await expect(javaTrigger).toBeVisible()
    await javaTrigger.click()
    const optionTexts = await page.getByRole('option').allTextContents()
    const target = optionTexts.find((t) => t !== 'None')
    expect(target, 'CRS /meta/java-versions returned no selectable Java versions').toBeTruthy()
    await page.getByRole('option', { name: target!, exact: true }).click()

    await saveViaReviewBar(page)
    // .first(): the toast text renders twice (toast body + the toaster's
    // aria-live status region) — strict mode would reject the bare locator.
    // ONE combined-save toast now, not the old per-tab 'Build configuration saved'.
    await expect(page.getByText('Component saved').first()).toBeVisible({ timeout: 10_000 })
    // The incident: a single-user save was answered with the optimistic-lock
    // "updated by another user, reload" toast. Assert it stays gone.
    await expectNoOptimisticConflictToast(page)

    // Persisted, not just toasted.
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /build/i }).click()
    await expect(page.locator('#build-javaVersion')).toContainText(target!)
  })

  // One main attribute per tab: edit → save via the SaveBar + Review dialog →
  // ONE 'Component saved' toast (and no conflict toast) → reload → the value
  // survived the round-trip. Locators lean on stable placeholders/ids from the
  // tab components (BuildTab/VcsTab/…). The save step is identical across rows
  // now (saveViaReviewBar) — there are no per-tab Save buttons or toasts.
  const matrix: Array<{
    title: string
    tab: RegExp
    edit: (page: Page) => Promise<void>
    assertPersisted: (page: Page) => Promise<void>
  }> = [
    {
      title: 'General — Display Name',
      tab: /general/i,
      // Display name is globally UNIQUE server-side — keep the run suffix in
      // the value so reruns against a long-lived stand don't 409. Field-config
      // can hide the field entirely (GeneralTab renders it conditionally) —
      // skip rather than fail on locator-not-found in that case.
      edit: async (page) => {
        const displayName = page.getByLabel(/^display name/i)
        test.skip((await displayName.count()) === 0, 'displayName is hidden by field-config on this stand')
        await displayName.fill(`E2E Attr A ${SUFFIX}`)
      },
      assertPersisted: async (page) => {
        await expect(page.getByLabel(/^display name/i)).toHaveValue(`E2E Attr A ${SUFFIX}`)
      },
    },
    {
      title: 'Build — Build File Path',
      tab: /build/i,
      edit: async (page) => {
        await page.getByPlaceholder('pom.xml / build.gradle').fill(`e2e/${SUFFIX}/pom.xml`)
      },
      assertPersisted: async (page) => {
        await expect(page.getByPlaceholder('pom.xml / build.gradle')).toHaveValue(`e2e/${SUFFIX}/pom.xml`)
      },
    },
    {
      // P-3: External Registry became a Whiskey-only, admin-only DROPDOWN fed by
      // installation-specific field-config options (no free-text placeholder any
      // more), so it can no longer be exercised on an arbitrary fixture. VCS-tab
      // coverage moves to the always-present per-entry Branch field; dedicated
      // External Registry coverage (Whiskey component + admin user + configured
      // options, plus the Skip-Commit-Check ↔ NOT_AVAILABLE bridge) is deferred
      // to P-5's new real-CRS specs.
      title: 'VCS — Entry branch',
      tab: /vcs/i,
      edit: async (page) => {
        // The v4 create API does not seed a VCS entry, so the tab opens empty
        // ("No VCS entries"). Add one via the UI, then set its branch — this
        // drives the same VCS PATCH plumbing as editing an existing entry.
        // Keep the path local/Bitbucket-style (not ssh://) so the portal's
        // optional ecosystem-host check does not depend on stand links.
        await page.getByRole('button', { name: /add entry/i }).click()
        await page.getByPlaceholder('Entry name').first().fill('main')
        await page.getByPlaceholder('ssh://git@...').first().fill(`E2E/attr-${SUFFIX}`)
        await page.getByPlaceholder('Branch pattern').first().fill(`release/${SUFFIX}`)
      },
      assertPersisted: async (page) => {
        await expect(page.getByPlaceholder('Branch pattern').first()).toHaveValue(`release/${SUFFIX}`)
      },
    },
    {
      title: 'Jira — Project Key',
      tab: /jira/i,
      // (projectKey, versionPrefix) is unique among non-archived components —
      // suffix the key so it can't clash with the fixture's 'E2E' project.
      // Last 6 suffix chars keep the key short (headroom vs key-length limits)
      // while staying unique per run.
      edit: async (page) => {
        await page.getByPlaceholder('JIRA project key').fill(`EA${SUFFIX.slice(-6).toUpperCase()}`)
      },
      assertPersisted: async (page) => {
        await expect(page.getByPlaceholder('JIRA project key')).toHaveValue(`EA${SUFFIX.slice(-6).toUpperCase()}`)
      },
    },
    {
      title: 'Docker — image',
      tab: /docker/i,
      // Image names are globally unique — suffix again. Scope to the section's
      // data-testid (Maven/FileUrl/Packages/SecurityGroups all render their own
      // Add button, and the heading text is field-config-relabelable).
      edit: async (page) => {
        const dockerSection = page.getByTestId('docker-images-section')
        await dockerSection.getByRole('button', { name: 'Add', exact: true }).click()
        await dockerSection.getByPlaceholder('acme/my-service').fill(`e2e/attr-${SUFFIX}`)
      },
      assertPersisted: async (page) => {
        await expect(
          page.getByTestId('docker-images-section').getByPlaceholder('acme/my-service'),
        ).toHaveValue(`e2e/attr-${SUFFIX}`)
      },
    },
    {
      title: 'Escrow — Disk Space',
      tab: /escrow/i,
      edit: async (page) => {
        await page.getByPlaceholder('e.g. 10GB').fill('42GB')
      },
      assertPersisted: async (page) => {
        await expect(page.getByPlaceholder('e.g. 10GB')).toHaveValue('42GB')
      },
    },
  ]

  for (const entry of matrix) {
    test(`matrix: ${entry.title} saves and persists`, async ({ page }) => {
      test.skip(!idA, 'setup did not create component A')
      await openTab(page, idA!, entry.tab)

      await entry.edit(page)
      // ONE combined save for every tab now — the per-tab Save buttons are gone.
      await saveViaReviewBar(page)
      await expect(page.getByText('Component saved').first()).toBeVisible({ timeout: 10_000 })
      await expectNoOptimisticConflictToast(page)

      // Reload → fresh GET → the edit survived the server round-trip.
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('tab', { name: entry.tab }).click()
      await entry.assertPersisted(page)
    })
  }

  test('negative: duplicating component A\'s exact GAV shows "Uniqueness violation", not the reload advice', async ({ page }) => {
    test.skip(!idA || !idB, 'setup did not create both components')
    const api = page.request
    const headers = await mutationHeaders(page)

    // Feature gate, API-side first (mirrors editor-build-history's probe):
    // PATCH B's artifact to A's exact coordinate. On a current CRS this 409s
    // with errorCode UNIQUENESS_VIOLATION and changes nothing. A 409 without
    // errorCode predates CRS #358 — there the portal's old-server fallback
    // (reload-and-reapply) is CORRECT behaviour, so the UI assertion below
    // would fail by design; skip instead.
    const detailResp = await api.get(`/rest/api/4/components/${idB}`)
    expect(detailResp.ok(), `cannot load ${COMPONENT_B} (HTTP ${detailResp.status()})`).toBeTruthy()
    const detail = (await detailResp.json()) as { version: number }
    const duplicateGav = {
      baseConfiguration: {
        mavenArtifacts: [{ groupPattern: GAV_GROUP, artifactPattern: GAV_ARTIFACT, extension: 'zip' }],
      },
    }
    const probe = await api.patch(`/rest/api/4/components/${idB}`, {
      headers,
      data: { version: detail.version, ...duplicateGav },
    })
    if (probe.ok()) {
      // Unexpected: the duplicate was accepted — restore B's own coordinate so
      // cleanup leaves no colliding rows behind, then skip (nothing to assert).
      // NOTE: this probe.json() and the conflictBody one below are on mutually
      // exclusive branches (ok vs 409) — the body is never consumed twice.
      const accepted = (await probe.json()) as { version: number }
      const revert = await api.patch(`/rest/api/4/components/${idB}`, {
        headers,
        data: {
          version: accepted.version,
          baseConfiguration: {
            mavenArtifacts: [{ groupPattern: GAV_GROUP, artifactPattern: GAV_ARTIFACT, extension: 'apk' }],
          },
        },
      })
      expect(revert.ok(), `revert after unexpected duplicate-GAV acceptance failed (HTTP ${revert.status()})`).toBeTruthy()
    }
    test.skip(probe.ok(), 'CRS accepted a duplicate distribution GAV — uniqueness rule not enforced on this image')
    expect(probe.status(), `expected 409 for the duplicate GAV, got HTTP ${probe.status()}`).toBe(409)
    const conflictBody = (await probe.json().catch(() => ({}))) as { errorCode?: string | null }
    test.skip(!conflictBody.errorCode, 'CRS predates #358 (409 without errorCode) — skipping UI journey')
    expect(conflictBody.errorCode).toBe('UNIQUENESS_VIOLATION')

    // UI journey: flip B's extension 'apk' → 'zip' (= A's exact coordinate).
    await openTab(page, idB!, /distribution/i)
    const extensionInput = page.getByPlaceholder('jar')
    await expect(extensionInput).toHaveValue('apk')
    await extensionInput.fill('zip')
    // Save through the combined bar+dialog; the 409 surfaces from the one PATCH.
    await saveViaReviewBar(page)

    // Title is the fixed 'Uniqueness violation'; the description is the
    // SERVER's message verbatim ("uniqueness violation: distribution GAV …").
    await expect(page.getByText('Uniqueness violation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/uniqueness violation: distribution GAV/i).first()).toBeVisible()
    // …and crucially NOT the optimistic-lock reload advice (the QA incident).
    await expectNoOptimisticConflictToast(page)
  })

  // Best-effort hygiene for long-lived stands (the gradle testcontainers stack
  // is ephemeral anyway): archive the spec's components. DELETE = archive, the
  // same call editor-build-history uses. afterAll (not a trailing serial test)
  // so a mid-chain failure cannot cascade-skip the cleanup and orphan rows.
  // afterAll has no test-scoped `request`/`page` fixtures — build a fresh
  // authenticated APIRequestContext from the project's baseURL + storageState.
  test.afterAll(async ({ playwright }) => {
    if (createdIds.length === 0) return
    const use = test.info().project.use
    const ctx = await playwright.request.newContext({
      baseURL: use.baseURL,
      storageState: use.storageState as string | undefined,
    })
    try {
      // CSRF double-submit: prime the XSRF-TOKEN cookie, then echo it.
      await ctx.get('/rest/api/4/components?page=0&size=1')
      const token = (await ctx.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')?.value
      const headers = {
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
      }
      for (const id of createdIds) {
        const del = await ctx.delete(`/rest/api/4/components/${id}`, { headers })
        expect(del.ok(), `cleanup delete failed (HTTP ${del.status()}) for ${id}`).toBeTruthy()
      }
    } finally {
      await ctx.dispose()
    }
  })
})
