> Frontend-only change (`frontend/`, npm/vitest). No backend (Gradle/Kotlin)
> group is needed — the BFF proxies CRS's v4 API unchanged.
>
> Everything except tasks 1.4-1.6 and group 6's manual checks can proceed
> against hand-written fixtures/mocks. Those need CRS's
> `rms-registered-build-params` branch merged to CRS `main` first.
>
> No components-list work: CRS resolves the registered value into the existing
> `javaVersion` field, so the column and filter are unchanged.

## 1. Types

- [x] 1.1 Add `ActualRange { versionRange: string, value: string }` to `frontend/src/lib/types.ts`
- [x] 1.2 Add `ActualDisagreement { subRange: string, actualValue: string }` to `frontend/src/lib/types.ts`
- [x] 1.3 Add `registeredBuildParameters` to `ComponentDetail` (`RegisteredBuildParametersDetail | null`). Declared as an **optional** field (`registeredBuildParameters?:`), not required — 26 existing test files construct `ComponentDetail` fixtures without it, matching the existing convention for other additive response fields (`canEdit?:`). `ComponentSummary` needs no new field — CRS resolves the registered value into the existing `javaVersion`.
- [ ] 1.4 Once CRS's branch reaches CRS `main`: run `npm run vendor-spec`
- [ ] 1.5 Run `npm run generate-types`
- [ ] 1.6 Reconcile the generated `schema.d.ts` against 1.1-1.3's hand-written types, settling any nullability difference by making the hand-written type agree with the generated one

## 2. Detail view — ACTUAL ranges and warnings (Build tab)

- [x] 2.1 Failing test: `javaActualRanges` render read-only under the `javaVersion` `FieldOverrideInline`
- [x] 2.2 Failing test: `mavenActualRanges` render read-only under the `mavenVersion` `FieldOverrideInline`
- [x] 2.3 Failing test: the rendered ACTUAL ranges have no add/edit/delete control
- [x] 2.4 Failing test: three `javaWarnings` entries with distinct (subRange, actualValue) pairs render as ONE summary stating three disagreeing ranges
- [x] 2.5 Failing test: two byte-identical `javaWarnings` entries plus one distinct entry report TWO disagreeing ranges, and expand to two — de-duplicated on the (subRange, actualValue) pair (`dedupeActualDisagreements`, unit-tested in `lib/registeredBuildParameters.test.ts`, plus the component-level assertion in `ActualBuildParameters.test.tsx`)
- [x] 2.6 Verbatim rendering covered inline in the range/summary tests above, not a separately named test
- [x] 2.7 ACTUAL ranges render via `formatVersionRange` (`lib/versionRange.ts`), the same helper `FieldOverrideInline` uses — reused directly, not re-tested in isolation (its own behavior is covered by `versionRange.test.ts`)
- [x] 2.8 Failing test: a component with no ranges/warnings and `actualDataUnavailable` falsy renders nothing (`ActualBuildParameters.test.tsx` "renders nothing...")
- [x] 2.9 True by construction: `FieldOverrideInline.tsx` is untouched by this change, so no warning marker is added to any configured row — not separately re-tested
- [x] 2.10 Failing test: expanding the summary lists each entry's `subRange`/`actualValue` verbatim
- [x] 2.11 Failing test: empty `javaWarnings` renders no summary at all
- [x] 2.12 True by construction: each `ActualBuildParameters` instance only ever receives its own attribute's `warnings` (`BuildTab.tsx` wiring test asserts the per-attribute prop split) — not separately re-tested as a Java-vs-Maven integration case
- [x] 2.13 True by construction: `ActualBuildParameters` renders independently of `FieldOverrideInline`'s `canEdit`/add/edit/delete controls — not separately re-tested
- [x] 2.14 Failing test: `actualDataUnavailable: true` renders as an alert (`role="alert"`, amber warning styling + icon)
- [x] 2.15 Failing test: that unavailable alert is visually/textually distinct from the disagreement summary
- [x] 2.16 Failing test: a component whose `registeredBuildParameters` is absent renders empty ACTUAL blocks (all pre-existing `BuildTab.test.tsx` structure-preserved tests, which never set `registeredBuildParameters`, still pass unchanged)
- [x] 2.17 Implement: wire `registeredBuildParameters` from `ComponentDetail` into `BuildTab.tsx`/`useBuildSection.ts`
- [x] 2.18 Implement: render the read-only ACTUAL range lists (`ActualBuildParameters.tsx`)
- [x] 2.19 Implement: render the collapsed per-attribute disagreement summary — inline destructive text/icon, the same tone as `FieldOverrideInline.tsx`'s `renderConflictBadge` (not its exact markup, since this is an expandable summary, not a single badge)
- [x] 2.20 Implement: render the `actualDataUnavailable` alert
- [x] 2.21 Confirm tests pass — `lib/registeredBuildParameters.test.ts` (5/5), `ActualBuildParameters.test.tsx` (9/9), `BuildTab.test.tsx` (19/19, incl. 4 new). Full suite: 171 files / 2396 tests green. `tsc --noEmit` and `eslint . --max-warnings 0` both clean.

## 3. 409 — RMS_REGISTERED_VALUE_CONFLICT

- [ ] 3.1 Failing test: a 409 with `errorCode: 'RMS_REGISTERED_VALUE_CONFLICT'` yields a `kind: 'value'` conflict
- [ ] 3.2 Failing test: that conflict's title/description is distinct from the generic "Save failed" branch, and uses the server's `errorMessage`
- [ ] 3.3 Implement: add a dedicated `errorCode === 'RMS_REGISTERED_VALUE_CONFLICT'` branch in `useOptimisticConflict.ts`, ahead of the generic fallback
- [ ] 3.4 Failing test: the conflict message states that no changes were saved
- [ ] 3.5 Failing test: a save that fails with this conflict closes the review dialog and shows the Build tab with the message inline (mirroring the existing Jira-conflict routing, ~L604-615)
- [ ] 3.6 Failing test: routing is decided by `errorCode` before the `/jira|project\s*key/i` message heuristic — a component whose name matches that pattern, saved alongside a Jira-pair edit, still routes to the Build tab
- [ ] 3.7 Implement the routing and the message, placing the RMS branch ahead of the Jira heuristic
- [ ] 3.8 Failing test: this conflict refetches the component, and the refetched ACTUAL ranges/summary appear on the Build tab
- [ ] 3.9 Failing test: a `UNIQUENESS_VIOLATION` 409 still does NOT refetch — the new refetch is scoped to this error code only
- [ ] 3.10 Failing test: the conflict message is shown before the refetch resolves — a slow refetch does not delay it
- [ ] 3.11 Failing test: unsaved edits across tabs — including queued field-override rows — survive the rejection and the refetch untouched, so the conflicting value can be corrected and resubmitted. This pins the existing re-hydration guards (id-keyed form reset, dirty/touched guard, section-snapshot clean guard, overrides-draft reconciliation) that this requirement depends on; see design.md Decision 6
- [ ] 3.12 Failing test: a refetch that itself fails still shows the conflict message and leaves the previous ACTUAL data on screen
- [ ] 3.13 Failing test: a refetch returning unchanged data (a CRS replica whose cache predates the rejection) is not treated as an error — no retry, no second failure message
- [ ] 3.14 Implement the refetch in the caller, after the message is shown — NOT inside `useOptimisticConflict`, which is awaited before the toast and would delay it (design.md Decision 6)
- [ ] 3.15 Confirm ACTUAL data is read directly from the fetched component, never copied into form or draft state
- [ ] 3.16 Confirm tests pass

## 4. 503 — RMS unavailable

- [ ] 4.1 Failing test: a save that fails with HTTP 503 and body `errorCode: 'RMS_UNAVAILABLE'` shows distinguishable "RMS is currently unavailable" messaging
- [ ] 4.2 Failing test: that messaging is distinct from the generic destructive "Save failed" toast
- [ ] 4.3 Failing test: a 503 with no `errorCode`, or a different `errorCode`, falls through to the existing generic "Save failed" toast
- [ ] 4.4 Implement: add an explicit 503 check in the save-error chain (`ComponentDetailPage.tsx`), after the 409/400 branches and ahead of the generic fallback, parsing the body with the existing `classifyConflictBody` (`lib/conflict.ts`) and dispatching on `errorCode === 'RMS_UNAVAILABLE'` alone — no additional check of which fields the save touched
- [ ] 4.5 Confirm the app's `QueryClient` still sets no mutation-level `retry` (`App.tsx`), so a 503 save is not silently retried; note the dependency in the test if a retry default is ever added
- [ ] 4.6 Verify the `build.javaVersion`/`build.mavenVersion` option values (`useFieldOptions`) round-trip byte-identically with stored values — a spelling difference (stored `1.8` vs option `8`) makes every save count as a change, which trips CRS's gate and turns an RMS outage into a 503 on a field the user never edited
- [ ] 4.7 Confirm tests pass

## 5. No client-side Save gating

- [ ] 5.1 Failing test: the Save control is enabled when a component's `javaWarnings` is non-empty, same as when it is empty
- [ ] 5.2 Failing test: saving an unrelated field succeeds with a non-empty `javaWarnings`, with no client-side check performed against it
- [ ] 5.3 Confirm 5.1/5.2 pass without needing new code — i.e. no existing or newly-added logic reads `javaWarnings`/`mavenWarnings` for Save-gating

## 6. Docs and finalization

- [ ] 6.1 Extend `docs/features/component-detail.md` (Build tab section) describing the new ACTUAL range/warning display
- [ ] 6.2 Cross-reference CRS's `registered-build-parameters` spec by name
- [ ] 6.3 Run `./gradlew qualityStatic`
- [ ] 6.4 Run the full frontend vitest suite
- [ ] 6.5 Once CRS's branch is on `main` and this is implemented against a real CRS instance: manual check — a Maven/Gradle component with recorded RC/RELEASE builds shows its full range/warning detail on the Build tab
- [ ] 6.6 Manual check: attempt a disagreeing save, confirm the 409 message
- [ ] 6.7 Manual check: if feasible, simulate RMS unavailability, confirm the 503 message
- [ ] 6.8 Fold this change's delta into `openspec/specs/registered-build-parameters/`
- [ ] 6.9 Move the change folder to `openspec/archive/`, per `openspec/config.yaml`'s archive operation
