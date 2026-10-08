## Purpose

Governs the Create component wizard's Profile step, how the chosen profile classifies the new
component and checks its fields, what the create sends, and the Labels and Build tasks fields.
It does not govern the Component Key's character rule (`component-key-format`), the component
editor, or template tiles.

## ADDED Requirements

### Requirement: Profiles come from the registry

The Profile step SHALL show one tile per profile of kind `regular` returned by the registry's
profile listing, in the order returned, each with the registry's title and description. Profiles
of any other kind SHALL NOT be shown. The listing is read with the user's `ACCESS_COMPONENTS`
permission each time the wizard opens.

#### Scenario: Tiles follow the registry's order

- **WHEN** the registry returns Regular external, Regular internal, Solution and DMP Bundle in
  that order
- **THEN** the Profile step shows those four tiles in that order with the registry's titles and
  descriptions

#### Scenario: A profile added in the registry appears

- **WHEN** an administrator adds a profile and reloads the registry configuration, and the user
  opens the wizard afterwards
- **THEN** its tile is shown

#### Scenario: A non-regular entry is not offered

- **WHEN** the listing contains an entry whose kind is not `regular`
- **THEN** no tile is shown for it

### Requirement: Without profiles the wizard cannot create

When the profile listing cannot be loaded, or contains no `regular` profile, the wizard SHALL
show an error with a way to retry in place of the tiles, and Create SHALL be disabled. This
applies to a clone as well.

#### Scenario: The registry cannot be reached

- **WHEN** the profile listing request fails
- **THEN** the Profile step shows the error and a Retry action, and Create is disabled

#### Scenario: Retry succeeds

- **WHEN** the user presses Retry and the listing now loads
- **THEN** the tiles are shown and the wizard can proceed

### Requirement: An unusable profile cannot be picked

A profile the registry marks as not usable SHALL be shown disabled with the registry's reason,
and SHALL NOT be selectable by click or keyboard. A profile whose classification needs the
solution flag or external distribution set, when field-config does not let the user edit that
flag, SHALL be shown disabled the same way, with the flag named as the reason.

#### Scenario: Disabled tile with reason

- **WHEN** the registry marks the Solution profile as not usable with a reason
- **THEN** its tile is disabled and shows that reason

#### Scenario: A flag the user may not edit

- **WHEN** field-config does not let the user edit `component.solution`
- **THEN** the Solution and DMP Bundle tiles are disabled with a reason naming the solution flag,
  and the regular tiles can be picked

#### Scenario: Keyboard skips it

- **WHEN** the user moves through the tiles with the arrow keys
- **THEN** focus and selection never land on the disabled tile

### Requirement: A profile is pre-selected

A new component SHALL start with the first usable profile selected. A clone SHALL start with
the first usable profile whose classification matches the source and whose field rules the
source's Component Key passes; failing that, the first usable profile whose classification
matches; failing that, none.

#### Scenario: Scratch selects the first usable profile

- **WHEN** a new component is started and the first profile is usable
- **THEN** it is selected

#### Scenario: Clone selects the profile whose rules the key passes

- **WHEN** the source is `payments-dmp-bundle`, a solution with external, explicit
  distribution, and both Solution and DMP Bundle have that classification
- **THEN** DMP Bundle is selected, because the Solution rule rejects the key

#### Scenario: Clone with no matching profile

- **WHEN** no usable profile's classification matches the source
- **THEN** no profile is selected and Create stays disabled until one is chosen

### Requirement: The profile sets the classification

The chosen profile's classification SHALL set the component's solution flag, external
distribution and explicit distribution. The "Has explicit distribution?" question SHALL be
shown only when the profile's explicit distribution is `ask` and the user may edit
`component.distributionExplicit`; the answer SHALL then set it. When the user may not edit it,
the question SHALL NOT be shown and explicit distribution is not sent.

#### Scenario: A solution profile

- **WHEN** a profile with solution, external and explicit distribution is chosen
- **THEN** the component is created as an explicit, external solution and the explicit question
  is not shown

#### Scenario: A profile that asks

- **WHEN** a profile with explicit distribution `ask` is chosen and the user answers No
- **THEN** the component is created without explicit distribution

#### Scenario: The question for a user who may not set it

- **WHEN** a profile with explicit distribution `ask` is chosen and field-config does not let the
  user edit `component.distributionExplicit`
- **THEN** the question is not shown and the create request carries no explicit distribution

### Requirement: Today's pre-filled values are kept

The wizard SHALL pre-fill every field from the same sources as before this change: the
registry's component defaults, the Portal's fallbacks for the full version format and the VCS
branch, the current user as Component Owner, the version prefix following the Component Key,
and for a clone the source component. The explicit and external distribution those values
depend on SHALL come from the pre-selected profile.

#### Scenario: A new component starts as before

- **WHEN** a new component is started and the first usable profile is Regular external
  (external, explicit `ask`)
- **THEN** every field starts with the value it started with before this change

#### Scenario: Defaults follow the pre-selected profile

- **WHEN** the first usable profile is external with explicit distribution `true`, and the
  registry's component defaults carry a copyright
- **THEN** the Copyright field starts with that copyright

#### Scenario: A clone copies the source

- **WHEN** a component is cloned
- **THEN** every field starts with the source's value, as before this change

### Requirement: The chosen profile's field rules are checked while typing

The wizard SHALL check every field rule of the chosen profile, as a match of the whole value,
against the value the create request would carry at the rule's path, while the user types, and
SHALL show the rule's message under the wizard field for that path. A path the request would
not carry, such as a field the user may not edit or a coordinate of another type, SHALL be
checked as an empty value. A rule on a path
the wizard has no field for, or whose pattern the browser cannot compile, SHALL be skipped. The
Component Key's character check SHALL run first; the key's profile rule is shown only once the
character check passes.

#### Scenario: A regular key containing a solution word

- **WHEN** Regular external is chosen and the user types `resolution-service`
- **THEN** the Regular external rule's message is shown under the Component Key and the General
  step is marked invalid

#### Scenario: A solution key that passes

- **WHEN** Solution is chosen and the user types `payments-solution`
- **THEN** no rule message is shown

#### Scenario: Partial match is not enough

- **WHEN** a profile's rule on the key is `[a-z]+` and the user types `payments-1`
- **THEN** the rule's message is shown

#### Scenario: Charset first

- **WHEN** Regular external is chosen and the user types `Solution`
- **THEN** only the character message is shown

#### Scenario: Changing profile re-checks

- **WHEN** the user changes the chosen profile
- **THEN** the Component Key is cleared and later input is checked against the new profile's
  rules

#### Scenario: A value the request would not carry

- **WHEN** the chosen profile has a rule requiring a value at
  `baseConfiguration.mavenArtifacts[0].groupPattern` and the distribution coordinate is a Docker
  image
- **THEN** the rule's message is shown, under the Maven group field

#### Scenario: An unusable pattern is skipped

- **WHEN** a rule's pattern cannot be compiled by the browser
- **THEN** the field shows no message for that rule and Create is not blocked by it

### Requirement: Create names the chosen profile

Create SHALL send the chosen profile's id with the create request. A rejection naming the
profile SHALL be shown on the Profile step; a rejection naming a create-request path SHALL be
shown under the wizard field for that path, on its step. Creating requires
`CREATE_COMPONENTS`, as today.

#### Scenario: The profile is sent

- **WHEN** the user creates a component with DMP Bundle chosen
- **THEN** the create request carries profile `dmp-bundle`

#### Scenario: The registry rejects a rule on a nested path

- **WHEN** the create is rejected with `baseConfiguration.jira.projectKey: <message>`
- **THEN** the wizard opens the Jira step and shows the message under the Jira Project Key

#### Scenario: The registry rejects the profile

- **WHEN** the create is rejected with an error on `profile`
- **THEN** the wizard opens the Profile step and shows the message

### Requirement: Labels can be set on create

The wizard SHALL offer a Labels field on the General step, offering only labels from the
registry's labels list, shown on Review and sent with the create. The field SHALL follow the
field-config visibility of `component.labels`. A clone SHALL start with the source's labels.

#### Scenario: Labels are created with the component

- **WHEN** the user picks two labels and creates the component
- **THEN** the create request carries those two labels and Review lists them

#### Scenario: Only listed labels

- **WHEN** the user types a label that is not in the registry's labels list
- **THEN** it cannot be added

#### Scenario: No labels

- **WHEN** the user picks no labels
- **THEN** the create request carries no labels

### Requirement: Build tasks can be set on create

The wizard SHALL offer a Build tasks field on the Build step, shown on Review and sent with the
create; a blank value SHALL NOT be sent. The field SHALL follow the field-config visibility of
`build.buildTasks`. A clone SHALL start with the source's build tasks.

#### Scenario: Build tasks are created with the component

- **WHEN** the user enters `clean build` and creates the component
- **THEN** the create request's build configuration carries build tasks `clean build`

#### Scenario: Blank build tasks

- **WHEN** the field is left blank
- **THEN** the create request carries no build tasks

#### Scenario: Hidden by field-config

- **WHEN** field-config hides `build.buildTasks`
- **THEN** the field is not shown and no build tasks are sent from it
