# TD-005: schema-v2 migration follow-ups

## Status

Open. Recorded after PR #38 (`feature/crs-schema-v2`) reached code-complete on every Wave of the approved migration plan. The Waves' source-of-truth code shipped; the items below are the unfinished verification work and the cross-repo asks that fell out of the migration.

## Context

PR #38 lands four Waves of portal-side adaptation to the CRS schema-v2 / Model A' contract (CRS PR #192 + #193):

- **Wave A — Survival** (commits `d4b78fa`, `7ca071b`) — `types.ts` wholesale rewrite, every tab's read paths migrated, central save handler rewired through `baseConfiguration`. Verified end-to-end via the existing smoke-viewer Playwright specs on TC build #110 (against CRS 2.0.84-3370). **Done + verified.**
- **Wave B — Editor parity** (commits `146de12`, `a83802b`, `555fe44`, `b869e39`) — Build / Vcs / Distribution / Jira / Escrow tabs get full read+write parity; GeneralTab gains Group / TC-projects-list / DocLinks / ArtifactIds editors; dirty-fields gate on clear branches; required-field filters on Save. Unit tests cover the dispatch + save-payload shape; **e2e save flow is NOT exercised** against a real CRS.
- **Wave C-read — ConfigurationsTab** (commit `1f9c020`) — flat-list table over `configurations[]` with rowType badges and per-row payload summaries. 13 unit tests; **e2e rendering against real configurations[] is NOT exercised**.
- **Wave C-write — OverrideRowEditor** (commits `f9a10f1`, `1ff93fc`) — unified scalar + marker override modal, all six contract markers wired. 28+9 unit tests across the modal and FieldOverrides table; **e2e flow against `/components/{id}/field-overrides` is NOT exercised**.
- **Wave 0 — OpenAPI codegen** (commits `e2e2199`, `2070c9e`, `935ffdf`) — `openapi-typescript` against a vendored `v4.json`; drift check via `npm run generate-types:check`. Local-only until `935ffdf` wired the check into `merge-gate.yml`. **Done + verified** (zero drift vs hand-rolled `types.ts`; CI gate runs on every PR). `:e2eTest` Gradle job remains a manual policy (`gradle.properties:32-33`) — wiring it into CI needs Docker-on-runner + internal CRS registry credentials + bootJar build and is tracked as a separate follow-up.

The original plan's Verification §3 named three e2e scenarios that did not get written:

> - Edit Build aspect → PATCH `/components/{id}` with `baseConfiguration.build` → re-fetch sees value
> - Field-override create with `overriddenAttribute=build.javaVersion`, scalar value → row appears
> - Marker override `vcs.settings` with a `vcsEntries[]` payload → row appears with `rowType=MARKER`

This TD-005 tracks closing those gaps and the cross-repo asks that surfaced during the work.

## Why this matters

- **Wave B + C UI changes ship without end-to-end verification.** Unit tests assert "the SPA dispatches a payload of the right shape"; they do not catch "CRS rejects that shape at runtime because the field name drifted" or "the visual UX breaks because of a state-management quirk that only manifests against a real backend." Wave A is fine because the smoke-viewer suite exercises it transitively (open list, open detail, see tabs render); the save and override flows have no equivalent.
- **CRS-side asks live as PR comments and chat history, not as tracked debt.** Without this file the items below would resurface as surprise blockers the next time the schema-v2 contract is touched.

## Proposed work — portal-side

### 1. Playwright e2e: Wave B save paths

For each tab the schema-v2 migration touched, add one Playwright scenario that:

1. Opens a known component detail page under the chromium-admin storageState.
2. Clicks the tab.
3. Mutates a typed field (Build → set `gradleVersion`; Vcs → add a `vcsEntry`; Distribution → add a `mavenArtifact`; Jira → set `projectKey`; Escrow → toggle `gradleIncludeTestConfigurations`; General → set Group Key + isFake, add a TC project / Doc Link / Artifact ID).
4. Clicks the tab-local Save (or the central Save for GeneralTab).
5. Re-reads the component via `page.request.get('/rest/api/4/components/{id}')` and asserts the change round-tripped.

Six new specs total, one per tab. Layout matches the existing `regression-components-list.spec.ts`. Run under `chromium-admin` because `ROLE_ADMIN` carries `CREATE_COMPONENTS`.

Acceptance: every save path of the schema-v2 contract has an active e2e gate. A future CRS field rename (say `vcsPath → vcsCanonicalPath`) trips the matching spec immediately.

### 2. Playwright e2e: Wave C-read ConfigurationsTab

One spec that:

1. Picks a component known to have at least one SCALAR_OVERRIDE and one MARKER row (`page.request.get('/rest/api/4/components/{id}')` and look for non-BASE rows in `configurations[]`).
2. Navigates to the Configurations tab.
3. Asserts the BASE row + every override row renders with the expected rowType badge, version range, and payload summary.

Acceptance: the read-side table is exercised against real configurations[] shape, not just the unit-test fixture.

### 3. Playwright e2e: Wave C-write OverrideRowEditor

Two specs:

a) **Scalar override flow** — open a component, click Add Override, select a scalar attribute (e.g. `build.javaVersion`), set a version range and a value, save. Assert the new row appears in the FieldOverrides table with the right `overriddenAttribute` + `value`.

b) **Marker override flow** — same but with `vcs.settings`, add two vcsEntries with different paths, save. Assert the new row appears with `rowType=MARKER` and the marker child collection rendered (via the Configurations tab summary).

Both run under `chromium-admin` (`CREATE_COMPONENTS`).

Acceptance: the override editor's two arms of the tagged-union are exercised end-to-end against real `/field-overrides` endpoints.

### 4. Per-wave Playwright visual baselines

The plan's Verification §4 calls for baseline regeneration per wave:

> The committed baselines at `frontend/e2e/visual/__compare__/*.png` will need regeneration after every wave (Wave A list/General/Build/Vcs/Distribution/Jira/Escrow; Wave B per-component list editors; Wave C-read ConfigurationsTab; Wave C-write override modal).

None of those have been regenerated against the schema-v2 UI. The visual specs are tagged but not enforced today; regenerate as part of the post-CRS-merge close-out.

### 5. RHF dirty-fields positive-clear unit test

`ComponentDetailPage.test.tsx`'s "user-dirty empty list + prior TC project sends explicit clear ([])" test was dropped (in `555fe44`) because `setValue('teamcityProjects', [], { shouldDirty: true })` does not mark a field dirty when the new value matches the form default. The dirty-gate IS exercised correctly in production via `useFieldArray.remove`, but the unit-level coverage of the positive-clear branch is missing.

Two paths to close: (a) replace the empty stub GeneralTab with one that uses `useFieldArray` and calls `remove(0)` to mark dirty + clear the list; (b) introduce a more permissive RHF dirty check (e.g. a `formHydrated` flag set by GeneralTab's useEffect and read by `handleSave`).

## Proposed work — CRS-side asks

Filed in this TD because they're discovered during portal work; track separately in CRS once raised. These are read-only references from the portal side.

### 6. Register `escrow.buildTask` in `SCALAR_ATTRIBUTE_PATHS`

CRS PR #193 added the column `component_configurations.escrow_build_task` and the entity property `escrowBuildTask`, but did NOT include `"escrow.buildTask"` in `ConfigurationRowAccessors.SCALAR_ATTRIBUTE_PATHS`. Override creation via `POST /components/{id}/field-overrides` with `overriddenAttribute: "escrow.buildTask"` would trip the `require(attributePath in SCALAR_ATTRIBUTE_PATHS)` guard and 400. The portal's `OverrideRowEditor` deliberately omits `escrow.buildTask` from the scalar catalogue (see NOTE comment in `OverrideRowEditor.tsx`). Add back when CRS registers the path.

### 7. TD-003 (CRS-side) — publish `v4.json` artifact

Mirror of CRS's own TD-003. Portal's Wave 0 vendored the spec by hand from a downloaded `v3-api-docs.json`. Once CRS publishes the spec (either as a committed `docs/api/v4.json` or as a CI artifact per build), the portal's `frontend/scripts/refresh-openapi.sh` (or equivalent) can refresh automatically. TD-002 here on the portal side stays partially open until that pipeline closes.

### 8. Confirm Flyway data migration for `registry_config` rows

The portal renamed the persisted `field-config` and `component-defaults` registry keys from `component.system` to `component.systems` in lockstep with the DTO rename (per the user's coordination answer). Confirm that CRS PR #192 (or a follow-up) ships a Flyway migration that rewrites existing rows' JSON payload accordingly, or document that the registries are reset / rewritten at startup.

### 9. OpenAPI `info.version` populated from build version

CRS-rendered `v4.json` ships `"info": { "version": "v0" }` — the Springdoc default. Setting it to the actual `2.0.84-NNNN` build tag (or the equivalent maven version) lets the portal-side spec-pin's traceability ("what CRS build was this spec snapshotted from?") read from the spec itself rather than from a separate annotation.

### 10. Domain-named meta endpoints for option lists

Schema-v2 made `BuildAspect.buildSystem`, `Escrow.generation`, and `VcsEntry.repositoryType` free-form `string` on the wire. The legacy enums (`BuildSystem.type`, `Escrow.generation`, `VersionControlSystem.type`) are still the canonical valid-token sets but are no longer reachable from the v4 typed contract. On a fresh CRS install where the admin has not seeded `field-config.<section>.<field>.options`, the portal's EnumSelect collapses to "None + current value" — users cannot change build systems away from the existing one.

Portal commit `6ad8876` introduced `useFieldOptions(fieldPath)` which prefers admin field-config options when set and otherwise GETs a CRS-side domain endpoint. The endpoints do not exist yet; expected paths:

| fieldPath | endpoint |
|---|---|
| `buildSystem` | `GET /rest/api/4/components/meta/build-systems` |
| `repositoryType` | `GET /rest/api/4/components/meta/repository-types` |
| `generation` | `GET /rest/api/4/components/meta/escrow-generations` |

Each returns `string[]`. Source can be the legacy enum, a config table, or anything CRS chooses — the wire surface stays domain-named, not implementation-coupled. Until CRS lands the endpoints the portal's hook 404s gracefully and the dropdown stays in current shape; no portal change required when CRS ships.

## Out of scope

- Re-architecting the chromium-admin / chromium-viewer split. The current pattern works for the new specs above.
- Pulling the e2e specs into the Kotlin contract layer. Playwright is the right tool — keep the testcontainers Kotlin driver focused on stack orchestration + the existing few HTTP-level probes.
- Adding more granular role-based contract probes. Wave A's role rename in `b92623a` already pins the role contract; further role assertions belong in CRS-side tests.

## Acceptance criteria for closing this TD

1. Items 1–5 (portal-side) shipped on `develop` after PR #38 merges. Each Playwright spec runs under the appropriate storageState and exercises a real CRS instance via the testcontainers stack.
2. Items 6–9 (CRS-side) tracked as separate issues in `octopusden/octopus-components-registry-service`. This TD references them by issue URL once filed.
3. `frontend/e2e/visual/__compare__/*.png` baselines regenerated against the schema-v2 UI and committed.

## References

- [TD-002](TD-002-openapi-types.md) — portal-side OpenAPI codegen (partial: Wave 0 wired generation; full retire of hand-rolled `types.ts` pending TD-003).
- Approved migration plan: `~/.claude/plans/components-registry-service-https-githu-distributed-castle.md`.
- PR #38 (`feature/crs-schema-v2`) — schema-v2 migration.
- PR #39 (`fix/e2e-testcontainers-registry`) — merged; testcontainers DOCKER_REGISTRY plumbing.
