## Why

Components Registry now stores where each VCS entry's sources are placed on the build agent
(Source Path and Checkout Directory), derives the entry Name, and warns when entries change on a
component whose TeamCity build chain already exists. People editing a component need to see and
set those values, and see the warning, in the Portal. CRS dependency: the registry change "VCS
root checkout placement" (fields in v4 VCS entries and `warnings` on the component detail
response) must merge and deploy first.

## What Changes

- The VCS editor shows **Source Path** and **Checkout Directory** for every VCS entry, with
  descriptions that say the sources land at `Checkout Directory / Source Path`.
- **Name** is shown read-only: the registry derives it.
- Registry validation errors for the two fields appear on the field that caused them.
- After saving, a registry warning that the build chain must be recreated is shown to the editor.

## Capabilities

### New Capabilities

- `vcs-root-placement-editing`: viewing and editing VCS entry placement, and surfacing the
  chain-mismatch warning.

### Modified Capabilities

None.

## Impact

- Frontend only (VCS editor tab, field descriptions, save flow); the BFF proxies the new fields
  unchanged.
- Requires the registry version that returns the new fields; against an older registry the fields
  stay empty and saving omits them.
