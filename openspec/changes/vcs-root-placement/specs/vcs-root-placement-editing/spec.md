## Purpose

Lets a person editing a component see and set where each VCS entry's sources are placed and where
the build runs, and tells them when a save leaves the component's TeamCity build chain out of date.

## ADDED Requirements

### Requirement: Placement fields per VCS entry

The VCS editor and the per-range override editor SHALL show Source Path and Checkout Directory for
every VCS entry, whatever its position, prefilled from the registry, editable by users allowed to
edit the component, and SHALL send both on save, sending `null` for a field left blank.

#### Scenario: Editing placement
- **WHEN** an editor sets Checkout Directory `core` on the first entry, and Source Path `data` on
  the second entry, and saves
- **THEN** the save request carries those values, `checkoutDirectory: "core"` on the first entry
  and `checkoutDirectory: null` on the second, and the reloaded editor shows them

#### Scenario: Checkout Directory editable on the first entry
- **WHEN** an editor opens the VCS tab or a per-range VCS override row
- **THEN** the Checkout Directory of every entry, the first included, can be edited

#### Scenario: Blank field
- **WHEN** an editor clears an entry's Checkout Directory and saves
- **THEN** the save request carries `checkoutDirectory: null` for that entry

#### Scenario: Per-range override row
- **WHEN** an editor sets Checkout Directories `core` and `feature` on the first and second
  entries of a per-range VCS override row, and its Build Working Directory `core`, and saves
- **THEN** the component PATCH's `fieldOverrides` entry for that row carries both
  `checkoutDirectory` values and the reloaded override editor shows them

#### Scenario: Read-only viewer
- **WHEN** a user without edit permission opens the VCS tab
- **THEN** Source Path, Checkout Directory and Build Working Directory are shown and cannot be
  edited

### Requirement: Build Working Directory per row

The VCS tab SHALL show the base row's Build Working Directory and the per-range override editor
the Build Working Directory of each VCS override row, prefilled from the registry, editable by
users allowed to edit the component, and SHALL send it with that row. Left blank, the base row
SHALL send `''` (the registry's base PATCH treats `null` as "unchanged" and blank as "clear", the
Portal's convention for base scalars), and a VCS override row MAY send `null`, since its payload
replaces the row.

#### Scenario: Base value
- **WHEN** an editor sets Build Working Directory `core/mapper` on the VCS tab and saves
- **THEN** the component PATCH's base configuration carries `buildWorkingDirectory: "core/mapper"`
  and the reloaded tab shows it

#### Scenario: Per-range value
- **WHEN** an editor sets Build Working Directory `core` on a per-range VCS override row and saves
- **THEN** that row's `fieldOverrides` entry carries `buildWorkingDirectory: "core"` next to its
  `vcsEntries`

#### Scenario: Cleared
- **WHEN** an editor clears the base Build Working Directory and saves
- **THEN** the save request carries `buildWorkingDirectory: ""` in the base configuration, and the
  reloaded tab shows the field empty

#### Scenario: Entries emptied
- **WHEN** an editor removes every VCS entry on the VCS tab of a component whose base row stores a
  Build Working Directory, and saves
- **THEN** the save request carries `vcsEntries: []` and `buildWorkingDirectory: ""`

### Requirement: Name is read-only

The VCS editor and the per-range override editor SHALL show each entry's Name as read-only, and
SHALL send the stored Name unchanged (none for a new entry).

#### Scenario: Name not editable
- **WHEN** an editor opens an entry in either editor
- **THEN** its Name is shown and cannot be changed, and a save sends the stored Name

#### Scenario: Name derived by the registry
- **WHEN** an editor changes an entry's Checkout Directory to `feature` and saves
- **THEN** after reload the entry's Name shows `feature`

### Requirement: Placement validation errors on the field

The VCS editor SHALL show a registry error whose message starts with `vcsEntries[<i>].sourcePath: `
or `vcsEntries[<i>].checkoutDirectory: ` next to that field of entry `<i>`, and one starting
`buildWorkingDirectory: ` next to the Build Working Directory field. The per-range override editor
SHALL show an error starting `fieldOverrides[<j>].vcsEntries[<i>].<field>: ` next to that field of
entry `<i>`, and one starting `fieldOverrides[<j>].buildWorkingDirectory: ` next to the Build
Working Directory, in the override row sent as the PATCH's `fieldOverrides[<j>]`.

#### Scenario: Two entries at the checkout root
- **WHEN** an editor saves two entries without Checkout Directory and the registry answers 400 with
  `vcsEntries[1].checkoutDirectory: required: vcsEntries[0] is already checked out at the checkout root`
- **THEN** the save is rejected and the message is shown on the second entry's Checkout Directory
  field

#### Scenario: Build Working Directory outside the entries
- **WHEN** the registry answers 400 with `buildWorkingDirectory: must start with the Checkout
  Directory of a VCS entry`
- **THEN** the message is shown on the VCS tab's Build Working Directory field

#### Scenario: Build Working Directory required
- **WHEN** an editor saves two entries in Checkout Directories `core` and `feature` without a Build
  Working Directory and the registry answers 400 with
  `buildWorkingDirectory: required when every VCS entry has a Checkout Directory`
- **THEN** the save is rejected and the message is shown on the VCS tab's Build Working Directory
  field

#### Scenario: Error on a per-range override row
- **WHEN** a save sends three override rows and the registry answers 400 with
  `fieldOverrides[2].buildWorkingDirectory: must start with the Checkout Directory of a VCS entry`
- **THEN** the message is shown on the Build Working Directory field of the override row sent
  third, and the VCS tab shows no error

### Requirement: Chain-mismatch warning

The Portal SHALL show a non-blocking warning after a successful save when the registry response
carries warnings. The registry warns only when the save changes the base VCS entries or the base
Build Working Directory; a save that changes only per-range VCS override rows shows no warning.

#### Scenario: Entry added to a component with a build chain
- **WHEN** a save succeeds and the response contains the warning that the build chain must be
  recreated
- **THEN** the editor sees that warning after the save

#### Scenario: Only a per-range override row changed
- **WHEN** an editor changes only a per-range VCS override row of a component with a build chain
  and the save succeeds
- **THEN** no chain-mismatch warning is shown
