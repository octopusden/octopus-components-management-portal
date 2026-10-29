## Purpose

Changes to creating a component from a template for template-only creators: either create
permission opens a template, and only `CREATE_COMPONENTS` may change overridable fields on Review.

## MODIFIED Requirements

### Requirement: A template tile leads to its parameters

Picking a usable template tile on the Profile step SHALL load that template from the registry and
replace the wizard's steps with Parameters and Review & create. Picking a regular profile tile
afterwards SHALL restore the regular steps with the values entered there before. Creating from a
template needs the user's `CREATE_COMPONENTS` or `CREATE_FROM_TEMPLATE` permission; whether a
template is usable is the registry's answer on the tile.

#### Scenario: Two steps after a template

- **WHEN** the user picks the "Client plugin" template tile
- **THEN** the step list shows Profile, Parameters and Review & create, and the wizard is on
  Parameters

#### Scenario: Back to a regular profile

- **WHEN** the user has typed a key on General, picks a template, then picks Regular external
- **THEN** the regular steps return and the key typed before is still there

#### Scenario: The template cannot be loaded

- **WHEN** loading the template fails
- **THEN** Parameters shows the error with a Retry action, and Next is disabled

#### Scenario: Template-only creator creates from a template

- **WHEN** a user holding `CREATE_FROM_TEMPLATE` and not `CREATE_COMPONENTS` picks a usable
  template, fills its parameters, enters a Jira task key and presses Create with no problem
  standing
- **THEN** the component is created and the success panel links to it

### Requirement: Overridable fields can be changed on review

For a user holding `CREATE_COMPONENTS`, fields the template marks overridable SHALL be editable on
Review; every other field SHALL be read-only. An edited field SHALL be marked "changed from
template" and checked as the user types with the Portal-only rules and the template's field rules
from the profile listing. Leaving an edited field SHALL run a new dry run with the edit as an
override. Clearing the edit SHALL remove the override and show the template's value again.

For a user without `CREATE_COMPONENTS`, every field on Review SHALL be read-only and no override
SHALL be sent. When the template has at least one overridable field, Review SHALL show once, above
the fields, "Values come from the template and cannot be changed."

#### Scenario: Re-checked on leaving the field

- **WHEN** a user holding `CREATE_COMPONENTS` edits the overridable VCS path and moves to another
  field
- **THEN** one dry run is sent with the override, and none was sent while typing

#### Scenario: A non-overridable field

- **WHEN** Review shows a field the template does not mark overridable
- **THEN** it cannot be edited

#### Scenario: Template-only creator sees overridable fields read-only

- **WHEN** a user holding `CREATE_FROM_TEMPLATE` and not `CREATE_COMPONENTS` reaches Review of a
  template whose VCS path is overridable
- **THEN** VCS path cannot be edited, and Review shows "Values come from the template and cannot
  be changed."

#### Scenario: No note without overridable fields

- **WHEN** a template-only creator reaches Review of a template with no overridable field
- **THEN** no note is shown

#### Scenario: Template-only creator sends no overrides

- **WHEN** a template-only creator runs the dry run and presses Create
- **THEN** neither request carries overrides

#### Scenario: The registry refuses the override

- **WHEN** the registry answers 403 to a run with an override
- **THEN** Review shows the registry's message and Create stays disabled
