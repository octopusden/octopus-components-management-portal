# Test fixtures

JSON files in this directory are **shared contract fixtures** consumed by both
frontend and backend tests. The same file binds two assertions:

- A frontend test feeds it as the mocked HTTP response body and asserts the
  client code reads it without an envelope.
- A backend test reads the same file from `frontend/src/test-fixtures/` via a
  relative path and asserts that serializing the corresponding Kotlin DTO
  produces an identical JSON tree.

If either side changes its shape, exactly one of the two tests fails, surfacing
the contract drift before it reaches an E2E build.

## Files

- `portal-links.contract.json` — `/portal/links` happy-path response with all
  four URLs configured.
- `portal-links.empty.contract.json` — `/portal/links` response when no
  `PORTAL_LINKS_*_BASE_URL` env vars are set: Jackson omits the null fields,
  so the body is `{}`. Frontend code must treat each field as `undefined`-
  capable (not just `string | null`).

Both files drive `PortalLinksControllerContractTest.kt` (backend) and the
`'contract:'`-prefixed cases in `useInfo.test.ts` (frontend).
