## Purpose

Governs the Create component wizard's Profile step and the regular create. This delta adds template
tiles to the Profile step; the template's own steps are governed by `component-templates`.

## MODIFIED Requirements

### Requirement: Profiles come from the registry

The Profile step SHALL show one tile per entry of kind `regular` or `template` returned by the
registry's profile listing, in the order returned, each with the registry's title and description.
A template tile SHALL also show its version and a "Template" marker. Entries of any other kind
SHALL NOT be shown. Template tiles SHALL be offered for a new component only, not for a clone. The
listing is read with the user's `ACCESS_COMPONENTS` permission each time the wizard opens; the
wizard SHALL wait for that fresh listing rather than open on a cached one, and SHALL keep it while
open.

#### Scenario: Tiles follow the registry's order

- **WHEN** the registry returns Regular external, Regular internal, Solution, DMP Bundle and the
  template "Client plugin" in that order
- **THEN** the Profile step shows those five tiles in that order with the registry's titles and
  descriptions, the last marked as a template with its version

#### Scenario: A profile added in the registry appears

- **WHEN** an administrator adds a profile or template and reloads the registry configuration, and
  the user opens the wizard afterwards
- **THEN** its tile is shown

#### Scenario: A changed rule is followed after a reload

- **WHEN** an administrator changes a profile's field rule and reloads the registry
  configuration, and the user opens the wizard afterwards
- **THEN** the wizard checks the changed rule, with no Portal change

#### Scenario: An unknown kind is not offered

- **WHEN** the listing contains an entry whose kind is neither `regular` nor `template`
- **THEN** no tile is shown for it

#### Scenario: No templates for a clone

- **WHEN** the user clones a component and the listing contains templates
- **THEN** the Profile step shows only the regular profiles

#### Scenario: Templates but no regular profile

- **WHEN** the listing contains templates and no `regular` profile
- **THEN** the Profile step shows the template tiles and, beside them, the classification
  choices offered when the registry has no profiles

### Requirement: A profile is pre-selected

A new component SHALL start with the first usable regular profile selected; a template SHALL never
be pre-selected. When no regular profile is usable, none is selected and nothing can be created
until the user picks a usable template. A clone SHALL start with the first usable profile whose
classification matches the source and whose field rules the source's Component Key passes; failing
that, the first usable profile whose classification matches. When no profile has the source's
classification, the clone sets it directly, starting from the source's (see "The classification is
chosen directly"); when only profiles the user may not use have it, none is selected and the clone
cannot be created.

#### Scenario: Scratch selects the first usable profile

- **WHEN** a new component is started and the first regular profile is usable
- **THEN** it is selected

#### Scenario: A template listed first is not pre-selected

- **WHEN** the registry lists a template before every regular profile
- **THEN** the first usable regular profile is selected, not the template

#### Scenario: Only templates are usable

- **WHEN** a new component is started and every regular profile is marked not usable, but a
  template is usable
- **THEN** no profile is selected, Next is disabled, and picking the template leads to its
  Parameters

#### Scenario: Clone selects the profile whose rules the key passes

- **WHEN** the source is `payments-dmp-bundle`, a solution with external, explicit
  distribution, and both Solution and DMP Bundle have that classification
- **THEN** DMP Bundle is selected, because the Solution rule rejects the key

#### Scenario: Clone with no matching profile

- **WHEN** no profile's classification matches the source
- **THEN** the clone opens on General; its Profile step says no profile matches and offers the
  classification choices, starting from the source's; no profile is sent

#### Scenario: Clone whose matching profiles the user may not use

- **WHEN** a solution is cloned and the Solution and DMP Bundle profiles are not usable for the
  user
- **THEN** the clone opens on the Profile step with those tiles disabled and their reason, and
  Create stays disabled

## ADDED Requirements

### Requirement: The Portal-only create rules are unchanged

The regular wizard SHALL keep checking, with today's messages and on today's fields: Jira project
key and full version format required; VCS path, branch and tag unless the build system needs no VCS;
an `ssh://` VCS URL on the ecosystem Bitbucket host; a supported group-ID prefix; and a complete
distribution coordinate for an explicit external component. Template review applies the same rules
(`component-templates`).

#### Scenario: VCS host on the regular wizard

- **WHEN** a regular create's VCS path is an `ssh://` URL on another host
- **THEN** the VCS step shows "VCS host must be <ecosystem host> (the ecosystem Bitbucket)", as
  today
