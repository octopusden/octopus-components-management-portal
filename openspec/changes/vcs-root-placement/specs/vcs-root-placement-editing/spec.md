## Purpose

Lets a person editing a component see and set where each VCS entry's sources are placed, and tells
them when a save leaves the component's TeamCity build chain out of date.

## ADDED Requirements

### Requirement: Placement fields per VCS entry

The VCS editor and the per-range override editor SHALL show Source Path and Checkout Directory for
every VCS entry, prefilled from the registry, editable by users allowed to edit the component, and
SHALL send both on save, sending `null` for a field left blank.

#### Scenario: Editing placement
- **WHEN** an editor sets Source Path `mapper` and Checkout Directory `core` on an entry and saves
- **THEN** the save request carries `sourcePath: "mapper"` and `checkoutDirectory: "core"` for that
  entry and the reloaded editor shows both values

#### Scenario: Blank field
- **WHEN** an editor clears an entry's Checkout Directory and saves
- **THEN** the save request carries `checkoutDirectory: null` for that entry

#### Scenario: Per-range override row
- **WHEN** an editor sets Checkout Directories `core` and `feature` on the two entries of a
  per-range VCS override row and saves
- **THEN** the field-override request carries both `checkoutDirectory` values and the reloaded
  override editor shows them

#### Scenario: Read-only viewer
- **WHEN** a user without edit permission opens the VCS tab
- **THEN** Source Path and Checkout Directory are shown and cannot be edited

### Requirement: Name is read-only

The VCS editor and the per-range override editor SHALL show each entry's Name as read-only, and
SHALL send the stored Name unchanged (none for a new entry).

#### Scenario: Name not editable
- **WHEN** an editor opens an entry in either editor
- **THEN** its Name is shown and cannot be changed, and a save sends the stored Name

#### Scenario: Name derived by the registry
- **WHEN** an editor changes an entry's Checkout Directory to `core` and saves
- **THEN** after reload the entry's Name shows `core`

### Requirement: Placement validation errors on the field

The VCS editor SHALL show a registry error whose message starts with `vcsEntries[<i>].sourcePath: `
or `vcsEntries[<i>].checkoutDirectory: ` next to that field of entry `<i>`; the per-range override
editor SHALL do the same for the row being saved.

#### Scenario: Missing Checkout Directory on a multi-entry component
- **WHEN** an editor saves two entries, the second without a Checkout Directory, and the registry
  answers 400 with `vcsEntries[1].checkoutDirectory: required when a row has more than one VCS
  entry`
- **THEN** the save is rejected and the message is shown on the second entry's Checkout Directory
  field

### Requirement: Chain-mismatch warning

The Portal SHALL show a non-blocking warning after a successful save when the registry response
carries warnings. The registry warns only when the save changes the base VCS entries; a save that
changes only per-range VCS override rows shows no warning.

#### Scenario: Entry added to a component with a build chain
- **WHEN** a save succeeds and the response contains the warning that the build chain must be
  recreated
- **THEN** the editor sees that warning after the save

#### Scenario: Only a per-range override row changed
- **WHEN** an editor changes only a per-range VCS override row of a component with a build chain
  and the save succeeds
- **THEN** no chain-mismatch warning is shown
