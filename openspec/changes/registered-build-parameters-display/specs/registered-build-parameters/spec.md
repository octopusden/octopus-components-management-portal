## Purpose

Defines how the component detail view displays CRS's RMS-registered ("ACTUAL") Java/Maven build data alongside a component's configured `javaVersion`/`mavenVersion` values, and how Portal surfaces the two save-time error responses CRS's write-time ACTUAL gate introduces.

This spec applies to the `registeredBuildParameters` data CRS attaches to `ComponentDetailResponse`, and to `build.javaVersion`/`build.mavenVersion` write responses.

The components list is out of scope: CRS resolves the registered value into the existing `javaVersion` field it already returns, so the list's column and its filter keep working unchanged and Portal needs no list-side change.

## ADDED Requirements

### Requirement: The detail view shows the ACTUAL range list per attribute, display-only

The Build tab SHALL display, for each of `javaVersion` and `mavenVersion`, the ACTUAL range list (`javaActualRanges`/`mavenActualRanges`) from `ComponentDetailResponse.registeredBuildParameters` when present. This range list is **display-only**: it SHALL carry no add, edit, or delete control of its own, and SHALL NOT alter, clear, or prevent editing of the underlying stored `javaVersion`/`mavenVersion` value.

#### Scenario: ACTUAL ranges are shown alongside the configured value

- **WHEN** a component's `registeredBuildParameters.javaActualRanges` is non-empty
- **THEN** the Build tab's Java section shows each range and its value

#### Scenario: The ACTUAL range list has no edit controls

- **WHEN** the Build tab renders `javaActualRanges`/`mavenActualRanges`
- **THEN** none of the rendered ranges has an add, edit, or delete affordance — the list is read-only, unlike the `FieldOverrideInline` list for the configured value

#### Scenario: The configured field stays editable regardless of ACTUAL display

- **WHEN** a component's `registeredBuildParameters.javaActualRanges` is non-empty
- **THEN** the configured `javaVersion` field and its overrides remain exactly as editable as they are today

#### Scenario: Ranges are rendered in the same notation as configured ranges

- **WHEN** the Build tab renders an ACTUAL range
- **THEN** it uses the same range formatting the configured override list uses, so the two read consistently in one tab

#### Scenario: An eligible component with nothing recorded shows no ACTUAL section

- **WHEN** `registeredBuildParameters` is present with `actualDataUnavailable: false` and every range and warning list empty — an eligible component CRS checked successfully, for which RMS has recorded nothing
- **THEN** the Build tab shows no ACTUAL ranges, no disagreement summary, and no unavailable alert — it renders as it does for a component with no ACTUAL data at all

#### Scenario: Unavailable data is shown as its own alert, distinct from a disagreement warning

- **WHEN** `registeredBuildParameters.actualDataUnavailable` is `true`
- **THEN** the Build tab shows an "ACTUAL data unavailable" alert — using warning/error styling (e.g. an alert icon), not a plain neutral note — with wording and styling distinguishable from a disagreement warning, so the two are never mistaken for each other

### Requirement: Disagreement warnings are shown per attribute as one collapsed summary, not per configured row

`javaWarnings`/`mavenWarnings` SHALL be shown as a single summary for their attribute, stating how many ranges disagree, and expanding on demand to list each disagreement's sub-range and ACTUAL value. Warnings SHALL NOT be attached to individual DEFAULT/OVERRIDDEN rows.

Entries SHALL be de-duplicated on their (sub-range, ACTUAL value) pair before being counted or listed. CRS reports one entry per (configured row × ACTUAL range) pair, and two different configured rows can produce byte-identical entries — most commonly the DEFAULT row and an override covering the same territory, both disagreeing with the same ACTUAL range. Counting raw entries would report more disagreeing ranges than exist.

Two reasons this is a per-attribute summary rather than a per-row badge:

- A warning identifies only the sub-range and ACTUAL value; it does not identify which configured row produced it, and two different rows can produce identical entries. Attributing one to a row is not possible from the response alone.
- Because the DEFAULT row spans all versions, it is compared against every ACTUAL range. Any component that has built on more than one Java version therefore carries warnings permanently, and no edit can clear them. A collapsed summary keeps that from dominating the tab.

Portal SHALL NOT recompute or re-derive *which* ranges disagree — the set of disagreements is taken from the response as given, and their version values are shown verbatim. Only the range notation is formatted, matching the configured override list (see the range-notation scenario above).

#### Scenario: Several disagreements collapse into one summary

- **WHEN** `registeredBuildParameters.javaWarnings` contains three entries with distinct (sub-range, ACTUAL value) pairs
- **THEN** the Build tab's Java section shows one summary indicating three disagreeing ranges, not three separate warnings, and no warning marker appears on any configured row

#### Scenario: Identical entries are counted once

- **WHEN** `javaWarnings` contains two entries with the same sub-range and the same ACTUAL value, and one other distinct entry
- **THEN** the summary reports two disagreeing ranges, and expanding it lists two, not three

#### Scenario: Expanding the summary lists each disagreement

- **WHEN** an editor expands the Java disagreement summary
- **THEN** each entry is listed with its sub-range and ACTUAL value — the same entries the response reported, with no disagreement added, dropped, or re-derived

#### Scenario: No disagreements shows no summary

- **WHEN** `registeredBuildParameters.javaWarnings` is empty
- **THEN** the Build tab's Java section shows no disagreement summary at all

#### Scenario: Attributes are summarized independently

- **WHEN** `javaWarnings` is non-empty and `mavenWarnings` is empty
- **THEN** only the Java section shows a disagreement summary

### Requirement: No client-side edit restriction is introduced by ACTUAL data

Displaying ACTUAL data, including a disagreement summary, SHALL NOT disable, hide, or otherwise restrict the `javaVersion`/`mavenVersion` DEFAULT or OVERRIDDEN edit controls.

#### Scenario: Rows stay editable while a disagreement summary is shown

- **WHEN** a component's `javaWarnings` is non-empty, so the Java section shows a disagreement summary
- **THEN** every `javaVersion` override row remains as usable as any other field override — add, edit, and delete are all still available

### Requirement: A conflicting write is reported with a specific message

A `409` response with `errorCode: "RMS_REGISTERED_VALUE_CONFLICT"` on a `build.javaVersion`/`build.mavenVersion` write SHALL be shown to the editor with a message distinct from the generic "Save failed" message used for other non-lock 409s, using the server-provided `errorMessage`.

Because CRS applies the whole component `PATCH` — every tab's changes and the full field-override desired set — in one transaction, this rejection discards **all** of them, not only the conflicting field. The message SHALL say so, so an editor does not assume the rest of their edits were saved.

The conflicting value is edited on the Build tab, so this rejection SHALL surface there: the save-review dialog closes and the Build tab is shown with the message inline, the same treatment an existing Jira-pair conflict already gets.

This SHALL be decided by the `errorCode`, **before** any message-text heuristic runs. Portal's existing routing guesses which field a conflict concerns by pattern-matching the server's message; CRS's message here embeds the component's own key, so a component whose name contains a word that heuristic looks for would otherwise be misrouted to an unrelated tab.

#### Scenario: The conflict is routed by error code, not by message text

- **WHEN** a save is rejected with `errorCode: "RMS_REGISTERED_VALUE_CONFLICT"` for a component whose name happens to contain a term another routing rule matches on, and that other field was edited in the same save
- **THEN** the rejection is still routed to the Build tab as an RMS conflict — the error code decides, and no message-text rule is consulted

#### Scenario: Saving a disagreeing Java version is reported specifically

- **WHEN** a save attempt returns `409` with `errorCode: "RMS_REGISTERED_VALUE_CONFLICT"`
- **THEN** the editor sees a message specific to this conflict (not the generic "Save failed" text used for other conflict codes), built from the server's `errorMessage`

#### Scenario: The editor is told nothing was saved

- **WHEN** an editor changes fields on several tabs and the save is rejected with `RMS_REGISTERED_VALUE_CONFLICT`
- **THEN** the message states that no changes were saved, and the editor's unsaved changes remain in the form so they can correct the conflicting value and retry

### Requirement: A conflict rejection refreshes the component's displayed ACTUAL data

CRS refreshes its cached ACTUAL data for a component at the moment it rejects a write with `RMS_REGISTERED_VALUE_CONFLICT`, using the live data that caused the rejection. Portal SHALL refetch that component after such a rejection, so the ranges and warnings on screen reflect the data the rejection cited.

This is deliberately different from Portal's handling of other value-conflict `409`s (e.g. a uniqueness violation), where refetching cannot help and is intentionally skipped.

The refetch SHALL NOT delay the conflict message. The editor learns the save failed first; the displayed ACTUAL data catches up when the refetch returns. The message's own text comes from the response, not from the refetched data, so nothing about it needs to wait.

The refetch SHALL NOT disturb the editor's unsaved work. This is possible because ACTUAL data is read straight from the fetched component and never mirrored into form or draft state — so refreshing it updates the displayed ranges and summary without touching any edited field. The refetch is best-effort: if it fails, the conflict message SHALL still be shown, and its failure SHALL NOT replace or obscure that message.

#### Scenario: The message appears before the refetch completes

- **WHEN** a save is rejected with this conflict and the follow-up refetch is slow
- **THEN** the conflict message is already shown — the editor does not wait on the refetch to learn the save failed

#### Scenario: The display catches up after a rejection

- **WHEN** a save is rejected with `errorCode: "RMS_REGISTERED_VALUE_CONFLICT"` citing an ACTUAL value the displayed ranges did not show
- **THEN** Portal refetches the component, and the Build tab then shows the ACTUAL range and warning that caused the rejection

#### Scenario: The refetch preserves unsaved edits

- **WHEN** an editor has unsaved changes on several tabs, including queued field-override rows, and the save is rejected with this conflict
- **THEN** the refetch updates the displayed ACTUAL data while every unsaved change remains exactly as the editor left it

#### Scenario: A failed refetch does not mask the conflict

- **WHEN** the post-rejection refetch itself fails
- **THEN** the editor still sees the conflict message, and the stale ACTUAL data is left on screen rather than cleared

### Requirement: An RMS-unavailable write failure is reported distinctly from a generic save failure

A `503` response with `errorCode: "RMS_UNAVAILABLE"` from the component `PATCH` SHALL be shown to the editor with messaging that identifies the cause as RMS being temporarily unreachable, distinct from the generic destructive "Save failed" toast used for unclassified errors. A `503` without this `errorCode` SHALL be treated as an unclassified error, not as RMS-unavailable.

The `errorCode` alone decides this — Portal SHALL NOT additionally check whether the save touched `javaVersion`/`mavenVersion`. CRS raises this error only from its write-time gate, and that gate only runs when one of those fields actually changes, so the code already implies the condition. Inspecting the submitted request to re-derive it would duplicate a rule the server has already applied.

This applies to the component `PATCH` error path — the only request Portal makes that CRS gates against RMS. (CRS also gates its single-field-override endpoints, which Portal does not call; if Portal ever starts calling them, they need the same handling.) The separate supported-versions request issued after a successful `PATCH` has its own "Partly saved" failure path, which this requirement does not change.

#### Scenario: RMS is unreachable at write time

- **WHEN** a save attempt returns `503` with `errorCode: "RMS_UNAVAILABLE"`
- **THEN** the editor sees messaging identifying RMS as temporarily unavailable, rather than the generic "Save failed" toast

#### Scenario: An unrelated 503 is not misattributed to RMS

- **WHEN** a save attempt returns `503` without `errorCode: "RMS_UNAVAILABLE"` (or with no `errorCode` at all)
- **THEN** the editor sees the generic destructive "Save failed" toast, not the RMS-unavailable message

### Requirement: An ACTUAL disagreement warning introduces no client-side Save gating

CRS already permits a save that does not change `javaVersion`/`mavenVersion` regardless of any existing ACTUAL disagreement. Portal SHALL NOT add any client-side gating on top of that — the Save control SHALL NOT be disabled, and no client-side validation error SHALL be raised, because of an existing `javaWarnings`/`mavenWarnings` entry.

#### Scenario: The Save control stays enabled despite an existing disagreement

- **WHEN** a component's `javaWarnings` is non-empty
- **THEN** the Save control is enabled exactly as it would be with an empty list — its enabled state does not depend on `javaWarnings`/`mavenWarnings`

#### Scenario: Saving an unrelated field is not intercepted client-side

- **WHEN** a component's `javaWarnings` is non-empty and an editor saves a change to a different field without touching `javaVersion`/`mavenVersion`
- **THEN** Portal submits the save without any client-side check against the warnings, and the save succeeds
