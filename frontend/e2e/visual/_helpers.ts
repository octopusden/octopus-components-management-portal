import type { Page, Route } from '@playwright/test'

// Visual-acceptance route mocks. Visual specs MUST NOT depend on live CRS
// data (different fixture snapshots break archived-row / action-coverage /
// visibility assertions); every spec routes through one of these helpers.
//
// Glob patterns include query strings on purpose. Real list endpoints are
// hit as `/rest/api/4/components?page=0&size=20&...`; an exact-only glob
// (`**/rest/api/4/components`) would miss them. The detail-route uses a
// regex to disambiguate `/components/{id}` from `/components?...`.

const COMPONENTS_LIST = '**/rest/api/4/components?**'
// Detail must NOT match /components/meta/owners — keep the path segment
// strictly UUID-like (no slashes after /components/).
const COMPONENTS_DETAIL = /\/rest\/api\/4\/components\/[^/?]+(?:\?.*)?$/
const COMPONENTS_OWNERS = '**/rest/api/4/components/meta/owners'
const AUDIT_RECENT = '**/rest/api/4/audit/recent?**'
const FIELD_CONFIG = '**/rest/api/4/config/field-config'

function jsonRoute(route: Route, status: number, body: unknown) {
  void route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

/** Mock GET /components (list) with a Page<ComponentSummary> fixture. */
export async function mockComponentList(page: Page, fixture: unknown) {
  await page.route(COMPONENTS_LIST, (route) => jsonRoute(route, 200, fixture))
}

/** Mock GET /components/{id} (detail) with a ComponentDetail fixture. */
export async function mockComponentDetail(page: Page, fixture: unknown) {
  // Regex `[^/?]+` already excludes the list URL (`/components?...`),
  // so no extra disambiguation is needed in the callback.
  await page.route(COMPONENTS_DETAIL, (route) => jsonRoute(route, 200, fixture))
}

/** Mock GET /audit/recent with a Page<AuditLogEntry> fixture. */
export async function mockAuditRecent(page: Page, fixture: unknown) {
  await page.route(AUDIT_RECENT, (route) => jsonRoute(route, 200, fixture))
}

/**
 * Mock GET /components/meta/owners — used by PeopleInput / useOwners.
 * Default fixture is an empty list, which is sufficient for layout
 * conformance specs that don't open the picker; pass a string[] to seed
 * suggestions for tests that do.
 */
export async function mockOwners(page: Page, fixture: string[] = []) {
  await page.route(COMPONENTS_OWNERS, (route) => jsonRoute(route, 200, fixture))
}

/** Mock GET /config/field-config with a sectioned-shape fixture. */
export async function mockFieldConfig(page: Page, fixture: unknown) {
  await page.route(FIELD_CONFIG, (route) => jsonRoute(route, 200, fixture))
}

/** Mock GET /components (list) with a 500 to drive InlineError state. */
export async function mockComponentListError(page: Page) {
  await page.route(COMPONENTS_LIST, (route) =>
    jsonRoute(route, 500, { error: 'simulated visual-spec failure' }),
  )
}

/** Mock GET /audit/recent with a 500 to drive InlineError state. */
export async function mockAuditRecentError(page: Page) {
  await page.route(AUDIT_RECENT, (route) =>
    jsonRoute(route, 500, { error: 'simulated visual-spec failure' }),
  )
}
