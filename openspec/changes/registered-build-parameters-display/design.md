## Context

See proposal.md — Why. CRS exposes one response shape this change reads, plus two new write-time error responses, all already implemented on CRS's `rms-registered-build-params` branch (`openspec/changes/consume-rms-registered-build-version/` in that repo):

```text
ComponentDetailResponse.registeredBuildParameters:
RegisteredBuildParametersDetail {
  javaActualRanges:  [{ versionRange: string, value: string }]
  javaWarnings:      [{ subRange: string, actualValue: string }]
  mavenActualRanges: [{ versionRange: string, value: string }]
  mavenWarnings:     [{ subRange: string, actualValue: string }]
  actualDataUnavailable: boolean
}
```

- `registeredBuildParameters` is `null` on `ComponentDetailResponse` for a component that is:
  - archived;
  - not Maven/Gradle;
  - or whose RMS integration is disabled (CRS's requirements: "ACTUAL applies only to non-archived Maven and Gradle components"; "A disabled RMS integration turns the whole feature off").
- `actualDataUnavailable = true` is a distinct third state from `null` and from present-with-data — it means "this component is eligible but CRS has never successfully swept it," and must render differently from both.

CRS's write endpoints for `build.javaVersion`/`build.mavenVersion` (base-config `PATCH`, field-override create/update, bulk apply-plan) now return, only when the write actually changes one of those two fields, the same `ErrorResponse { errorMessage, errorCode }` body shape Portal already parses for 409s (`ErrorResponse.kt`, `ControllerExceptionHandler.kt`):
- `409` with `errorCode: "RMS_REGISTERED_VALUE_CONFLICT"` — the new value disagrees with a non-null, intersecting ACTUAL value. `errorMessage` names the conflicting range and ACTUAL value(s) (`RMSOverrideGate.check`).
- `503` with `errorCode: "RMS_UNAVAILABLE"` — the live RMS check was unreachable, timed out, or was ambiguous, so CRS failed closed. Today `503` is returned by CRS exclusively for this case (confirmed: no other handler in `ControllerExceptionHandler.kt` maps to `SERVICE_UNAVAILABLE`), but the response still carries `errorCode` — Portal dispatches on it rather than assuming "any 503 means RMS."

Portal already has a generic 409-dispatch mechanism (`useOptimisticConflict.ts`) and a status-agnostic body parser (`classifyConflictBody` in `lib/conflict.ts`, which parses `{ errorCode, errorMessage }` regardless of HTTP status) — both are reused rather than reinvented here. Portal also has a TeamCity-validation display precedent (`docs/features/tc-validation.md`) for "warning attached to otherwise-editable data."

## Goals / Non-Goals

**Goals:**
- Show the full ACTUAL range and disagreement detail on the Build tab, reusing the warning-badge visual language already in `FieldOverrideInline.tsx`.
- Give `RMS_REGISTERED_VALUE_CONFLICT` and RMS-unavailable (`503`) their own distinguishable, specific user-facing messaging, instead of letting either fall through to a generic toast.
- Keep the change strictly additive: no existing tab or save-error path changes shape for a component that has no ACTUAL data (`registeredBuildParameters: null`).

**Non-Goals:**
- Disabling or otherwise gating the `javaVersion`/`mavenVersion` controls client-side based on ACTUAL. CRS's write-time gate is the single source of enforcement; duplicating it here would be a second, driftable copy of a rule CRS already owns (the same class of risk CRS's own design.md calls out for its own gate placement).
- Persisting or caching ACTUAL client-side beyond the lifetime of the already-fetched detail response. Portal is not a second store for RMS data any more than CRS intends to be one for RMS itself (CRS's own non-goal).
- Any components-list change (Decision 1).

## Decisions

### 1. The components list needs no Portal change

CRS resolves the registered value into the `javaVersion` field it already returns on the summary, rather than exposing a separate rollup for Portal to merge. The list's column and its server-side "Java version" filter therefore stay consistent by construction, with no Portal-side coalescing and no risk of the filter selecting on one value while the column displays another. This change is detail-view and save-error handling only.

### 2. Detail-view: ACTUAL renders inline in the Build tab, not a new tab

- TeamCity validations get their own tab because they're a registry-wide, multi-component concern; ACTUAL is scoped to the one field it annotates, so it stays inline.
- ACTUAL ranges render as a read-only list under each of `javaVersion`/`mavenVersion`'s `FieldOverrideInline` — no add/edit/delete control of its own, unlike `FieldOverrideInline`'s own configured-range list.
- Range notation is formatted with the same helper the configured override list uses, so both read alike in one tab. Version values are not reformatted (see Risks).

### 3. Disagreement warnings are one per-attribute collapsed summary, not per-row badges

Two independent reasons, either of which alone rules out the per-row badge the ticket implies:

- **Attribution is impossible from the response.** `ActualDisagreement` carries only `{subRange, actualValue}`. CRS computes warnings as (every configured row) × (every ACTUAL range), and the BASE row spans all versions, so a BASE-derived and an override-derived warning can be byte-identical. Matching one back to a row would mean reimplementing range intersection and Java/Maven value comparison client-side — the duplication this design's Non-Goals rule out.
- **Warnings are normal, permanent, and unfixable.** BASE is compared against every ACTUAL range, so any component that ever built on two Java versions carries warnings forever; CRS documents DEFAULT becoming permanently unwritable in exactly that case. Per-row alerts would mark most long-lived components as permanently broken.

So: one summary per attribute, stating the count, expanding to the list. Portal never recomputes *which* ranges disagree.

**Entries are de-duplicated on (sub-range, ACTUAL value) before counting.** This follows from the same fact that rules out attribution: because CRS pairs every configured row against every ACTUAL range, and DEFAULT spans all versions, the same disagreement can arrive more than once — identically. Counting raw entries would tell the user more ranges disagree than actually do. De-duplicating is not recomputation: it drops exact repeats, it never decides anything about which ranges disagree.

Reuses `FieldOverrideInline`'s `renderConflictBadge` tone so the summary reads as the same class of thing as an override-range conflict.

### 4. `actualDataUnavailable` is its own alert, styled distinctly from a disagreement warning

- A disagreement warning means "checked, and it disagrees" — still an alert, not neutral.
- `actualDataUnavailable` means "we couldn't check" — also an alert (warning/error styling, e.g. an alert icon), not a plain neutral note.
- Both use alert styling; they use different wording/treatment from each other so they are never mistaken for one another.

### 5. 409/503 handling extends existing dispatch points

- `useOptimisticConflict.ts` already dispatches on `errorCode` for any 409 — add an `errorCode === 'RMS_REGISTERED_VALUE_CONFLICT'` branch there.
- `503` has no existing status-code branch anywhere in the save-error chain today — add it as its own explicit check in `ComponentDetailPage.tsx`, after the 409 and 400 branches and ahead of the generic destructive-toast fallback, not folded into `useOptimisticConflict` (that hook is gated to `err.status !== 409` and returns `null` for anything else).
- **Dispatch on the error code before any message-text heuristic.** The existing `kind: 'value'` branch guesses which field a 409 concerns by pattern-matching the server's message (`/jira|project\s*key/i`). CRS's RMS conflict message embeds the component's own key, so a component whose name contains a matched term — with that other field edited in the same save — would be routed to the wrong tab with the wrong banner. Handling the RMS code first makes the heuristic unreachable for it.
- **The refetch must not gate the message.** The 409 handler is `await`ed before the toast fires, so putting the refetch inside it would make the editor wait a round trip to learn the save failed. The message text comes from the response, never from refetched data, so the toast goes first and the refetch follows.
- The 503 body is parsed with the same `classifyConflictBody` helper already used for 409s (it is status-agnostic), checking for `errorCode === 'RMS_UNAVAILABLE'` rather than treating every 503 as RMS-related — CRS returns 503 only for this case today, but dispatching on the code (not the bare status) stays correct if that ever changes.
- **Depended-upon behaviour:** the app's `QueryClient` sets no mutation defaults, so mutations inherit TanStack's `retry: false`. A 503 save is therefore never silently retried. If mutation retries are ever turned on globally, this feature needs an explicit opt-out — a retried write is a second live RMS gate check, and a retry that succeeds after a transient outage hides the failure the user should have seen.

### 6. A conflict rejection triggers a refetch — unlike Portal's other value conflicts

- CRS refreshes its cached ACTUAL data for the component at the instant it rejects the write, using the same live data that caused the rejection. That refresh exists specifically so the UI can catch up.
- Portal's existing `kind: 'value'` 409 path deliberately does **not** refetch, on the reasoning that reloading cannot fix a value conflict. That reasoning does not hold here: the rejection is caused by *server-side data the display is behind on*, and a refetch is exactly what resolves the mismatch.
- So this conflict code refetches the component, while `UNIQUENESS_VIOLATION` continues not to.

**The refetch does not live in `useOptimisticConflict`.** That hook is the obvious home — it is where the optimistic path's own `refetchQueries` sits — but it is `await`ed before the caller shows the message, so a refetch placed there blocks the error toast behind a round trip (Decision 5). The hook classifies only; the caller shows the message and then fires the refetch. Putting it back in the hook is the likely implementation mistake here, and it would quietly break the "message is not delayed" requirement while every other test still passed.

**Why refetching does not destroy the editor's unsaved work.** This was checked rather than assumed, because "refetch" and "keep unsaved edits" look contradictory. They coexist only because every re-hydration path in this page is already guarded — a same-id refetch re-seeds nothing that is dirty:

- The page-level form reset is keyed on the component **id**, not the object, and returns early when the id is unchanged.
- The General tab's hydration effect does run on a new data object, but returns early if any field is dirty or touched.
- The shared section-snapshot hook re-seeds only when the id changed or the section is clean.
- The overrides draft is cleared only on an id change; a refetch reconciles it, pruning only queued ops the server has made redundant — queued creates are never dropped.

These guards exist because background refetches already happen routinely (`refetchOnWindowFocus` is on, `staleTime` 30s). This feature depends on them rather than adding its own protection, so a test must pin the behaviour: if a future refactor re-seeds a section on every data change, this requirement breaks silently and the user loses work on a rejected save.

**This also fixes what would otherwise be a gap regardless of the conflict path:** ACTUAL data is read straight from the fetched component and never copied into form or draft state, so it refreshes on any ordinary background refetch too, without ever interacting with unsaved edits.

### 7. No Save-button gating tied to `javaWarnings`/`mavenWarnings`

- CRS already permits an unrelated-field save regardless of an existing disagreement warning.
- Portal's Save control's enabled/disabled state and its client-side (RHF/Zod) validation SHALL NOT read `javaWarnings`/`mavenWarnings` at all — there is no new wiring to add here, only a rule to avoid introducing one.

### 8. Types are extended by hand in `types.ts`

- Per this repo's open TD-002 tech debt, `schema.d.ts` (generated from vendored `v4.json`) is not yet what application code imports — `types.ts` still is.
- This change follows that existing convention rather than pre-empting TD-002.
- `vendor-spec`/`generate-types` are re-run once CRS's branch reaches `main`, to keep the drift-check green and have the real shape ready for TD-002's eventual migration.

## Risks / Trade-offs

- **ACTUAL data has no staleness signal on the wire, so Portal will present stale data as current.** CRS refreshes on a scheduled sweep (4h by default) and, when a refresh fails, deliberately keeps the last known-good data rather than clearing it — setting an internal `refreshError` and leaving `actualDataUnavailable` at `false`. None of CRS's freshness fields (`generatedAt`, `lastAttemptAt`, `refreshError`) are exposed on any endpoint, so Portal cannot tell fresh data from arbitrarily stale data, and cannot warn the user. Mitigated only partially, and only after the fact, by the conflict-triggered refetch (Decision 6). Closing this properly needs a CRS-side endpoint exposing the report's freshness — out of scope here, and worth raising separately if the staleness proves visible in practice.
- **A rejected save discards every change in the request, across all tabs.** Portal sends one combined `PATCH` carrying every tab's edits plus the full field-override desired set, and CRS applies it in a single transaction. So one disagreeing Java override rejects an otherwise-unrelated batch of edits. Portal cannot make this partial — splitting the save into per-field requests would be a much larger change to how the detail page saves, and would trade atomicity for it. Handled by telling the user plainly (spec.md), not by changing the save shape.
- **Can't verify end-to-end until CRS merges.** `v4.json`/`schema.d.ts` don't carry `registeredBuildParameters` yet, and the `409`/`503` responses don't exist on any real CRS instance until CRS's `rms-registered-build-params` branch reaches `main`. Implementation proceeds against hand-written fixtures/mocks; a true integration check needs a CRS instance built from that branch.
- **The conflict-triggered refetch may not actually refresh anything.** CRS caches ACTUAL per instance, so under more than one replica the rejecting instance refreshes its own copy while Portal's follow-up request may be served by another whose cache is untouched. Portal has no influence over routing. Treated as best-effort correction rather than a guarantee (spec.md), and it degrades to today's behaviour — the display simply stays where it was.
- **Two separate "build warning" surfaces will coexist**: TeamCity's validation findings and this feature's ACTUAL-disagreement warnings — different wire shapes, different visual treatment, different owners. Accepted, not unified: they answer different questions (build-step misconfiguration vs. registered-value drift).
- **The rejection message does not say which field conflicted.** CRS's message names the component, the range and the disagreeing value, but not whether it was Java or Maven. Both are on the Build tab, so routing there is still correct, and the range narrows it in practice.
- **Two conflicting fields take two attempts.** CRS checks Java before Maven and throws on the first disagreement, so a save conflicting on both surfaces the Java one, and the Maven one only appears after that is fixed and resubmitted. Not worth pre-empting client-side — doing so would mean predicting the gate's outcome, which is the duplication this design avoids everywhere else.
- **Version values are shown verbatim.** Portal does not trim or normalize what CRS reports — the recorded value's format is guaranteed by the upstream service that records it. A value malformed enough to look wrong is a data problem to fix upstream, not to paper over in the UI.
