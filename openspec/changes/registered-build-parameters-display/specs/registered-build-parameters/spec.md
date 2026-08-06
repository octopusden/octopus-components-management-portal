## Purpose

Defines how Portal displays CRS's RMS-registered ("ACTUAL") Java/Maven build data alongside a component's configured `javaVersion`/`mavenVersion` values, and how Portal surfaces the two save-time error responses CRS's write-time ACTUAL gate introduces. 

This spec applies to the `registeredBuildParameters` data CRS attaches to `ComponentSummaryResponse`/`ComponentDetailResponse`, and to `build.javaVersion`/`build.mavenVersion` write responses.

## ADDED Requirements

### Requirement: The list view's Java column prefers the ACTUAL rollup over the configured value

The existing Java Version column SHALL show `registeredBuildParameters.java` when it is a non-null string. When it is absent (`registeredBuildParameters` is `null`, or `java` is `null`), the column SHALL show the configured `javaVersion` value as it does today — a Badge if set, an em-dash if not.

The value is shown as one plain value, with no marker distinguishing an ACTUAL-sourced value from a configured one.

CRS reports the version string exactly as RMS recorded it, which can carry detail no other version in the UI shows (e.g. `17.0.9`). The column SHALL trim it for display:

| Recorded | Shown | Rule |
|---|---|---|
| `17` | `17` | unchanged |
| `17.0.9` | `17` | trim to the leading version number |
| `1.8` | `1.8` | legacy `1.X` spelling is preserved, never rewritten to `8` |
| `1.8.0_292` | `1.8` | trim to the legacy `1.X` spelling |
| anything unparseable | verbatim | never hide a value Portal cannot interpret |

#### Scenario: A recorded ACTUAL value takes over the column

- **WHEN** a component's `registeredBuildParameters.java` is a non-null string
- **THEN** the Java Version column shows that value, regardless of the component's configured `javaVersion`

#### Scenario: A patch-level version is trimmed

- **WHEN** a component's `registeredBuildParameters.java` is `17.0.9`
- **THEN** the Java Version column shows `17`

#### Scenario: A legacy 1.X spelling is preserved

- **WHEN** a component's `registeredBuildParameters.java` is `1.8`
- **THEN** the Java Version column shows `1.8`, not `8`

#### Scenario: An uninterpretable value is shown as-is

- **WHEN** a component's `registeredBuildParameters.java` cannot be read as a version number
- **THEN** the Java Version column shows it verbatim rather than hiding it or showing an em-dash

#### Scenario: No ACTUAL value falls back to the configured value

- **WHEN** a component's `registeredBuildParameters` is `null`, or is present with `java: null`
- **THEN** the Java Version column shows the configured `javaVersion` value, exactly as it does today

#### Scenario: A recently-archived component may still show a rollup in the list

- **WHEN** a component was archived after CRS's last ACTUAL refresh, so its summary response still carries a rollup while its detail response carries none
- **THEN** the list shows the rollup and the detail view shows no ACTUAL data — Portal renders each response as given and SHALL NOT attempt to reconcile the two

### Requirement: The detail view shows ACTUAL ranges and warnings per attribute, display-only

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

#### Scenario: Unavailable data is shown as its own alert, distinct from a disagreement warning

- **WHEN** `registeredBuildParameters.actualDataUnavailable` is `true`
- **THEN** the Build tab shows an "ACTUAL data unavailable" alert — using warning/error styling (e.g. an alert icon), not a plain neutral note — with wording and styling distinguishable from a disagreement warning, so the two are never mistaken for each other

### Requirement: Disagreement warnings are shown per attribute as one collapsed summary, not per configured row

`javaWarnings`/`mavenWarnings` SHALL be shown as a single summary for their attribute, stating how many ranges disagree, and expanding on demand to list each disagreement's sub-range and ACTUAL value. Warnings SHALL NOT be attached to individual DEFAULT/OVERRIDDEN rows.

Two reasons this is a per-attribute summary rather than a per-row badge:

- A warning identifies only the sub-range and ACTUAL value; it does not identify which configured row produced it, and two different rows can produce identical entries. Attributing one to a row is not possible from the response alone.
- Because the DEFAULT row spans all versions, it is compared against every ACTUAL range. Any component that has built on more than one Java version therefore carries warnings permanently, and no edit can clear them. A collapsed summary keeps that from dominating the tab.

Warnings SHALL be shown verbatim from the response — Portal does not recompute, re-derive, or reformat which ranges disagree.

#### Scenario: Several disagreements collapse into one summary

- **WHEN** `registeredBuildParameters.javaWarnings` contains three entries
- **THEN** the Build tab's Java section shows one summary indicating three disagreeing ranges, not three separate warnings, and no warning marker appears on any configured row

#### Scenario: Expanding the summary lists each disagreement

- **WHEN** an editor expands the Java disagreement summary
- **THEN** each entry is listed with its sub-range and ACTUAL value, exactly as the response reported them

#### Scenario: No disagreements shows no summary

- **WHEN** `registeredBuildParameters.javaWarnings` is empty
- **THEN** the Build tab's Java section shows no disagreement summary at all

#### Scenario: Attributes are summarized independently

- **WHEN** `javaWarnings` is non-empty and `mavenWarnings` is empty
- **THEN** only the Java section shows a disagreement summary

### Requirement: No client-side edit restriction is introduced by ACTUAL data

Displaying ACTUAL data, including a disagreement warning, SHALL NOT disable, hide, or otherwise restrict the `javaVersion`/`mavenVersion` DEFAULT or OVERRIDDEN edit controls.

#### Scenario: A warned field stays editable

- **WHEN** a component's stored `javaVersion` override is shown with a disagreement warning
- **THEN** the override's edit control remains as usable as any other field override — add, edit, and delete are all still available

### Requirement: A conflicting write is reported with a specific message

A `409` response with `errorCode: "RMS_REGISTERED_VALUE_CONFLICT"` on a `build.javaVersion`/`build.mavenVersion` write SHALL be shown to the editor with a message distinct from the generic "Save failed" message used for other non-lock 409s, using the server-provided `errorMessage`.

Because CRS applies the whole component `PATCH` — every tab's changes and the full field-override desired set — in one transaction, this rejection discards **all** of them, not only the conflicting field. The message SHALL say so, so an editor does not assume the rest of their edits were saved.

#### Scenario: Saving a disagreeing Java version is reported specifically

- **WHEN** a save attempt returns `409` with `errorCode: "RMS_REGISTERED_VALUE_CONFLICT"`
- **THEN** the editor sees a message specific to this conflict (not the generic "Save failed" text used for other conflict codes), built from the server's `errorMessage`

#### Scenario: The editor is told nothing was saved

- **WHEN** an editor changes fields on several tabs and the save is rejected with `RMS_REGISTERED_VALUE_CONFLICT`
- **THEN** the message states that no changes were saved, and the editor's unsaved changes remain in the form so they can correct the conflicting value and retry

### Requirement: A conflict rejection refreshes the component's displayed ACTUAL data

CRS refreshes its cached ACTUAL data for a component at the moment it rejects a write with `RMS_REGISTERED_VALUE_CONFLICT`, using the live data that caused the rejection. Portal SHALL refetch that component after such a rejection, so the ranges and warnings on screen reflect the data the rejection cited.

This is deliberately different from Portal's handling of other value-conflict `409`s (e.g. a uniqueness violation), where refetching cannot help and is intentionally skipped.

#### Scenario: The display catches up after a rejection

- **WHEN** a save is rejected with `errorCode: "RMS_REGISTERED_VALUE_CONFLICT"` citing an ACTUAL value the displayed ranges did not show
- **THEN** Portal refetches the component, and the Build tab then shows the ACTUAL range and warning that caused the rejection

### Requirement: An RMS-unavailable write failure is reported distinctly from a generic save failure

A `503` response with `errorCode: "RMS_UNAVAILABLE"` from the component `PATCH` SHALL be shown to the editor with messaging that identifies the cause as RMS being temporarily unreachable, distinct from the generic destructive "Save failed" toast used for unclassified errors. A `503` without this `errorCode` SHALL be treated as an unclassified error, not as RMS-unavailable.

This applies to the component `PATCH` error path only — the sole path on which CRS can return this error. The separate supported-versions request issued after a successful `PATCH` has its own "Partly saved" failure path, which this requirement does not change.

#### Scenario: RMS is unreachable at write time

- **WHEN** a save attempt to `build.javaVersion` or `build.mavenVersion` returns `503` with `errorCode: "RMS_UNAVAILABLE"`
- **THEN** the editor sees messaging identifying RMS as temporarily unavailable, rather than the generic "Save failed" toast

#### Scenario: An unrelated 503 is not misattributed to RMS

- **WHEN** a save attempt returns `503` without `errorCode: "RMS_UNAVAILABLE"` (or with no `errorCode` at all)
- **THEN** the editor sees the generic destructive "Save failed" toast, not the RMS-unavailable message

#### Scenario: A 503 on an unrelated field save is unaffected

- **WHEN** a save attempt that does not touch `build.javaVersion`/`build.mavenVersion` fails for any reason
- **THEN** it is handled by the existing generic error path, unchanged by this requirement

### Requirement: An ACTUAL disagreement warning introduces no client-side Save gating

CRS already permits a save that does not change `javaVersion`/`mavenVersion` regardless of any existing ACTUAL disagreement. Portal SHALL NOT add any client-side gating on top of that — the Save control SHALL NOT be disabled, and no client-side validation error SHALL be raised, because of an existing `javaWarnings`/`mavenWarnings` entry.

#### Scenario: The Save control stays enabled despite an existing warning

- **WHEN** a component's `javaVersion` is shown with a disagreement warning
- **THEN** the Save control is enabled exactly as it would be with no warning present — its enabled state does not depend on `javaWarnings`/`mavenWarnings`

#### Scenario: Saving an unrelated field is not intercepted client-side

- **WHEN** a component's `javaVersion` is shown with a disagreement warning, and an editor saves a change to a different field without touching `javaVersion`/`mavenVersion`
- **THEN** Portal submits the save without any client-side check against the warning, and the save succeeds
