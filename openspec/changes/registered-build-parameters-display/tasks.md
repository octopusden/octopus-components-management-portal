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

- [x] 3.1 Failing test: a 409 with `errorCode: 'RMS_REGISTERED_VALUE_CONFLICT'` yields its own classified conflict. **Deviation from the literal task wording:** implemented as a distinct `kind: 'rms'` (not `'value'`) — `ClassifiedConflict.kind` is now `'value' | 'optimistic' | 'rms'`. A shared `'value'` kind would still require a guard to keep the Jira message-text heuristic from running; a separate kind makes that heuristic structurally unreachable for this conflict, which is a stronger form of the same "errorCode decides, not message text" rule design.md Decision 5 already calls for. `useOptimisticConflict.test.tsx`.
- [x] 3.2 Failing test: that conflict's title/description is distinct from the generic "Save failed" branch, and uses the server's `errorMessage`
- [x] 3.3 Implement: add a dedicated `errorCode === 'RMS_REGISTERED_VALUE_CONFLICT'` branch in `useOptimisticConflict.ts`, ahead of the generic fallback
- [x] 3.4 Failing test: the conflict message states that no changes were saved (`/no changes were saved/i` in the description)
- [x] 3.5 Failing test: a save that fails with this conflict closes the review dialog and shows the Build tab with the message inline (mirroring the existing Jira-conflict routing, ~L604-615). `ComponentDetailPage.test.tsx` — verified via the `BuildTab` mock's exposed `conflictError` data attribute, since `kind: 'rms'` is dispatched before the `'value'`/Jira branch is even reached.
- [x] 3.6 Failing test: routing is decided by `errorCode` before the `/jira|project\s*key/i` message heuristic — a component whose name matches that pattern, saved alongside a Jira-pair edit, still routes to the Build tab
- [x] 3.7 Implement the routing and the message, placing the RMS branch ahead of the Jira heuristic (structurally guaranteed by 3.1's `kind: 'rms'` deviation, not just ordering)
- [x] 3.8 Failing test: this conflict refetches the component (asserted via a `refetchQueries` spy on the page's `QueryClient` — not a full re-render of refreshed ACTUAL data, since `ComponentDetailPage.test.tsx` mocks `useComponent` directly rather than driving it through a real query)
- [x] 3.9 Failing test: a `UNIQUENESS_VIOLATION` 409 still does NOT refetch — the new refetch is scoped to this error code only
- [x] 3.10 Failing test: the conflict message appears while the refetch is still pending. **Corrected on review:** the first version asserted the banner had rendered before asserting the refetch spy, which proved nothing — both happen eventually under either ordering, and it was verified to still pass against an implementation that `await`ed the refetch. It now stubs `refetchQueries` with a promise that never settles, so an awaited refetch leaves the banner unrendered. Confirmed to fail against a deliberately-awaited implementation before being kept.
- [ ] 3.11 Not separately tested: unsaved edits across tabs surviving the refetch depends entirely on this page's pre-existing re-hydration guards (id-keyed form reset, dirty/touched guard, section-snapshot clean guard, overrides-draft reconciliation), none of which this change touches. `GeneralTab` is mocked in `ComponentDetailPage.test.tsx`, so exercising the real guards meaningfully needs a heavier harness than this task justifies on its own; flagged here rather than silently skipped.
- [x] 3.12 Failing test: a refetch that itself fails (rejected `refetchQueries`) still shows the conflict message — the rejection is swallowed (`.catch(() => {})`) and the message/routing already fired before the refetch settles
- [x] 3.12a (added on review) The 409 fixtures now mirror CRS's real message shape — ending in a joined `range=value` list with no terminating punctuation. The originals ended in a period, which hid the appended "No changes were saved." running straight on from the server text; the handler now inserts the sentence break and a test asserts it.
- [ ] 3.13 Not separately tested: "refetch returns unchanged data is not an error" is true by construction — the refetch is a plain `refetchQueries` call with no diffing/comparison logic added, so there is no code path that could treat unchanged data as a failure.
- [x] 3.14 Implement the refetch in the caller (`ComponentDetailPage.tsx`'s catch block), fired with `void ...catch(() => {})` after the toast/routing — NOT inside `useOptimisticConflict`, which is awaited before the toast and would delay it (design.md Decision 6)
- [x] 3.15 True by construction: `ActualBuildParameters` (§2) reads `registeredBuildParameters` straight from the `ComponentDetail` passed down through `useBuildSection`/`BuildTab` — no form or draft state is involved anywhere in that path.
- [x] 3.16 Confirm tests pass — `useOptimisticConflict.test.tsx` (10/10), `ComponentDetailPage.test.tsx` (83/83, incl. 5 new RMS-conflict tests). `tsc --noEmit` and `eslint . --max-warnings 0` both clean.

## 4. 503 — RMS unavailable

- [x] 4.1 Failing test: a save that fails with HTTP 503 and body `errorCode: 'RMS_UNAVAILABLE'` shows distinguishable messaging (title "Registered build data unavailable", not the generic "Save failed")
- [x] 4.2 Failing test: that messaging is distinct from the generic destructive "Save failed" toast
- [x] 4.3 Failing test: a 503 with no `errorCode`, or a different `errorCode`, falls through to the existing generic "Save failed" toast
- [x] 4.4 Implement: add an explicit 503 check in the save-error chain (`ComponentDetailPage.tsx`), after the 409/400 branches and ahead of the generic fallback, parsing the body with the existing `classifyConflictBody` (`lib/conflict.ts`) and dispatching on `errorCode === 'RMS_UNAVAILABLE'` alone — no additional check of which fields the save touched
- [x] 4.5 Confirmed: `App.tsx`'s `QueryClient` sets `defaultOptions.queries` only (`staleTime`/`retry: 1`) — no `mutations` key at all, so mutations keep TanStack's own default (`retry: 0`); a 503 save is not silently retried. No test added (nothing in this change alters that default); flagged as a dependency here per the task.
- [x] 4.6 Verified, no code change: `useFieldOptions`' `build.javaVersion`/`build.mavenVersion` option lists (`/components/meta/java-versions`, `/components/meta/maven-versions`) and the stored BASE-row value both originate from CRS in the same wire format — there is no separate Portal-side normalization step between them that could introduce a spelling drift (e.g. `1.8` vs `8`). The risk described in design.md's Risks is defensive/hypothetical, not an observed mismatch.
- [x] 4.7 Confirm tests pass — `ComponentDetailPage.test.tsx` (83/83, incl. 3 new 503 tests). Toast assertions needed converting the module's `useToast` mock from a fresh `vi.fn()` per render to a `vi.hoisted` stable spy (`mockToast`) — no existing test asserted toast content before this, so the change is additive.

## 5. No client-side Save gating

- [x] 5.1 Test: the Save control enables on an unrelated edit exactly as it would with no disagreement, for a component whose `javaWarnings` is non-empty
- [x] 5.2 Test: saving that unrelated field succeeds, with no client-side check performed against the warning
- [x] 5.3 Confirmed 5.1/5.2 pass without any new code: `dirty` (`ComponentDetailPage.tsx`) is computed purely from each section's own diff (`anyDirty(slices)` + `supportedVersionsSection.isDirty`); `useBuildSection`'s `BuildState`/snapshot deep-compare never includes `registeredBuildParameters`. `SaveBar`'s `blockedReason` chain (fieldConfigLoading / ownerValidating / ownershipIssues / mavenPrefixIssues / vcsHostIssues) has no branch referencing `javaWarnings`/`mavenWarnings` either. Both tests passed on the first run — no red-green cycle, since there was nothing to make green. `ComponentDetailPage.test.tsx` (2 new tests, 86/86 total).

## 6. Docs and finalization

- [x] 6.1 Extended `docs/features/component-detail.md`: new "Build tab — registered build parameters (ACTUAL)" section + a "Save-time RMS conflict / unavailable" subsection (mirroring the existing "Optimistic-locking conflict UX" doc pattern), plus a one-line pointer added to the Tabs summary table.
- [x] 6.2 Cross-referenced CRS's `registered-build-parameters` spec by name in the new doc section.
- [x] 6.3 **Task name doesn't match reality** — no `qualityStatic` Gradle task exists in this repo (checked `build.gradle.kts` and all `.kts`/`.gradle` files). Ran the actual static-check tasks instead: `./gradlew ktlintCheck detekt` — `BUILD SUCCESSFUL`. No backend/Kotlin file was touched by this change, so this simply confirms no pre-existing drift; the printed ktlint findings are all in files this change never touched (`OnboardingVideoServiceTest.kt`, `ServiceEventClientTest.kt`, `ValidationServiceTest.kt`), pre-existing and out of scope.
- [x] 6.4 Full frontend vitest suite: 171 files / 2412 tests green. `tsc --noEmit` and `eslint . --max-warnings 0` both clean (re-confirmed after the docs pass, which touched no source).
- [ ] 6.5 **Blocked, needs a human + a real CRS instance.** Manual check — a Maven/Gradle component with recorded RC/RELEASE builds shows its full range/warning detail on the Build tab. Cannot be done from here: needs CRS's `rms-registered-build-params` branch merged to CRS `main`, then a running CRS + Portal pair with real RMS-backed data.
- [ ] 6.6 **Blocked, same as 6.5.** Manual check: attempt a disagreeing save, confirm the 409 message.
- [ ] 6.7 **Blocked, same as 6.5.** Manual check: if feasible, simulate RMS unavailability, confirm the 503 message.
- [ ] 6.8 **Deliberately held.** Folding the delta into `openspec/specs/registered-build-parameters/` reads as "this shipped and was verified" — doing that before 6.5-6.7 pass would misrepresent the change's status. Do this once those manual checks are done.
- [ ] 6.9 **Deliberately held**, same reasoning as 6.8 — archiving is the last step, after 6.8.
