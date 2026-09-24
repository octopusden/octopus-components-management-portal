## Purpose

Lets a person editing a component see and set where each VCS entry's sources are placed, and tells
them when a save leaves the component's TeamCity build chain out of date.

## ADDED Requirements

### Requirement: Placement fields per VCS entry

The VCS editor SHALL show Source Path and Checkout Directory for every VCS entry, prefilled from the
registry, editable by users allowed to edit the component, and SHALL send both on save.

#### Scenario: Editing placement
- **WHEN** an editor sets Source Path `mapper` and Checkout Directory `core` on an entry and saves
- **THEN** the save request carries `sourcePath: "mapper"` and `checkoutDirectory: "core"` for that
  entry and the reloaded editor shows both values

#### Scenario: Read-only viewer
- **WHEN** a user without edit permission opens the VCS tab
- **THEN** Source Path and Checkout Directory are shown and cannot be edited

### Requirement: Name is read-only

The VCS editor SHALL show each entry's Name as read-only and SHALL NOT send an edited Name.

#### Scenario: Name derived by the registry
- **WHEN** an editor changes an entry's Checkout Directory to `core` and saves
- **THEN** after reload the entry's Name shows `core`

### Requirement: Placement validation errors on the field

The VCS editor SHALL show a registry validation error for Source Path or Checkout Directory next to
the field of the entry it names.

#### Scenario: Missing Checkout Directory on a multi-entry component
- **WHEN** an editor saves two entries and one has no Checkout Directory
- **THEN** the save is rejected and the error is shown on that entry's Checkout Directory field

### Requirement: Chain-mismatch warning

The Portal SHALL show a non-blocking warning after a successful save when the registry response
carries warnings.

#### Scenario: Entry added to a component with a build chain
- **WHEN** a save succeeds and the response contains the warning that the build chain must be
  recreated
- **THEN** the editor sees that warning after the save
