## Purpose

Defines how the component editor's Distribution tab presents per-range overrides
for the four distribution marker paths (Maven artifacts, Docker images, File URL
artifacts, Packages), and how it answers the question those overrides exist to
answer: for a concrete version, what will this component actually publish?

## ADDED Requirements

### Requirement: Version preview is a transient control

The Distribution tab SHALL offer a control for entering a concrete version to
preview. The entered version is a viewing aid: it SHALL NOT be persisted, SHALL
NOT mark the editor dirty, and SHALL NOT participate in the combined Save.

#### Scenario: Entering a version leaves the form clean

- **WHEN** the editor opens a component with no unsaved edits and a version is
  entered in the preview control
- **THEN** the Save action remains disabled and no request is issued

#### Scenario: Preview does not survive the component

- **WHEN** the user navigates to a different component and returns
- **THEN** the preview control is empty again

#### Scenario: Preview is available without edit rights

- **WHEN** a user who may view but not edit the component opens the Distribution
  tab
- **THEN** the preview control is usable and its results are shown, while the
  add, edit and delete actions remain disabled

### Requirement: Preview resolves each marker path independently

With a version entered, each of the four subsections SHALL show the children
that the registry would resolve for that version, and SHALL identify their
source as either a specific version range or the component-level base list.

Resolution SHALL be performed per marker path independently: an override on one
path SHALL NOT affect the outcome of another path. A covering override SHALL
replace that path's children outright rather than merging with the base list
(CRS **MIG-036**, **ADR-018**).

#### Scenario: A covering override replaces the base list

- **WHEN** a version falls inside the range of an override on `distribution.docker`
- **THEN** the Docker subsection shows that override's images, attributed to that
  range, and does not show the base images

#### Scenario: Paths resolve independently

- **WHEN** a version falls inside a `distribution.docker` override range and
  inside no `distribution.maven` override range
- **THEN** the Docker subsection shows the override's images and the Maven
  subsection shows the base artifacts

#### Scenario: No covering override falls back to base

- **WHEN** a version falls outside every override range for a path
- **THEN** that subsection shows the base list, attributed to the component
  level

#### Scenario: A gap between ranges falls back to base

- **WHEN** a path has overrides for `[1.0,2.0)` and `[3.0,4.0)` and the previewed
  version is `2.5`
- **THEN** that subsection shows the base list rather than either override

### Requirement: An override that replaces the base with nothing is shown as such

An override may legitimately carry no children, meaning the component publishes
nothing on that path for those versions. The preview SHALL distinguish this from
falling back to the base list.

#### Scenario: Empty override is not silently read as base

- **WHEN** a version falls inside an override range whose child list is empty
- **THEN** the subsection states that nothing is published for that version and
  attributes it to that range, rather than showing the base list

### Requirement: Versions outside the supported set resolve to nothing

A component may declare which versions it supports. The registry does not
resolve a configuration at all for a version outside that set (CRS **MIG-042**;
`version-model-spec.md` §3 returns 404 when `v ∉ supported`). The preview SHALL
reproduce this rather than falling back to the base list — the base fallback is
the specific defect MIG-042 records and corrects.

#### Scenario: Unsupported version

- **WHEN** the previewed version lies outside the component's supported
  versions
- **THEN** the tab states that the component has no configuration at that
  version, and no subsection shows base or override children

#### Scenario: Component with no coverage restriction

- **WHEN** the component declares no supported-version restriction
- **THEN** every parseable version is previewable and resolves normally

#### Scenario: An unreadable supported-version range counts as covering

- **WHEN** the component's supported-version data contains a range that is
  blank or cannot be parsed
- **THEN** that entry is treated as covering the previewed version, so the
  preview resolves rather than reporting no configuration

This is deliberately the opposite reduction from an unreadable *override*
range, which never matches. The registry is conservative in the same
direction and for the same reason: refusing to serve a configuration is the
worse failure, while declining to apply one override is not.

### Requirement: Malformed input is reported, never guessed

The preview SHALL NOT present a result it cannot justify.

#### Scenario: Unparseable previewed version

- **WHEN** the entered version cannot be parsed
- **THEN** the control reports the input as invalid and no resolution result is
  shown

#### Scenario: A qualified version is declined, not guessed

- **WHEN** the entered version carries a qualifier the preview cannot order,
  such as `1.2-0003`, `3.0.0-0` or `2.1.0-RC1`
- **THEN** the control states that it cannot evaluate that version here, rather
  than reporting it as malformed or resolving it approximately

The registry accepts these versions and this preview does not. That is a real
limit on who the feature serves, not an edge case — see design.md, which puts
the choice between narrowing the contract and moving resolution to the registry
in front of the reviewer.

#### Scenario: Blank input is not an error

- **WHEN** the control contains nothing, or only whitespace
- **THEN** it is treated as no preview requested — neither a result nor an
  invalid-input message is shown

#### Scenario: Unparseable override range never matches

- **WHEN** an override on a path carries a range that cannot be parsed
- **THEN** that override is never selected by the preview, and the tab warns
  that the path contains a range it cannot evaluate

#### Scenario: Overlapping overrides on one path are surfaced

- **WHEN** more than one override on the same path covers the previewed version
- **THEN** the tab reports the overlap as a data conflict instead of choosing
  one of them

### Requirement: Preview marks the winning row

Where a per-range override determines the outcome, the corresponding row in that
path's per-range list SHALL be visibly marked as the one in effect for the
previewed version.

#### Scenario: Winning row is identifiable

- **WHEN** a version resolves to a specific override row
- **THEN** that row is marked as in effect and the other rows for that path are
  not

#### Scenario: Marking clears with the preview

- **WHEN** the preview control is cleared
- **THEN** no row is marked and every subsection returns to showing the base
  list alongside the full set of per-range rows
