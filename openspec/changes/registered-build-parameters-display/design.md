## Context

See proposal.md — Why. CRS exposes two response shapes and two new write-time error responses, all already implemented on CRS's `rms-registered-build-params` branch (`openspec/changes/consume-rms-registered-build-version/` in that repo):

```
RegisteredBuildParametersSummary { java: string?, maven: string? }
RegisteredBuildParametersDetail {
  javaActualRanges:  [{ versionRange: string, value: string }]
  javaWarnings:      [{ subRange: string, actualValue: string }]
  mavenActualRanges: [{ versionRange: string, value: string }]
  mavenWarnings:     [{ subRange: string, actualValue: string }]
  actualDataUnavailable: boolean
}
```

- `registeredBuildParameters` is `null` on both `ComponentSummaryResponse` and `ComponentDetailResponse` for a component that is: 
  - archived;
  - not Maven/Gradle;
  - when RMS integration is disabled (CRS's requirement: "ACTUAL applies only to non-archived Maven and Gradle components"; CRS's requirement: "A disabled RMS integration turns the whole feature off"). 
- `actualDataUnavailable = true` is a distinct third state from `null` and from a clean/warned row — it means "this component is eligible but CRS has never successfully swept it," and must render differently from both.

CRS's write endpoints for `build.javaVersion`/`build.mavenVersion` (base-config `PATCH`, field-override create/update, bulk apply-plan) now return, only when the write actually changes one of those two fields:
- `409` with body `{ errorCode: "RMS_REGISTERED_VALUE_CONFLICT", errorMessage }` — the new value disagrees with a non-null, intersecting ACTUAL value.
- `503` — the live RMS check was unreachable, timed out, or was ambiguous, so CRS failed closed.

Portal already has a generic 409-dispatch mechanism (`useOptimisticConflict.ts`) and a TeamCity-validation display precedent (`docs/features/tc-validation.md`) for "warning attached to otherwise-editable data" — both are reused rather than reinvented here.

## Goals / Non-Goals

**Goals:**
- Show ACTUAL's rollup (list view) and full range/warning detail (detail view), reusing existing Badge/warning-badge visual language already in `ComponentTable.tsx` and `FieldOverrideInline.tsx`.
- Give `RMS_REGISTERED_VALUE_CONFLICT` and RMS-unavailable (`503`) their own distinguishable, specific user-facing messaging, instead of letting either fall through to a generic toast.
- Keep the change strictly additive: no existing column, tab, or save-error path changes shape for a component that has no ACTUAL data (`registeredBuildParameters: null`).

**Non-Goals:**
- Disabling or otherwise gating the `javaVersion`/`mavenVersion` controls client-side based on ACTUAL. CRS's write-time gate is the single source of enforcement; duplicating it here would be a second, driftable copy of a rule CRS already owns (the same class of risk CRS's own design.md calls out for its own gate placement).
- Persisting or caching ACTUAL client-side beyond the lifetime of the already-fetched summary/detail response. Portal is not a second store for RMS data any more than CRS intends to be one for RMS itself (CRS's own non-goal).

## Decisions

### 1. List-view: ACTUAL replaces the configured value in the Java column

- The existing Java Version column shows `registeredBuildParameters.java` when present; otherwise it falls back to the configured `javaVersion`, unchanged from today. It is one value, not a configured-vs-actual pair.
- Maven is out of scope for the list view — `mavenVersion` isn't shown in the list today and this change doesn't add it there. Maven's ACTUAL data is a detail-view-only concern (Decision 2).

### 2. Detail-view: ACTUAL renders inline in the Build tab, not a new tab

- Reuses `FieldOverrideInline`'s existing conflict-badge pattern (`renderConflictBadge`) rather than a separate tab.
- TeamCity validations get their own tab because they're a registry-wide, multi-component concern; ACTUAL is scoped to the one field it annotates, so it stays inline.
- ACTUAL ranges render as a read-only list under each of `javaVersion`/`mavenVersion`'s `FieldOverrideInline` — no add/edit/delete control of its own, unlike `FieldOverrideInline`'s own configured-range list.
- A warning renders as an `AlertTriangle` badge on the specific row it names (the OVERRIDDEN row, or the BASE row for a DEFAULT disagreement), using CRS's `subRange`/`actualValue` text verbatim — no reformatting client-side.

### 3. `actualDataUnavailable` is its own alert, styled distinctly from a disagreement warning

- A disagreement warning means "checked, and it disagrees" — still an alert, not neutral.
- `actualDataUnavailable` means "we couldn't check" — also an alert (warning/error styling, e.g. an alert icon), not a plain neutral note.
- Both use alert styling; they use different wording/treatment from each other so they are never mistaken for one another.

### 4. 409/503 handling extends existing dispatch points

- `useOptimisticConflict.ts` already dispatches on `errorCode` for any 409 — add an `errorCode === 'RMS_REGISTERED_VALUE_CONFLICT'` branch there.
- `503` has no existing status-code branch below 409 anywhere in the save-error chain today — add it as its own explicit check in `ComponentDetailPage.tsx`, not folded into the 409 dispatcher (a 503 carries no `errorCode` body to dispatch on).

### 5. No Save-button gating tied to `javaWarnings`/`mavenWarnings`

- CRS already permits an unrelated-field save regardless of an existing disagreement warning.
- Portal's Save control's enabled/disabled state and its client-side (RHF/Zod) validation SHALL NOT read `javaWarnings`/`mavenWarnings` at all — there is no new wiring to add here, only a rule to avoid introducing one.

### 6. Types are extended by hand in `types.ts`

- Per this repo's open TD-002 tech debt, `schema.d.ts` (generated from vendored `v4.json`) is not yet what application code imports — `types.ts` still is.
- This change follows that existing convention rather than pre-empting TD-002.
- `vendor-spec`/`generate-types` are re-run once CRS's branch reaches `main`, to keep the drift-check green and have the real shape ready for TD-002's eventual migration.

## Risks / Trade-offs

- **Can't verify end-to-end until CRS merges.** `v4.json`/`schema.d.ts` don't carry `registeredBuildParameters` yet, and the `409`/`503` responses don't exist on any real CRS instance until CRS's `rms-registered-build-params` branch reaches `main`. Implementation proceeds against hand-written fixtures/mocks; a true integration check needs a CRS instance built from that branch.
- **Two separate "build warning" surfaces will coexist**: TeamCity's validation findings and this feature's ACTUAL-disagreement warnings — different wire shapes, different visual treatment, different owners. Accepted, not unified: they answer different questions (build-step misconfiguration vs. registered-value drift).
- **The list-view rollup can show a numerically-higher-but-superseded value** (max ever recorded, not "what the component currently builds on") — a limitation CRS documents and Portal inherits as-is, since showing something more current would require fetching detail-shaped data for every list row.
