## Why

- CRS now records the Java/Maven version RMS actually registered for a component's builds (**ACTUAL**), alongside the DEFAULT/OVERRIDDEN values Portal already lets an editor configure.
- Portal shows only the configured side today. An editor has no way to see whether their configured value matches what was actually built.
- The list view has no way to spot, at a glance, which components have ever recorded a newer Java line.
- CRS's write endpoints for `build.javaVersion`/`build.mavenVersion` now return two new error responses — `409 RMS_REGISTERED_VALUE_CONFLICT` and `503` (RMS unreachable) — that Portal has no handling for. Both currently fall through to the generic "Save failed" toast, which doesn't tell the editor what happened or what to do next.

## What Changes

- **List view**: the existing Java Version column shows the ACTUAL rollup (max Java version RMS has ever registered for that component) when one exists, read from `ComponentSummaryResponse.registeredBuildParameters`, falling back to today's configured value otherwise.
- **Detail view**: the Build tab gains, next to the existing `javaVersion`/`mavenVersion` fields and their `FieldOverrideInline` range editors, a display-only view of `ComponentDetailResponse.registeredBuildParameters` — the ACTUAL range list per attribute, a named warning wherever a stored DEFAULT/OVERRIDDEN row disagrees with an intersecting ACTUAL range, and a distinct "ACTUAL data unavailable" indicator for a component CRS has never successfully swept.
- **Save-error handling**: a `409` with `errorCode: RMS_REGISTERED_VALUE_CONFLICT` gets a dedicated, specific toast (naming the conflicting range/value) instead of falling into the generic non-lock-conflict bucket; a `503` from the same write path gets its own distinguishable "RMS is currently unavailable" treatment instead of the generic destructive "Save failed" fallback.

## Capabilities

### New Capabilities

- `registered-build-parameters`: how Portal displays RMS's registered Java/Maven data (ACTUAL) alongside a component's configured build values, and how it surfaces the two new save-time error responses this data source introduces.

### Modified Capabilities

<!-- None. This is additive display + error-handling on top of the existing component-list and component-detail capabilities; neither capability's existing contract changes. -->

## Out of scope

- Disabling or restricting the DEFAULT/OVERRIDDEN `javaVersion`/`mavenVersion` edit controls. They stay as editable as they are today.
- The JAVA_HOME_NOT_FROM_ENV warning (`docs/features/tc-validation.md`).

## Impact

**Portal only.** CRS already implements everything this change reads (`RegisteredBuildParametersSummary`/`RegisteredBuildParametersDetail` DTOs, the `409`/`503` write responses) on its `rms-registered-build-params` branch. No CRS change is required, and nothing here waits on a CRS merge for the read side — Portal can build against the vendored `v4.json` once that branch reaches CRS `main`. The write-side error handling has the same property: it decodes response shapes CRS already produces.
