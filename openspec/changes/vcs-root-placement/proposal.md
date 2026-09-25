## Why

Components Registry now stores where each VCS entry's sources are placed on the build agent
(Source Path and Checkout Directory) and where the build runs (Build Working Directory, per
configuration row), derives the entry Name, and warns when entries change on a component whose
TeamCity build chain already exists. People editing a component need to see and set those values,
and see the warning, in the Portal. CRS dependency: the registry change "VCS root checkout
placement", revision 3 (fields in v4 VCS entries and configuration rows, `warnings` on the
component detail response), must merge and deploy first.

## What Changes

- The VCS editor (VCS tab) and the per-range override editor show **Source Path** and **Checkout
  Directory** for every VCS entry, editable, with descriptions that say an entry's sources land at
  `Checkout Directory / Source Path` and that an entry without Checkout Directory is checked out at
  the checkout root (at most one per row). Revision 2's read-only Checkout Directory on the first
  entry, its description and the forced `null` are removed.
- Both editors show a **Build Working Directory** field for the row (base on the VCS tab, per-range
  in the VCS override row), with a description that it is the directory the build runs in,
  relative to the checkout root, empty = the checkout root.
- **Name** is shown read-only in both: the registry derives it. The stored value is still sent
  unchanged, so a rolled-back registry keeps names.
- Registry validation errors (`vcsEntries[<i>].<field>: …`, `buildWorkingDirectory: …`, each
  optionally prefixed `fieldOverrides[<j>].` for a per-range row) appear on the field that caused
  them.
- After saving, a registry warning that the build chain must be recreated is shown to the editor.

## Capabilities

### New Capabilities

- `vcs-root-placement-editing`: viewing and editing VCS entry placement and the Build Working
  Directory, and surfacing the chain-mismatch warning.

### Modified Capabilities

None.

## Impact

- Frontend only; the BFF proxies the new fields unchanged. Touches the VCS tab and its section
  hook (`useVcsSection.ts`, which today forces the first entry's Checkout Directory empty at
  `:93-94`), the override row editor (`OverrideRowEditor.tsx`, the same at `:414` and the read-only
  field at `:768-771`), field descriptions (`PRIMARY_CHECKOUT_DIRECTORY_HINT` removed), the
  server-error parser (`serverErrors.ts:87`), the save flow for `warnings`, and the vendored
  `v4.json`.
- Requires the registry version that returns the new fields; against an older registry the fields
  stay empty.
