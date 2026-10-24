## Purpose

Defines what the Portal accepts as a Component Key when a person creates or renames a
component, and how that depends on the component's Client Code.

The Portal's check is a pre-submit mirror of CRS SYS-095 — CRS is the enforcing side. The
two must agree: a key the Portal accepts and CRS rejects is a 400 the user cannot explain,
and a key the Portal rejects and CRS accepts is a rule only Portal users are held to.

## Requirements

### Requirement: A Component Key may carry an underscore only inside its client-code prefix

When creating or renaming a component, the Portal SHALL accept a Component Key that
matches `[a-z][a-z0-9-]*` with no underscore, **or** — when the component's Client Code is
non-blank — a key that begins with the lowercased Client Code (its underscores included)
followed by either the end of the key or `-` and a `[a-z0-9-]*` tail.

The Portal SHALL reject every other key, including a key whose underscore falls outside
that leading prefix, and SHALL NOT accept uppercase in a key regardless of the Client
Code's own casing. The prefix relaxes the charset, never the letter start: a Client Code
may begin with a digit or an underscore (`[A-Z_0-9]+`), and a Component Key SHALL start
with a lowercase letter either way.

#### Scenario: An underscore inside the client-code prefix is accepted

- **WHEN** the Client Code is `AB_CD` and the Component Key is `ab_cd-payments`
- **THEN** the key is accepted

#### Scenario: The bare client-code prefix is accepted

- **WHEN** the Client Code is `AB_CD` and the Component Key is `ab_cd`
- **THEN** the key is accepted

#### Scenario: An underscore with no Client Code is rejected

- **WHEN** the Client Code is empty and the Component Key is `ab_cd-payments`
- **THEN** the key is rejected

#### Scenario: A Client Code without an underscore grants none

- **WHEN** the Client Code is `ABCD` and the Component Key is `ab_cd-payments`
- **THEN** the key is rejected

#### Scenario: The prefix must lead

- **WHEN** the Client Code is `AB_CD` and the Component Key is `payments-ab_cd`
- **THEN** the key is rejected

#### Scenario: An uppercase key is rejected even when it matches the Client Code

- **WHEN** the Client Code is `AB_CD` and the Component Key is `AB_CD-payments`
- **THEN** the key is rejected

#### Scenario: A digit-leading key is rejected even when the Client Code leads with that digit

- **WHEN** the Client Code is `123ABC` and the Component Key is `123abc-payments`
- **THEN** the key is rejected

#### Scenario: A key that is nothing but an underscore Client Code is rejected

- **WHEN** the Client Code is `_` and the Component Key is `_`
- **THEN** the key is rejected

#### Scenario: A plain kebab key needs no Client Code

- **WHEN** the Client Code is empty and the Component Key is `plain-component`
- **THEN** the key is accepted

### Requirement: A rejected key names the prefix that would make it legal

When a Component Key is rejected and the component has a non-blank Client Code, the
message SHALL name the client-code prefix that would legalise an underscore. When there is
no Client Code, the message SHALL state the plain charset rule.

#### Scenario: The message names the prefix

- **WHEN** the Client Code is `AB_CD` and the user types `payments_1`
- **THEN** the error message names `ab_cd` as the prefix an underscore must sit inside

#### Scenario: The generic message is used with no Client Code

- **WHEN** the Client Code is empty and the user types `payments_1`
- **THEN** the error message states that a key is lowercase letters, digits and `-`,
  starting with a letter

### Requirement: Editing the Client Code re-validates the Component Key

Because key legality depends on the Client Code, the Portal SHALL re-validate the
Component Key whenever the Client Code changes, in both the create wizard and the
component editor — without the user touching the key field.

#### Scenario: A key becomes legal when the Client Code is filled in

- **GIVEN** the Component Key is `ab_cd-payments` and is flagged because no Client Code is set
- **WHEN** the user enters the Client Code `AB_CD`
- **THEN** the key is no longer flagged

#### Scenario: A key becomes illegal when the Client Code is cleared

- **GIVEN** the Component Key is `ab_cd-payments` and the Client Code is `AB_CD`
- **WHEN** the user clears the Client Code
- **THEN** the key is flagged

### Requirement: On create, the key is validated against the Client Code that is actually sent

The Client Code a create request carries is not always the form field: a Client Code the
field-config makes non-editable is stripped from the payload, and when the component is not
external the form value is ignored in favour of a cloned source's code. The Portal SHALL
validate the Component Key against that effective value, so a key it accepts is never one
CRS rejects for a Client Code that never arrived.

#### Scenario: A non-editable Client Code grants nothing

- **GIVEN** a create flow whose `component.clientCode` is not editable
- **WHEN** the user's key is `ab_cd-copy` and the form holds the Client Code `AB_CD`
- **THEN** the key is rejected, because the payload will not carry that code

#### Scenario: Switching away from an external profile withdraws the Client Code

- **GIVEN** a from-scratch create where the user entered the Client Code `AB_CD` while external
- **WHEN** the profile is switched to a non-external one and the key is `ab_cd-copy`
- **THEN** the key is rejected, because a non-external create does not send the form's code

#### Scenario: A clone that is not external keeps its source's Client Code

- **GIVEN** a clone of a component whose stored Client Code is `AB_CD`, on a non-external profile
- **WHEN** the key is `ab_cd-copy`
- **THEN** the key is accepted, because the payload preserves the source's code

### Requirement: A hidden Client Code still counts when it is populated

A Client Code hidden by field-config SHALL still grant the underscore when it is populated
on the component being renamed, matching CRS's use of the effective (persisted) value. On
create, a Client Code the Portal does not collect grants nothing, because no value would
be persisted.

#### Scenario: Renaming a component whose hidden Client Code is populated

- **GIVEN** a component whose stored Client Code is `AB_CD`, with `component.clientCode` hidden by field-config
- **WHEN** the user renames it to `ab_cd-payments`
- **THEN** the rename target is accepted

#### Scenario: Creating with no collected Client Code

- **GIVEN** a create flow that does not collect a Client Code
- **WHEN** the user types `ab_cd-payments`
- **THEN** the key is rejected

### Requirement: An illegal rename target blocks Save, and a cleared key is not a violation

The editor SHALL block Save while the rename target is illegal, the way it already blocks
on the other client-detectable problems (artifact ownership, Group ID prefixes, VCS hosts),
so the PATCH is never sent to be rejected with a 400 the user could have been shown first.
The blocked Save and the inline field error SHALL be derived from the same check, so they
cannot disagree.

A blank Component Key SHALL NOT be reported as a format violation: the update request omits
a blank name entirely, so a cleared field is a rename not yet attempted.

#### Scenario: Save is blocked while the rename target is illegal

- **GIVEN** a component with no Client Code
- **WHEN** the user renames it to `ab_cd-payments`
- **THEN** Save is disabled and names the Component Key as the reason

#### Scenario: Save stays available for a legal rename

- **GIVEN** a component whose stored Client Code is `AB_CD`
- **WHEN** the user renames it to `ab_cd-payments`
- **THEN** Save is not blocked by the key

#### Scenario: Clearing the key mid-retype reports nothing

- **WHEN** the user clears the Component Key field
- **THEN** no format error is shown, because a blank name is omitted from the request
