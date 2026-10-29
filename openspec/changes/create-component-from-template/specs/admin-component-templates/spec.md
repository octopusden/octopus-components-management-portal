## Purpose

Governs the Templates tab of Admin settings: what an administrator sees about the registry's
profiles and templates, a template's details, and trying a template without creating anything. It
does not govern creating components or changing templates.

## ADDED Requirements

### Requirement: Only administrators see the Templates tab

Admin settings SHALL show a Templates tab to users with the `IMPORT_DATA` permission, as for the
rest of the page. Users without it SHALL NOT reach the tab or its data.

#### Scenario: Administrator

- **WHEN** a user with `IMPORT_DATA` opens Admin settings
- **THEN** the Templates tab is offered

#### Scenario: Not an administrator

- **WHEN** a user without `IMPORT_DATA` opens the Templates tab's address
- **THEN** the page is not available

### Requirement: Every profile and template with its status

The tab SHALL list every profile and template the registry has configured, live or failed, with
id, kind ("unknown" when the registry could not read it) and status, and for a live entry its
title and version. A failed entry SHALL show every problem the registry reported and its
configuration text, so an administrator can see what was read. Above the list the tab SHALL show
the last configuration load's result and problems, the configuration version, and that templates
change by a reviewed change to service-config followed by a configuration reload. The list SHALL
be read again each time the tab opens.

#### Scenario: A failed template

- **WHEN** a template failed to load with two problems
- **THEN** it is listed as failed and shows both problems and its configuration text

#### Scenario: The last load failed

- **WHEN** the last reload was not applied
- **THEN** the tab says so with the registry's reasons, and the list shows the configuration still
  in use

### Requirement: A template's details

For a live template the tab SHALL show its parameters with their type, label, required flag,
default and type-specific settings; its classification; its overridable fields; and its
configuration text with a copy button.

#### Scenario: Parameters listed

- **WHEN** an administrator opens a template's details
- **THEN** every parameter is listed with its settings, in the template's order

#### Scenario: Copy the configuration

- **WHEN** the administrator presses Copy on the configuration text
- **THEN** the text is copied as shown

### Requirement: Try a template

A live template's details SHALL offer Try it: the same parameter form and local checks as the
Create wizard, and on Run one dry run whose result is shown as on Review — every rendered field
with the parameters it came from, and every problem, including the Portal-only create rules.
Nothing SHALL be created, and no field can be edited.

#### Scenario: Sample values

- **WHEN** the administrator enters sample values and presses Run
- **THEN** the tab shows every problem and the rendered component with each field's source
  parameters, and nothing is created
