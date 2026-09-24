## Why

Components Registry now stores where each VCS entry's sources are placed on the build agent
(Source Path and Checkout Directory), derives the entry Name, and warns when entries change on a
component whose TeamCity build chain already exists. People editing a component need to see and
set those values, and see the warning, in the Portal. CRS dependency: the registry change "VCS
root checkout placement" (fields in v4 VCS entries and `warnings` on the component detail
response) must merge and deploy first.

## What Changes

- The VCS editor (VCS tab) and the per-range override editor show **Source Path** for every VCS
  entry and **Checkout Directory** for every secondary entry, with descriptions that say a
  secondary's sources land at `Checkout Directory / Source Path`. The primary (first) entry's
  Checkout Directory is not editable, with a short description why: it is checked out at the
  checkout root, and the registry rejects a Checkout Directory there.
- **Name** is shown read-only in both: the registry derives it. The stored value is still sent
  unchanged, so a rolled-back registry keeps names.
- Registry validation errors for the two fields (`vcsEntries[<i>].<field>: …`, or `fieldOverrides[<j>].vcsEntries[<i>].<field>: …` for a per-range row) appear on the
  field of the entry that caused them.
- After saving, a registry warning that the build chain must be recreated is shown to the editor.

## Capabilities

### New Capabilities

- `vcs-root-placement-editing`: viewing and editing VCS entry placement, and surfacing the
  chain-mismatch warning.

### Modified Capabilities

None.

## Impact

- Frontend only; the BFF proxies the new fields unchanged. Touches the VCS tab and its section
  hook, the override row editor, field descriptions, the server-error parser (today it accepts
  only plain identifiers as field names) and an inline-error slot on VCS entry fields (the VCS
  section has none today), and the save flow for `warnings`.
- Requires the registry version that returns the new fields; against an older registry the fields
  stay empty.
