> Frontend-only change (`frontend/`, npm/vitest). No backend (Gradle/Kotlin)
> group is needed — the BFF proxies CRS's v4 API unchanged.
>
> Groups 1-4 can proceed against hand-written fixtures/mocks. Task 1.2 and
> group 6's manual check need CRS's `rms-registered-build-params` branch
> merged to CRS `main` first — see design.md Risks.

## 1. Types

- [ ] 1.1 Add `ActualRange { versionRange: string, value: string }` to `frontend/src/lib/types.ts`
- [ ] 1.2 Add `ActualDisagreement { subRange: string, actualValue: string }` to `frontend/src/lib/types.ts`
- [ ] 1.3 Add `registeredBuildParameters: { java: string | null, maven: string | null } | null` to `ComponentSummary`
- [ ] 1.4 Add `registeredBuildParameters: { javaActualRanges: ActualRange[], javaWarnings: ActualDisagreement[], mavenActualRanges: ActualRange[], mavenWarnings: ActualDisagreement[], actualDataUnavailable: boolean } | null` to `ComponentDetail`
- [ ] 1.5 Once CRS's branch reaches CRS `main`: run `npm run vendor-spec`
- [ ] 1.6 Run `npm run generate-types`
- [ ] 1.7 Reconcile the generated `schema.d.ts` against 1.1-1.4's hand-written types. Expect a nullability mismatch to resolve, not a clean match: CRS's OpenAPI declares no required fields on `RegisteredBuildParametersSummary`, so the generated type is `java?: string` where 1.3 writes `java: string | null`. Settle on one spelling and make the hand-written type agree with the generated one.

## 2. List view — ACTUAL rollup (Java only)

- [ ] 2.1 Failing test: a component with `registeredBuildParameters.java` set shows that value in the Java Version column, not the configured `javaVersion`
- [ ] 2.2 Failing test: a component with `registeredBuildParameters: null` shows the configured `javaVersion` in the Java Version column, unchanged from today
- [ ] 2.3 Failing test: a component with `registeredBuildParameters` present but `java: null` shows the configured `javaVersion` in the Java Version column
- [ ] 2.4 Failing test: `17.0.9` renders as `17`
- [ ] 2.5 Failing test: `1.8` renders as `1.8`, not `8`
- [ ] 2.6 Failing test: `1.8.0_292` renders as `1.8`
- [ ] 2.7 Failing test: a value that cannot be read as a version number renders verbatim, not as an em-dash
- [ ] 2.8 Implement the display-trimming helper (pure function, unit-tested independently of the table)
- [ ] 2.9 Implement: change the `javaVersion` column cell (`ComponentTable.tsx` ~L371-384) to prefer `registeredBuildParameters.java` (trimmed), falling back to the configured value
- [ ] 2.10 Confirm tests pass

## 3. Detail view — ACTUAL ranges and warnings (Build tab)

- [ ] 3.1 Failing test: `javaActualRanges` render read-only under the `javaVersion` `FieldOverrideInline`
- [ ] 3.2 Failing test: `mavenActualRanges` render read-only under the `mavenVersion` `FieldOverrideInline`
- [ ] 3.3 Failing test: the rendered ACTUAL ranges have no add/edit/delete control
- [ ] 3.4 Failing test: three `javaWarnings` entries render as ONE summary stating three disagreeing ranges
- [ ] 3.5 Failing test: no warning marker appears on any configured `FieldOverrideInline` row
- [ ] 3.6 Failing test: expanding the summary lists each entry's `subRange`/`actualValue` verbatim
- [ ] 3.7 Failing test: empty `javaWarnings` renders no summary at all
- [ ] 3.8 Failing test: non-empty `javaWarnings` with empty `mavenWarnings` summarizes only the Java section
- [ ] 3.9 Failing test: a row stays fully editable while a disagreement summary is shown — add/edit/delete all still work
- [ ] 3.10 Failing test: `actualDataUnavailable: true` renders as an alert (warning/error styling, e.g. an alert icon)
- [ ] 3.11 Failing test: that unavailable alert is visually/textually distinct from the disagreement summary
- [ ] 3.12 Failing test: a component whose `registeredBuildParameters` is `null` renders the Build tab exactly as it does today
- [ ] 3.13 Implement: wire `registeredBuildParameters` from `ComponentDetail` into `BuildTab.tsx`/`useBuildSection.ts`
- [ ] 3.14 Implement: render the read-only ACTUAL range lists
- [ ] 3.15 Implement: render the collapsed per-attribute disagreement summary, reusing `FieldOverrideInline.tsx`'s `renderConflictBadge` styling (~L112-124) for its tone
- [ ] 3.16 Implement: render the `actualDataUnavailable` alert
- [ ] 3.17 Confirm tests pass

## 4. 409 — RMS_REGISTERED_VALUE_CONFLICT

- [ ] 4.1 Failing test: a 409 with `errorCode: 'RMS_REGISTERED_VALUE_CONFLICT'` yields a `kind: 'value'` conflict
- [ ] 4.2 Failing test: that conflict's title/description is distinct from the generic "Save failed" branch, and uses the server's `errorMessage`
- [ ] 4.3 Implement: add a dedicated `errorCode === 'RMS_REGISTERED_VALUE_CONFLICT'` branch in `useOptimisticConflict.ts`, ahead of the generic fallback
- [ ] 4.4 Failing test: the conflict message states that no changes were saved
- [ ] 4.5 Failing test: the editor's unsaved form changes survive the rejection, so the conflicting value can be corrected and resubmitted
- [ ] 4.6 Failing test: a save that fails with this conflict routes focus to the Build tab (mirroring the existing Jira-conflict routing, ~L604-615)
- [ ] 4.7 Implement the routing and the message
- [ ] 4.8 Failing test: this conflict refetches the component, and the refetched ACTUAL ranges/warnings appear on the Build tab
- [ ] 4.9 Failing test: a `UNIQUENESS_VIOLATION` 409 still does NOT refetch — the new refetch is scoped to this error code only
- [ ] 4.10 Implement the refetch in the `RMS_REGISTERED_VALUE_CONFLICT` branch
- [ ] 4.11 Confirm tests pass

## 5. 503 — RMS unavailable

- [ ] 5.1 Failing test: a save to `build.javaVersion`/`build.mavenVersion` that fails with HTTP 503 and body `errorCode: 'RMS_UNAVAILABLE'` shows distinguishable "RMS is currently unavailable" messaging
- [ ] 5.2 Failing test: that messaging is distinct from the generic destructive "Save failed" toast
- [ ] 5.3 Failing test: a 503 with no `errorCode`, or a different `errorCode`, falls through to the existing generic "Save failed" toast
- [ ] 5.4 Failing test: a 503 on a save that does NOT touch `build.javaVersion`/`build.mavenVersion` falls through to the existing generic error handling, unchanged
- [ ] 5.5 Failing test: the Save control is enabled when a component's `javaVersion` carries a disagreement warning, same as when it doesn't
- [ ] 5.6 Failing test: saving an unrelated field succeeds even when the component's `javaVersion` currently carries a disagreement warning, with no client-side check performed against the warning
- [ ] 5.7 Implement: add an explicit 503 check in the save-error chain (`ComponentDetailPage.tsx`), scoped to a `build.javaVersion`/`build.mavenVersion` write, parsing the body with the existing `classifyConflictBody` (`lib/conflict.ts`) and dispatching on `errorCode === 'RMS_UNAVAILABLE'`
- [ ] 5.8 Confirm 5.5/5.6 pass without needing new code — i.e. confirm no existing or newly-added logic reads `javaWarnings`/`mavenWarnings` for Save-gating
- [ ] 5.9 Confirm the app's `QueryClient` still sets no mutation-level `retry` (`App.tsx`), so a 503 save is not silently retried; note the dependency in the test if a retry default is ever added
- [ ] 5.10 Verify the `build.javaVersion`/`build.mavenVersion` option values (`useFieldOptions`) round-trip byte-identically with stored values — a spelling difference (stored `1.8` vs option `8`) makes every save count as a change, which trips CRS's gate and turns an RMS outage into a 503 on a field the user never edited
- [ ] 5.11 Confirm tests pass

## 6. Docs and finalization

- [ ] 6.1 Extend `docs/features/component-list.md` describing the new ACTUAL rollup columns
- [ ] 6.2 Extend `docs/features/component-detail.md` (Build tab section) describing the new ACTUAL range/warning display
- [ ] 6.3 Cross-reference CRS's `registered-build-parameters` spec by name in both docs
- [ ] 6.4 Run `./gradlew qualityStatic`
- [ ] 6.5 Run the full frontend vitest suite
- [ ] 6.6 Once CRS's branch is on `main` and this is implemented against a real CRS instance: manual check — a Maven/Gradle component with recorded RC/RELEASE builds shows its rollup in the list and its full range/warning detail on the Build tab
- [ ] 6.7 Manual check: attempt a disagreeing save, confirm the 409 message
- [ ] 6.8 Manual check: if feasible, simulate RMS unavailability, confirm the 503 message
- [ ] 6.9 Fold this change's delta into `openspec/specs/registered-build-parameters/`
- [ ] 6.10 Move the change folder to `openspec/archive/`, per `openspec/config.yaml`'s archive operation
