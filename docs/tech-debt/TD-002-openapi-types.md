# TD-002: Replace hand-written `frontend/src/lib/types.ts` with OpenAPI-generated types

## Status

Partial. Wave 0 of the schema-v2 migration (PR #38, commits `e2e2199` + `2070c9e`) wired the portal-side half: `openapi-typescript` against a vendored `frontend/src/lib/api/v4.json` produces `frontend/src/lib/api/schema.d.ts`; `npm run generate-types:check` is the drift gate.

Part (a) — **DONE** (issue #89): CRS publishes a drift-gated spec (CRS TD-003, PRs #350/#351) and Portal now has a cross-repo staleness gate. `npm run vendor-spec` (`frontend/scripts/vendor-spec.sh`) fetches CRS's spec at a pinned ref (`v3` pre-cutover) → writes `v4.json` → regenerates types in one step; `npm run vendor-spec:check` runs in `merge-gate.yml` and fails the PR when the vendored copy falls behind CRS. The manual `cp ~/Downloads/v3-api-docs.json` flow is retired. See the "OpenAPI v4 types" section of the [README](../../README.md) for the pinned-ref + refresh details.

What remains: (b) retiring `frontend/src/lib/types.ts` in favour of re-exports from `schema.d.ts` once the two intentional drifts noted in `e2e2199`'s commit message (`?: T | null` vs `?: T`, `value: unknown` vs `Record<string, never>`) are resolved upstream or accepted as a thin compatibility shim.

### Known tradeoff in the part (a) gate (and a follow-up)

`vendor-spec:check` pins to the CRS `v3` **branch**, which is required for the gate to detect anything — pinning to a SHA would make the check a tautology (the vendored bytes were `cp`'d from that SHA). The cost of a moving ref: a Portal PR with zero spec-related changes can flip **red** the moment CRS pushes to `v3`, and the remediation (`npm run vendor-spec` + commit) then pulls unrelated CRS contract changes into an unrelated feature PR — mixing concerns and landing schema churn that PR's reviewers didn't sign up for. The diff is also byte-exact, so a non-semantic CRS reserialization (key reorder, whitespace) trips the gate even when the contract is unchanged ("gate red" ≠ "contract changed"; the remediation message is honest about this).

Acceptable for the single-consumer MVP. **Follow-up (post-cutover):** replace the per-PR gate with a **scheduled workflow that opens a dedicated `chore(openapi): re-vendor v4.json` PR** when drift is detected, so contract bumps are their own reviewable unit and never surprise-red in-flight PRs. Tracked alongside the CRS-spec-publication item in [TD-005](TD-005-schema-v2-followups.md).

## Context

The CRS REST API (v4) is the contract between Portal frontend and CRS backend. Today, the TypeScript types that describe that contract live in [`frontend/src/lib/types.ts`](../../frontend/src/lib/types.ts) and are maintained **by hand**:

- A backend developer adds a new field to `ComponentDetailResponse` in CRS Kotlin code.
- A frontend developer (or the same person, on a separate PR) adds the same field to `frontend/src/lib/types.ts`.
- Nothing automated catches drift if the two PRs disagree on field name, optionality, or shape.

This is the "atomic API+UI change" cost we accepted when extracting the Portal into its own repository (CRS ADR-012, Option A). The mitigation we agreed to was OpenAPI generation; this TD is that mitigation.

## Why this matters

- **Drift is silent.** Today the SPA can compile + tests pass while the runtime payload from CRS doesn't match the TypeScript declarations. The only signal is a runtime `undefined` somewhere in the form code.
- **Adds friction to API evolution.** Any new field in `ComponentUpdateRequest` is a two-PR-across-two-repos chore.
- **Field renames are dangerous.** A field rename on CRS that the Portal doesn't follow looks like "the field works on read but disappears on save."

## Proposed work

### Backend (CRS)

1. Wire `springdoc-openapi-starter-webmvc-ui` (or equivalent) into `components-registry-service-server/build.gradle`.
2. Add a Gradle task `:components-registry-service-server:generateOpenApiDocs` that emits `build/openapi/v4.json` covering at least:
   - `/rest/api/4/components/**`
   - `/rest/api/4/audit-log/**`
   - `/rest/api/4/admin/**`
   - `/rest/api/4/config/**`
   - `/rest/api/4/info`
   - `/auth/me` (top-level path; ensure it's not excluded by package scan)
3. Publish `v4.json` as a build artifact (TeamCity / GitHub Actions).
4. CI gate: regenerate spec + diff against committed copy → fail PR on drift.

### Frontend (Portal)

1. Add `openapi-typescript` (or `openapi-fetch`) to dev dependencies.
2. Pull the latest `v4.json` from the CRS artifact (or, simpler, vendor a copy and refresh on a schedule).
3. Generate `frontend/src/lib/api/schema.d.ts` from it via `npm run generate-types`.
4. Replace usages of `frontend/src/lib/types.ts` with imports from the generated schema. Keep a thin hand-written layer for SPA-only types that don't come from the API (`AdminModeState` etc.).
5. CI gate: `npm run generate-types -- --check` should fail if the committed schema disagrees with the bundled `v4.json`.

## Out of scope

- Generating Kotlin client code from the same spec (CRS already exposes a Feign client; the legacy v1/v2/v3 contract is shaped by hand and not worth re-deriving from OpenAPI).
- Migrating v1/v2/v3 endpoints to OpenAPI generation. They are stable legacy contracts; only v4 should be auto-generated.

## Acceptance criteria

1. `frontend/src/lib/api/schema.d.ts` exists, is committed, and is regenerated by `npm run generate-types`.
2. `frontend/src/lib/types.ts` no longer hand-defines anything that has a 1:1 backend DTO counterpart. SPA-only types remain.
3. CI on the Portal repo fails when the generated schema disagrees with the committed copy.
4. CI on the CRS repo emits `v4.json` as a build artifact and fails on local-vs-generated drift.
5. The "fields visible in `ComponentDetailResponse`" set in TypeScript matches the Kotlin DTO field-for-field as of the merge of this work.

## References

- CRS [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/012-portal-architecture.md) — Portal architecture; OpenAPI generation listed as a mitigation for separate-repo drift.
- CRS `TD-003` (`docs/registry/tech-debt/003-openapi-v4-spec-generation.md` in `octopus-components-registry-service`) — the matching tech-debt entry on the CRS side.
- Hand-written types today: [`frontend/src/lib/types.ts`](../../frontend/src/lib/types.ts).
