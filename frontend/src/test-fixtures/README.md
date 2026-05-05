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

- `portal-links.contract.json` — `/portal/links` response shape. Backend
  contract: `PortalLinksControllerContractTest.kt`. Frontend contract:
  `useInfo.test.ts` (`'contract:'`-prefixed cases).
