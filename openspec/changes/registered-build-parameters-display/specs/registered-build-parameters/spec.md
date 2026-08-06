## Purpose

Defines how Portal displays CRS's RMS-registered ("ACTUAL") Java/Maven build data alongside a component's configured `javaVersion`/`mavenVersion` values, and how Portal surfaces the two save-time error responses CRS's write-time ACTUAL gate introduces. 

This spec applies to the `registeredBuildParameters` data CRS attaches to `ComponentSummaryResponse`/`ComponentDetailResponse`, and to `build.javaVersion`/`build.mavenVersion` write responses.

## ADDED Requirements

### Requirement: The list view's Java column prefers the ACTUAL rollup over the configured value

The existing Java Version column SHALL show `registeredBuildParameters.java` when it is a non-null string. When it is absent (`registeredBuildParameters` is `null`, or `java` is `null`), the column SHALL show the configured `javaVersion` value as it does today — a Badge if set, an em-dash if not.

#### Scenario: A recorded ACTUAL value takes over the column

- **WHEN** a component's `registeredBuildParameters.java` is a non-null string
- **THEN** the Java Version column shows that value, regardless of the component's configured `javaVersion`

#### Scenario: No ACTUAL value falls back to the configured value

- **WHEN** a component's `registeredBuildParameters` is `null`, or is present with `java: null`
- **THEN** the Java Version column shows the configured `javaVersion` value, exactly as it does today

### Requirement: The detail view shows ACTUAL ranges and warnings per attribute, display-only

The Build tab SHALL display, for each of `javaVersion` and `mavenVersion`, the ACTUAL range list (`javaActualRanges`/`mavenActualRanges`) from `ComponentDetailResponse.registeredBuildParameters` when present. This range list is **display-only**: it SHALL carry no add, edit, or delete control of its own, and SHALL NOT alter, clear, or prevent editing of the underlying stored `javaVersion`/`mavenVersion` value.

Any entry in `javaWarnings`/`mavenWarnings` SHALL be shown as a warning naming the sub-range and ACTUAL value it reports, attached to the DEFAULT or OVERRIDDEN row it concerns.

#### Scenario: ACTUAL ranges are shown alongside the configured value

- **WHEN** a component's `registeredBuildParameters.javaActualRanges` is non-empty
- **THEN** the Build tab's Java section shows each range and its value

#### Scenario: The ACTUAL range list has no edit controls

- **WHEN** the Build tab renders `javaActualRanges`/`mavenActualRanges`
- **THEN** none of the rendered ranges has an add, edit, or delete affordance — the list is read-only, unlike the `FieldOverrideInline` list for the configured value

#### Scenario: The configured field stays editable regardless of ACTUAL display

- **WHEN** a component's `registeredBuildParameters.javaActualRanges` is non-empty
- **THEN** the configured `javaVersion` field and its overrides remain exactly as editable as they are today

#### Scenario: A disagreement is shown as a named warning, not an error

- **WHEN** `registeredBuildParameters.javaWarnings` contains an entry for a stored OVERRIDDEN row
- **THEN** that row is shown with a warning naming the disagreeing sub-range and ACTUAL's value, and the row remains fully editable

#### Scenario: Unavailable data is shown as its own alert, distinct from a disagreement warning

- **WHEN** `registeredBuildParameters.actualDataUnavailable` is `true`
- **THEN** the Build tab shows an "ACTUAL data unavailable" alert — using warning/error styling (e.g. an alert icon), not a plain neutral note — with wording and styling distinguishable from a disagreement warning, so the two are never mistaken for each other

### Requirement: No client-side edit restriction is introduced by ACTUAL data

Displaying ACTUAL data, including a disagreement warning, SHALL NOT disable, hide, or otherwise restrict the `javaVersion`/`mavenVersion` DEFAULT or OVERRIDDEN edit controls.

#### Scenario: A warned field stays editable

- **WHEN** a component's stored `javaVersion` override is shown with a disagreement warning
- **THEN** the override's edit control remains as usable as any other field override — add, edit, and delete are all still available

### Requirement: A conflicting write is reported with a specific message

A `409` response with `errorCode: "RMS_REGISTERED_VALUE_CONFLICT"` on a `build.javaVersion`/`build.mavenVersion` write SHALL be shown to the editor with a message distinct from the generic "Save failed" message used for other non-lock 409s, using the server-provided `errorMessage`.

#### Scenario: Saving a disagreeing Java version is reported specifically

- **WHEN** a save attempt returns `409` with `errorCode: "RMS_REGISTERED_VALUE_CONFLICT"`
- **THEN** the editor sees a message specific to this conflict (not the generic "Save failed" text used for other conflict codes), built from the server's `errorMessage`

### Requirement: An RMS-unavailable write failure is reported distinctly from a generic save failure

A `503` response from a `build.javaVersion`/`build.mavenVersion` write SHALL be shown to the editor with messaging that identifies the cause as RMS being temporarily unreachable, distinct from the generic destructive "Save failed" toast used for unclassified errors.

#### Scenario: RMS is unreachable at write time

- **WHEN** a save attempt to `build.javaVersion` or `build.mavenVersion` returns `503`
- **THEN** the editor sees messaging identifying RMS as temporarily unavailable, rather than the generic "Save failed" toast

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
