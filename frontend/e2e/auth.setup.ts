import { request, type APIRequestContext } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'

// Inlined to keep this file dependency-free of the SPA `src/` tree —
// the e2e folder is mounted on its own into the Playwright container,
// without `src/`. Both constants must stay in sync with
// frontend/src/lib/auth.ts (OIDC_REGISTRATION_ID = 'keycloak') and
// SecurityConfig.kt's OIDC_REGISTRATION_ID — a registration-id rename
// in either place must be mirrored here.
const OIDC_REGISTRATION_ID = 'keycloak'
const OIDC_AUTHORIZE_PATH = `/oauth2/authorization/${OIDC_REGISTRATION_ID}`

// API-driven sign-in for the BFF flow. The portal binds the access token
// to a server-side Spring SESSION cookie — we cannot inject a bearer
// directly. So per role:
//   1. GET /oauth2/authorization/keycloak (follow redirects to the
//      Keycloak login HTML).
//   2. Parse the <form action="…"> from the login page and POST
//      username/password to that action URL.
//   3. Follow the redirect chain back to the portal — the gateway
//      materialises SESSION + XSRF-TOKEN cookies on the way.
//   4. Persist the request context's storageState to disk; the per-role
//      Playwright project loads it as `storageState`.
//
// Pinned to Keycloak 24.0.3 — any version bump must re-verify the form-
// action parsing below. The form action URL is part of Keycloak's HTML
// templates and is not a stable contract.

export interface AuthRoleConfig {
  username: string
  password: string
  storageStatePath: string
}

const FORM_ACTION_RE = /<form[^>]*\baction="([^"]+)"[^>]*\bmethod="post"/i

export async function authenticateRole(
  baseUrl: string,
  config: AuthRoleConfig,
): Promise<void> {
  const context: APIRequestContext = await request.newContext({
    baseURL: baseUrl,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      // Browser-like UA so Keycloak serves the HTML login page, not a
      // negotiated 401 with a WWW-Authenticate challenge.
      'User-Agent':
        'Mozilla/5.0 (PlaywrightAuthSetup; Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36',
    },
  })

  // Step 1: kick off the OIDC flow. The portal redirects → Keycloak.
  // Playwright follows redirects by default; the response we hold here is
  // the final hop, which is the Keycloak login HTML.
  const loginPage = await context.get(OIDC_AUTHORIZE_PATH)
  if (!loginPage.ok()) {
    throw new Error(
      `OIDC entry ${OIDC_AUTHORIZE_PATH} returned ${loginPage.status()} ${loginPage.statusText()}`,
    )
  }
  const loginHtml = await loginPage.text()
  const match = loginHtml.match(FORM_ACTION_RE)
  if (!match) {
    throw new Error(
      `Could not find <form method="post" action="..."> in Keycloak login HTML for ${OIDC_REGISTRATION_ID}. ` +
        `Has Keycloak's template shape changed? First 500 chars: ${loginHtml.slice(0, 500)}`,
    )
  }
  // Keycloak's form action is a fully-qualified URL; preserve it as-is so
  // the request leaves the portal origin and lands on the Keycloak host.
  // HTML entities (notably &amp;) need decoding because Keycloak inlines
  // session_code / execution / tab_id query params into action="...".
  const formAction = match[1]
    .replace(/&amp;/g, '&')
    .replace(/&#x3d;/g, '=')
    .replace(/&#x2f;/g, '/')

  // Step 2: post the credentials. Keycloak responds with a 302 back to
  // the portal's /login/oauth2/code/keycloak endpoint with the auth code.
  // The Playwright request context follows redirects automatically, so by
  // the time this resolves the portal session has been created.
  const postResponse = await context.post(formAction, {
    form: {
      username: config.username,
      password: config.password,
    },
  })
  if (!postResponse.ok()) {
    throw new Error(
      `Keycloak credential POST returned ${postResponse.status()} ${postResponse.statusText()}. ` +
        `Final URL: ${postResponse.url()}`,
    )
  }

  // Step 3: trigger the gateway to materialise XSRF-TOKEN + SESSION
  // explicitly (in case the redirect chain didn't already), and verify the
  // session by hitting /auth/me — a 200 here proves the SESSION cookie is
  // bound and the upstream CRS sees the bearer token.
  const me = await context.get('/auth/me', {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
  if (!me.ok()) {
    throw new Error(
      `auth/me after login for ${config.username} returned ${me.status()}; ` +
        `expected 200. Body: ${(await me.text()).slice(0, 500)}`,
    )
  }

  // Step 4: persist storageState so the per-role Playwright project picks
  // it up. Ensure the directory exists; .gitignore covers playwright/.auth/.
  fs.mkdirSync(path.dirname(config.storageStatePath), { recursive: true })
  await context.storageState({ path: config.storageStatePath })
  await context.dispose()
}
