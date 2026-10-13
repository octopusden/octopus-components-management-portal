## Purpose

Governs creating a component from a registry template in the Create component wizard: the
template's Parameters step, its Review & create step, the checks shown on each, and what Create
sends. It does not govern regular profiles, the regular wizard's steps, or the administrators'
Templates tab.

## ADDED Requirements

### Requirement: A template tile leads to its parameters

Picking a usable template tile on the Profile step SHALL load that template from the registry and
replace the wizard's steps with Parameters and Review & create. Picking a regular profile tile
afterwards SHALL restore the regular steps with the values entered there before. Creating from a
template needs the user's `CREATE_COMPONENTS` permission, as any create.

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

### Requirement: One input per parameter

The Parameters step SHALL show one input per template parameter, in the template's order, with its
label and hint: a text input for `text`; a dropdown for a single-value `select` or `crs-list`;
chips for a `select` with `multiple` or the `labels` list; the people picker for `person`, a people
list when `multiple`. Defaults SHALL be pre-filled, required parameters marked and optional ones
labelled optional.

#### Scenario: Owner defaults to the user

- **WHEN** a `person` parameter's default is the current user
- **THEN** the input opens with the logged-in user selected

#### Scenario: Several options

- **WHEN** a `select` parameter allows several values
- **THEN** it is shown as chips with an "Add" choice offering only its options

### Requirement: Parameters are checked while typing

Each parameter SHALL be checked in the browser as the user types, from the template's definitions:
required, number of values, maximum length, pattern with the template's message, option, and
maximum selection. Blank values are ignored, and an empty parameter counts as its default. No
request SHALL be sent to the registry while the user types. Next SHALL be disabled while any check
fails.

#### Scenario: Pattern message from the template

- **WHEN** the user types `pay` into a parameter whose pattern is `^[A-Z][A-Z0-9]{2,15}$` with the
  message "3–16 uppercase letters or digits, starting with a letter."
- **THEN** that message is shown under the input and Next is disabled

#### Scenario: Typing sends nothing

- **WHEN** the user changes any parameter value
- **THEN** no request is sent to the registry

#### Scenario: Maximum selection

- **WHEN** a `select` allows at most 2 values and the user picks a third
- **THEN** the input says at most 2 may be chosen and Next is disabled

### Requirement: Next runs one dry run

Next SHALL ask the registry for one dry run with the parameter values and open Review & create with
its result. Review SHALL show every field of the rendered component, grouped as in the regular
wizard's Review, and every problem. While a dry run runs, Create SHALL be disabled.

#### Scenario: Valid parameters

- **WHEN** every parameter passes and the user presses Next
- **THEN** one dry run is sent and Review shows the rendered component

#### Scenario: A parameter problem from the registry

- **WHEN** the dry run reports a parameter problem, such as an employee who is no longer active
- **THEN** the wizard returns to Parameters with the message under that parameter

### Requirement: Problems name their parameters

Review SHALL show every problem the dry run reports and every Portal-only create rule the rendered
component breaks (Jira project key and full version format required; VCS path, branch and tag
unless the build system needs no VCS; `ssh://` VCS URL on the ecosystem Bitbucket host; supported
group-ID prefix; complete distribution coordinate for an explicit external component). A problem on
a field filled from parameters SHALL name those parameters, each a link back to Parameters. A
problem on a field the template fixes or leaves to the registry's defaults SHALL be shown as a
template problem, to be reported to an administrator. Create SHALL be disabled while any problem
stands.

#### Scenario: Key already taken

- **WHEN** the dry run reports that the rendered key already exists, from Client code and Plugin
  code
- **THEN** Review shows the message on Component key, names both parameters as links, and Create is
  disabled

#### Scenario: Portal rule on a rendered field

- **WHEN** the rendered VCS path is not an `ssh://` URL on the ecosystem Bitbucket host, built from
  the Client code parameter
- **THEN** Review shows the Portal's message on VCS path, names Client code, and Create is disabled

#### Scenario: Template problem

- **WHEN** a problem is on a field the template fixes
- **THEN** Review shows it as a template problem naming the template and its version, with no
  parameter link

#### Scenario: More problems may follow

- **WHEN** the user fixes the reported create problem and runs the dry run again
- **THEN** Review shows the next problem the registry finds, if any

### Requirement: Overridable fields can be changed on review

Fields the template marks overridable SHALL be editable on Review; every other field SHALL be
read-only. An edited field SHALL be marked "changed from template" and checked as the user types
with the Portal-only rules and the profile field rules. Leaving an edited field SHALL run a new dry
run with the edit as an override. Clearing the edit SHALL remove the override and show the
template's value again.

#### Scenario: Re-checked on leaving the field

- **WHEN** the user edits the overridable VCS path and moves to another field
- **THEN** one dry run is sent with the override, and none was sent while typing

#### Scenario: A non-overridable field

- **WHEN** Review shows a field the template does not mark overridable
- **THEN** it cannot be edited

#### Scenario: The registry refuses the override

- **WHEN** the registry answers 403 to a run with an override
- **THEN** Review shows the registry's message and Create stays disabled

### Requirement: Create from a template

Review SHALL ask for a Jira task key, required, with the regular wizard's format check, and an
optional comment. Create SHALL send the parameter values, overrides, Jira task key and comment to
the registry, asking it to create. On success the wizard SHALL show the success panel with a link to
the new component. On a rejection the wizard SHALL stay on Review with the problems shown.

#### Scenario: Created

- **WHEN** no problem stands, a Jira task key is entered and the user presses Create
- **THEN** the component is created and the success panel links to it

#### Scenario: Jira task key required

- **WHEN** the Jira task key is empty
- **THEN** Create is disabled and the field says it is required

#### Scenario: Rejected on create

- **WHEN** the registry rejects the create with problems
- **THEN** Review shows them and nothing is created

#### Scenario: The template was withdrawn

- **WHEN** the registry answers that the template no longer exists
- **THEN** the wizard returns to the Profile step with that message and shows the current tiles
