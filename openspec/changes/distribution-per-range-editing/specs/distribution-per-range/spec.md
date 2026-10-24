## Purpose

Defines how the component editor's Distribution tab answers the question
per-range distribution overrides exist to answer: for a concrete version, what
will this component actually publish?

## ADDED Requirements

### Requirement: Version preview is a transient, read-only control

The Distribution tab SHALL offer a control for entering a concrete version to
preview. The entered version SHALL NOT be persisted, SHALL NOT mark the editor
dirty, and SHALL NOT participate in the combined Save. The preview SHALL be
available to every user who can open the component (`ACCESS_COMPONENTS`),
independent of edit rights (`ComponentDetail.canEdit`).

#### Scenario: Entering a version leaves the form clean

- **WHEN** the editor opens a component with no unsaved edits and a version is
  entered in the preview control
- **THEN** the Save action remains disabled and no write request is issued

#### Scenario: Preview is available without edit rights

- **WHEN** a user who cannot edit the component opens the Distribution tab
- **THEN** the preview control is usable and its results are shown, while the
  add, edit and delete actions remain disabled

#### Scenario: Preview follows the drafts

- **WHEN** a version is entered and the user then adds, edits or deletes a
  per-range row or a supported-version range without saving
- **THEN** the preview updates to the edited drafts

#### Scenario: Only the settled input is shown

- **WHEN** the user types a version quickly
- **THEN** results for intermediate input are not shown; while the settled
  version is being resolved the tab says so

#### Scenario: Blank input requests nothing

- **WHEN** the control contains nothing, or only whitespace
- **THEN** no preview request is issued and neither a result nor an error is
  shown

### Requirement: The registry resolves the preview from the unsaved drafts

The preview SHALL be resolved by the registry
(`POST /rest/api/4/components/{id}/distribution/preview`, CRS SYS-105), sending
the current override draft and supported-versions draft rather than the saved
state. The Portal SHALL NOT decide containment or version ordering itself.

#### Scenario: Unsaved override is previewed

- **WHEN** the user adds an override row for `[1.0,2.0)` without saving and
  previews `1.5`
- **THEN** the preview attributes that path to the unsaved row

#### Scenario: Qualified versions are previewed like any other

- **WHEN** the previewed version is `1.2-0003`, `2.1.0-RC1` or `1.0.0-SNAPSHOT`
- **THEN** it resolves the same way the registry resolves it at read time

### Requirement: Each path shows its children and their source

With a version previewed, each subsection SHALL show the children in effect and
attribute them to either a specific version range or the component-level base
list. An override replaces that path's base children outright, and paths
resolve independently of each other.

#### Scenario: A covering override replaces the base list

- **WHEN** the version falls inside an override range on `distribution.maven`
  and inside no override range on `distribution.packages`
- **THEN** the Maven subsection shows the override's artifacts attributed to
  that range, and the Packages subsection shows the base packages attributed to
  the component level

#### Scenario: Component without per-range overrides

- **WHEN** the component has no per-range overrides and a supported version is
  previewed
- **THEN** every subsection shows its base list and no row is marked

#### Scenario: A gap between ranges falls back to base

- **WHEN** a path has overrides for `[1.0,2.0)` and `[3.0,4.0)` and the version
  is `2.5`
- **THEN** that subsection shows the base list

#### Scenario: Empty override is not read as base

- **WHEN** the version falls inside an override range whose child list is empty
- **THEN** the subsection states that nothing is published for that version,
  attributed to that range

#### Scenario: Docker and Generic verdicts are reported

- **WHEN** a version is previewed
- **THEN** the tab states in one line each whether Docker images and generic
  artifacts come from the base list or from a specific range

### Requirement: The winning row is marked

Where an override determines a path's outcome, the per-range row containing it
SHALL carry an "In effect" badge. The list shows contiguous same-value overrides
as one row; when the winning override is one of several merged into a row, that
row is the one marked.

#### Scenario: Winning row is identifiable

- **WHEN** a version resolves a path to an override
- **THEN** the row containing that override is marked and no other row on that
  path is

#### Scenario: Marking clears with the preview

- **WHEN** the preview control is cleared
- **THEN** no row is marked and no attribution is shown

### Requirement: Unresolvable answers are reported, never guessed

#### Scenario: Unsupported version

- **WHEN** the registry reports the version outside the component's supported
  versions
- **THEN** the tab states that the component has no configuration at that
  version, and no subsection shows children

#### Scenario: Invalid version

- **WHEN** the registry rejects the version as unparseable
- **THEN** the control reports the input as invalid and no result is shown

#### Scenario: Overlapping overrides

- **WHEN** the registry reports a conflict on a path
- **THEN** that subsection names the overlapping ranges as a data conflict and
  marks no row

#### Scenario: Unevaluable override range

- **WHEN** the registry lists an override range on a path as unevaluable
- **THEN** that subsection warns that the range was ignored and the answer may
  be incomplete

#### Scenario: Preview request fails

- **WHEN** the preview request fails for any other reason, including 403
- **THEN** the tab states that the preview is unavailable and shows no result

#### Scenario: Session expired

- **WHEN** the preview request is answered with 401
- **THEN** it follows the application's session-expiry redirect, like any other
  request on the page
