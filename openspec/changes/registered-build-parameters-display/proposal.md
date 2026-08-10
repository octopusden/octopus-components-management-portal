## Why

- CRS now records the Java/Maven version RMS actually registered for a component's builds (**ACTUAL**), alongside the DEFAULT/OVERRIDDEN values Portal already lets an editor configure.
- Portal shows only the configured side today. An editor has no way to see whether their configured value matches what was actually built.
- CRS's write endpoints for `build.javaVersion`/`build.mavenVersion` now return two new error responses — `409 RMS_REGISTERED_VALUE_CONFLICT` and `503 RMS_UNAVAILABLE` (the live RMS check was unreachable, timed out, or ambiguous) — that Portal has no handling for. Both currently fall through to the generic "Save failed" toast, which doesn't tell the editor what happened or what to do next.

## What Changes

- **Detail view**: the Build tab gains, next to the existing `javaVersion`/`mavenVersion` fields and their `FieldOverrideInline` range editors, a display-only view of `ComponentDetailResponse.registeredBuildParameters` — the ACTUAL range list per attribute, a collapsed per-attribute summary of the ranges that disagree with what was actually built, and a distinct "ACTUAL data unavailable" indicator for a component CRS has never successfully swept.
- **Save-error handling**: a `409` with `errorCode: RMS_REGISTERED_VALUE_CONFLICT` gets a dedicated toast naming the conflicting range/value, states that nothing was saved (CRS rejects the whole request, not just that field), and triggers a best-effort refetch of the component so the display can catch up with the data that caused the rejection (not a guarantee — see design.md's multi-replica caveat); a `503` with `errorCode: RMS_UNAVAILABLE` gets its own distinguishable "RMS is currently unavailable" treatment instead of the generic destructive "Save failed" fallback.

## Capabilities

### New Capabilities

- `registered-build-parameters`: how the component detail view displays RMS's registered Java/Maven data (ACTUAL) alongside a component's configured build values, and how it surfaces the two new save-time error responses this data source introduces.

### Modified Capabilities

<!-- None. This is additive display + error-handling on top of the existing component-detail capability; its existing contract does not change. -->

## Out of scope

- The components list. CRS resolves the registered value into the existing `javaVersion` field, so the column and filter need no Portal change.
- Disabling or restricting the DEFAULT/OVERRIDDEN `javaVersion`/`mavenVersion` edit controls. They stay as editable as they are today.
- The JAVA_HOME_NOT_FROM_ENV warning (`docs/features/tc-validation.md`).

## Impact

**Portal only, once `octopusden/octopus-components-registry-service`'s `rms-registered-build-params` branch reaches `main`.** This change depends on that branch merging first — the detail view and both save-error paths read shapes CRS already produces there (`RegisteredBuildParametersDetail`, the `409`/`503` responses), but not yet on CRS `main`.

The components list needs no change at all: CRS resolves the registered value into the `javaVersion` field it already returns, so the column and its filter stay consistent server-side without Portal merging two sources.
