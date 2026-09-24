## Purpose

Lets a person editing a component see and set where each VCS entry's sources are placed, and tells
them when a save leaves the component's TeamCity build chain out of date.

## ADDED Requirements

### Requirement: Placement fields per VCS entry

The VCS editor and the per-range override editor SHALL show Source Path for every VCS entry and
Checkout Directory for every secondary entry (position 2 onwards), prefilled from the registry,
editable by users allowed to edit the component, and SHALL send both on save, sending `null` for a
field left blank. The primary (first) entry's Checkout Directory SHALL NOT be editable (hidden or
read-only) and SHALL carry a short description that the primary is checked out at the checkout
root; the Portal SHALL send `checkoutDirectory: null` for the entry in first position.

#### Scenario: Editing placement
- **WHEN** an editor sets Source Path `mapper` on the primary entry, and Source Path `data` and
  Checkout Directory `feature` on the second entry, and saves
- **THEN** the save request carries those values, with `checkoutDirectory: null` on the primary,
  and the reloaded editor shows them

#### Scenario: Primary Checkout Directory not editable
- **WHEN** an editor opens the VCS tab or a per-range VCS override row
- **THEN** the first entry's Checkout Directory cannot be edited and its description says why, and
  the Checkout Directory of every other entry can be edited

#### Scenario: Secondary becomes primary
- **WHEN** an editor removes the first of two entries, the remaining one having Checkout Directory
  `feature`, and saves
- **THEN** the remaining entry's Checkout Directory is no longer editable and the save request
  carries `checkoutDirectory: null` for it

#### Scenario: Blank field
- **WHEN** an editor clears a secondary entry's Checkout Directory and saves
- **THEN** the save request carries `checkoutDirectory: null` for that entry

#### Scenario: Per-range override row
- **WHEN** an editor sets Checkout Directories `feature` and `extra` on the second and third
  entries of a per-range VCS override row and saves
- **THEN** the component PATCH's `fieldOverrides` entry for that row carries both
  `checkoutDirectory` values, `null` on its first entry, and the reloaded override editor shows
  them, with the first entry's Checkout Directory not editable

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
- **WHEN** an editor changes a secondary entry's Checkout Directory to `feature` and saves
- **THEN** after reload the entry's Name shows `feature`

### Requirement: Placement validation errors on the field

The VCS editor SHALL show a registry error whose message starts with `vcsEntries[<i>].sourcePath: `
or `vcsEntries[<i>].checkoutDirectory: ` next to that field of entry `<i>`. The per-range override
editor SHALL show an error starting `fieldOverrides[<j>].vcsEntries[<i>].<field>: ` next to that
field of entry `<i>` in the override row sent as the PATCH's `fieldOverrides[<j>]`.

#### Scenario: Missing Checkout Directory on a multi-entry component
- **WHEN** an editor saves two entries, the second without a Checkout Directory, and the registry
  answers 400 with `vcsEntries[1].checkoutDirectory: required on a secondary VCS entry`
- **THEN** the save is rejected and the message is shown on the second entry's Checkout Directory
  field

#### Scenario: Error on a per-range override row
- **WHEN** a save sends three override rows and the registry answers 400 with
  `fieldOverrides[2].vcsEntries[1].checkoutDirectory: required on a secondary VCS entry`
- **THEN** the message is shown on the second entry's Checkout Directory field of the override row
  sent third, and the VCS tab shows no error

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
