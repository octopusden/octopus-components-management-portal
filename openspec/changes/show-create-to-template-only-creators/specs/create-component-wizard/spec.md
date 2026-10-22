## Purpose

Changes to the Create component wizard's entries for template-only creators: who sees New
Component, and that Copy and Clone stay with `CREATE_COMPONENTS`. Template review is governed by
`component-templates`.

## ADDED Requirements

### Requirement: New Component for either create permission

The **New Component** button on the component list and the **New Component** action in the
command palette SHALL be shown to a user holding `CREATE_COMPONENTS` or `CREATE_FROM_TEMPLATE`,
and SHALL NOT be shown to a user holding neither. Both SHALL open the wizard's Profile step.

#### Scenario: Template-only creator sees New Component

- **WHEN** a user holding `CREATE_FROM_TEMPLATE` and not `CREATE_COMPONENTS` opens the component
  list
- **THEN** the New Component button is shown

#### Scenario: Template-only creator in the command palette

- **WHEN** a user holding `CREATE_FROM_TEMPLATE` and not `CREATE_COMPONENTS` opens the command
  palette
- **THEN** the New Component action is offered, and choosing it opens the Profile step

#### Scenario: Regular creator unchanged

- **WHEN** a user holding `CREATE_COMPONENTS` opens the component list or the command palette
- **THEN** New Component is shown, as today

#### Scenario: Neither permission

- **WHEN** a user holding neither `CREATE_COMPONENTS` nor `CREATE_FROM_TEMPLATE` opens the
  component list or the command palette
- **THEN** New Component is not shown

#### Scenario: Regular profiles not usable for a template-only creator

- **WHEN** a template-only creator opens the Profile step and the registry marks every regular
  profile not usable with the reason "You may create components from templates only"
- **THEN** those tiles are disabled with that reason, no profile is selected, and the template
  tiles can be picked

### Requirement: Copy needs CREATE_COMPONENTS

**Copy** on a component list row and **Clone** on the component page SHALL be shown only to a
user holding `CREATE_COMPONENTS`. `CREATE_FROM_TEMPLATE` SHALL NOT show them: a copy opens the
regular wizard.

#### Scenario: Template-only creator on the list

- **WHEN** a user holding `CREATE_FROM_TEMPLATE` and not `CREATE_COMPONENTS` opens the component
  list
- **THEN** no row offers Copy

#### Scenario: Template-only creator on the component page

- **WHEN** a user holding `CREATE_FROM_TEMPLATE` and not `CREATE_COMPONENTS` opens a component
- **THEN** the Clone button is not shown
