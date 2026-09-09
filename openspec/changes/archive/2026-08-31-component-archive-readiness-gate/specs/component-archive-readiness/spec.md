## Purpose

Defines how Portal gates archiving a component on CRS's archive-readiness verdict, how it presents each target's outcome — including targets that passed because other live components share them, and blocking outcomes whose remedy differs — and how it behaves when CRS reports that nothing was checked.

Archiving is governed by `DELETE_COMPONENTS`, which is also the permission CRS's readiness endpoint itself requires. Everything in this spec applies to a component that is not yet archived; restoring an archived component is governed by `ARCHIVE_COMPONENTS` and is out of scope.

Portal never decides readiness. It does not consult the external systems, does not determine whether a target is shared, does not classify an unreadable target, and does not re-derive or second-guess CRS's verdict. It renders the answer and refuses to proceed when the verdict says so.

CRS does not enforce readiness when the flag is written — the answer is advisory by CRS's own decision, and every CRS write path is unchanged. Portal's gate is therefore the only gate, and it constrains Portal's own UI, not the API.

## ADDED Requirements

### Requirement: Archiving a live component requires CRS's readiness verdict

Choosing Archive SHALL NOT archive the component. Portal SHALL first request readiness from CRS and present the outcome, and SHALL offer to proceed only when CRS's verdict says the component is ready. Portal SHALL take that verdict from the response rather than deriving one from the individual entries, so that an outcome value Portal does not recognise cannot unblock archiving.

There SHALL be no way to archive a component from Portal that CRS did not report as ready — no override control, no confirmation that bypasses the verdict, and no path that submits the flag directly.

Readiness SHALL be requested when someone asks to archive, not when the component is loaded. The answer is assembled from live calls to external systems, and every component detail view would otherwise wait on them.

#### Scenario: Archive opens the readiness view instead of archiving

- **WHEN** a user with `DELETE_COMPONENTS` chooses Archive on a component that is not archived
- **THEN** the component is not archived, and the readiness outcome for each target is presented

#### Scenario: Readiness is not fetched on component load

- **WHEN** a component detail view is opened and Archive has not been chosen
- **THEN** no readiness request is made

#### Scenario: A component CRS reports as not ready cannot be archived

- **WHEN** the readiness answer reports that the component is not ready
- **THEN** no control is offered that archives the component, and the component stays unarchived

#### Scenario: A ready component can be archived after confirming

- **WHEN** the readiness answer reports that the component is ready
- **AND** the user confirms
- **THEN** Portal submits the archive request

#### Scenario: The verdict governs, not the entries

- **WHEN** the readiness answer reports that the component is not ready and every entry carries an outcome Portal does not recognise
- **THEN** archiving is not offered

#### Scenario: Archive is unavailable without the permission

- **WHEN** a user without `DELETE_COMPONENTS` views a component that is not archived
- **THEN** no Archive affordance is offered

#### Scenario: A failed readiness request is not an empty answer

- **WHEN** the readiness request itself fails
- **THEN** the failure is presented as such, archiving is not offered, and the view does not present an empty or passing outcome

### Requirement: Each target is listed with its own outcome, and Portal supplies the blocking wording

The readiness view SHALL list every entry CRS reported as its own row carrying that target's kind and identity. Entries SHALL NOT be collapsed into a single aggregate verdict, and a passing entry SHALL NOT be omitted.

CRS's reason on an entry diagnoses the state. Portal SHALL present that reason where one is supplied, and SHALL additionally state the step it implies — see the requirement on stating the action. Neither replaces the other. Where no reason is supplied, the entry SHALL still carry Portal's own wording, because `reason` remains nullable in the contract.

Where CRS reports open issues on an entry, they SHALL be listed and SHALL link to the issue tracker. CRS supplies no URL for an issue or for a target, so Portal SHALL construct the link; when the issue-tracker base URL is not configured, the issues SHALL still be listed, without links.

#### Scenario: Every reported entry appears

- **WHEN** the readiness answer contains entries for an issue-tracker project, its open issues, two TeamCity projects and one repository
- **THEN** the view shows five rows, each naming its target

#### Scenario: A blocking entry shows both the diagnosis and the step

- **WHEN** a repository entry blocks carrying a reason from CRS
- **THEN** the row shows that reason and, separately, the instruction it implies

#### Scenario: A blocking entry with no reason is not left silent

- **WHEN** a repository entry blocks and no reason is supplied
- **THEN** that entry still carries wording of Portal's own

#### Scenario: A supplied reason is preferred over Portal's wording

- **WHEN** an entry carries a reason from CRS
- **THEN** that reason is shown

#### Scenario: Passing entries are not hidden

- **WHEN** three entries pass and one blocks
- **THEN** all four rows are shown, not only the blocking one

#### Scenario: Open issues are listed and linked

- **WHEN** an entry reports open issues and the issue-tracker base URL is configured
- **THEN** each issue is listed and links to the issue tracker

#### Scenario: Open issues without a configured base URL are still listed

- **WHEN** an entry reports open issues and no issue-tracker base URL is configured
- **THEN** each issue is listed without a link

### Requirement: A row that owes work states the action, not the state

For every entry that does not report `COMPLETED`, Portal SHALL state what someone has to do, phrased as an instruction. It SHALL NOT stop at naming the state the target is in.

A person opening this view is deciding what to do next. A row reading *"the repository is not archived"* names a fact and leaves them to work out the verb, the system and the step; a row reading *"Archive the repository"* is the same information already turned into work. CRS's reason supplies the first; this requirement supplies the second, and both appear.

The instruction SHALL be specific to the target's kind and SHALL name the target it applies to. Where CRS supplies its own reason, that reason SHALL still be shown; the instruction SHALL accompany it rather than replace it.

#### Scenario: A repository row says what to do

- **WHEN** a repository entry reports `NOT_COMPLETED`
- **THEN** the row instructs the reader to archive that repository, rather than only reporting that it is not archived

#### Scenario: A build project row says what to do

- **WHEN** a TeamCity project entry reports `NOT_COMPLETED`
- **THEN** the row instructs the reader to archive that project

#### Scenario: An issue-tracker project row says what to do

- **WHEN** an issue-tracker project entry reports `NOT_COMPLETED`
- **THEN** the row instructs the reader to move that project into the retired category

#### Scenario: An open-issues row says what to do

- **WHEN** an open-issues entry reports `NOT_COMPLETED`
- **THEN** the row instructs the reader to close the listed issues

#### Scenario: A supplied reason is kept alongside the instruction

- **WHEN** an entry carries a reason from CRS and still owes work
- **THEN** both the reason and the instruction are shown

#### Scenario: A completed row carries no instruction

- **WHEN** an entry reports `COMPLETED`
- **THEN** the row carries no instruction to act

### Requirement: A row that owes work names who is responsible for it

Portal SHALL show, on every entry that does not report `COMPLETED`, an explicit statement of who is responsible for the work. It SHALL read as an assignment rather than a category tag — a label naming the party, not a bare role chip a reader has to interpret.

For work belonging to the component owner, that party SHALL be named as a **person**, using the owner the component records. A role label alone does not tell a reader whether the row is theirs. When the component records no owner, the role SHALL be named instead.

For work belonging to the platform team, the party SHALL be named **collectively**. No individual owns archiving infrastructure, so naming one would be wrong.

Where the reader is the person responsible, the row SHALL say so rather than naming them back to themselves, and SHALL be visually emphasised over rows that are somebody else's. A reader who is not signed in, or who is not the owner, SHALL NOT see a row marked as theirs.

The statement SHALL be distinguishable from the outcome: the outcome says whether the step is done, this says whose step it is. An entry reporting `COMPLETED` SHALL carry no such statement.

A party Portal does not recognise SHALL be named as reported rather than omitted, so a row never loses its owner.

#### Scenario: Each blocking row is assigned to a party

- **WHEN** an open-issues entry and a repository entry both report `NOT_COMPLETED`
- **THEN** the first is assigned to the component owner and the second to the platform team

#### Scenario: The statement reads as an assignment and names the person

- **WHEN** an open-issues entry reports `NOT_COMPLETED` and the component records an owner
- **THEN** the row states that someone is responsible and names that owner

#### Scenario: Infrastructure work names the team, not a person

- **WHEN** a repository entry reports `NOT_COMPLETED`
- **THEN** the row names the platform team, and does not name the component's owner

#### Scenario: A reader is told when the work is their own

- **WHEN** the reader is the component's owner and an open-issues entry reports `NOT_COMPLETED`
- **THEN** the row says the work is theirs, rather than naming them, and is emphasised over rows owed by others

#### Scenario: A row owed by someone else is not marked as the reader's

- **WHEN** the reader is not the component's owner and an open-issues entry reports `NOT_COMPLETED`
- **THEN** the row is not marked as the reader's own work

#### Scenario: A component with no recorded owner names the role

- **WHEN** an open-issues entry reports `NOT_COMPLETED` and the component records no owner
- **THEN** the row names the component-owner role rather than a person

#### Scenario: The assignment is separate from the outcome

- **WHEN** a blocking row shows both an outcome and an assignment
- **THEN** the two are distinguishable from each other

#### Scenario: A completed row assigns nobody

- **WHEN** an entry reports `COMPLETED`
- **THEN** the row carries no assignment

#### Scenario: An unrecognised party is named as reported

- **WHEN** a responsible party Portal does not recognise reaches the row
- **THEN** it is named as reported, and the row is not left unassigned

### Requirement: Targets that passed because live components share them are named

An entry that passed carrying a non-empty list of components sharing its target SHALL say that the target was not required to be archived, and SHALL name those components. When more than one such entry is present, the view SHALL open with a summary line stating how many targets were not required to be archived.

Such an entry SHALL be presented distinguishably from an entry that passed without a sharing list. The two mean different things about the state of the external system — one was retired, one was left in place for another component — and a reader who cannot tell them apart will believe the whole component was retired.

Portal SHALL NOT state that a shared target is still live. CRS reports sharing in preference to the target's own archived state, so the response does not establish it.

These entries SHALL NOT affect whether archiving is offered; the verdict alone governs that.

#### Scenario: A shared target names the components keeping it in place

- **WHEN** a TeamCity project entry passed carrying two other live component names
- **THEN** that entry says the project was not required to be archived and names both components

#### Scenario: A summary line appears when several targets were not required to be archived

- **WHEN** two entries passed carrying sharing lists
- **THEN** the view opens with a line stating that two targets were not required to be archived

#### Scenario: One such entry produces no summary line

- **WHEN** exactly one entry passed carrying a sharing list
- **THEN** no such summary line is shown

#### Scenario: No summary line when no target was shared

- **WHEN** every passing entry carries an empty sharing list
- **THEN** no such summary line is shown

#### Scenario: The count comes from the entries

- **WHEN** a passing entry carries an empty sharing list
- **THEN** it is not counted towards the summary line

#### Scenario: Shared reads differently from archived

- **WHEN** one entry passed with an empty sharing list and another passed with a non-empty one
- **THEN** the two entries are distinguishable from each other without expanding either

### Requirement: A target whose state could not be read blocks, and its wording follows the remedy

When CRS reports that a target's state could not be determined, Portal SHALL present it distinguishably from a target reported as having outstanding work, and SHALL indicate that the check could not be completed rather than stating that the target is not archived.

CRS classifies why the state could not be read. Portal SHALL present the wording that matches the classification:

- a system that could not be consulted SHALL be worded as retryable;
- unresolvable registry data SHALL be worded as needing the component's recorded data corrected, and SHALL NOT be worded as retryable;
- missing CRS configuration SHALL be worded as needing that configuration fixed, and SHALL NOT be worded as retryable.

A control that requests readiness again SHALL be offered, without leaving the view, only where the classification is one that retrying can change.

#### Scenario: An unreadable target blocks

- **WHEN** one entry reports that its state could not be determined and CRS's verdict is not ready
- **THEN** archiving is not offered

#### Scenario: Unreadable is worded as a failed check, not as unfinished work

- **WHEN** an entry reports that its state could not be determined
- **THEN** it says the check could not be completed, and does not state that the target is not archived

#### Scenario: Unreadable reads differently from outstanding work

- **WHEN** one entry reports outstanding work and another reports that its state could not be determined
- **THEN** the two entries are distinguishable from each other

#### Scenario: An unreachable system offers a retry

- **WHEN** an entry reports that its state could not be determined because a system could not be consulted
- **THEN** a control is offered that requests readiness again without closing the view

#### Scenario: Unresolvable registry data does not offer a retry

- **WHEN** an entry reports that its state could not be determined because the recorded data is unresolvable
- **THEN** it states that the component's recorded data needs correcting, and no retry control is offered for it

#### Scenario: Missing configuration does not offer a retry

- **WHEN** an entry reports that its state could not be determined because a CRS configuration is missing
- **THEN** it states that the configuration needs fixing, and no retry control is offered for it

### Requirement: An answer with no entries is not presented as a passing check

When CRS reports no entries, Portal SHALL state that no checks ran. It SHALL NOT present an empty list of passing rows, and SHALL NOT imply that any target was verified.

Portal SHALL still follow CRS's verdict in deciding whether to offer archiving. Refusing on an empty answer would be Portal overruling the verdict it does not own.

#### Scenario: An empty ready answer says nothing was checked

- **WHEN** the readiness answer contains no entries and reports the component as ready
- **THEN** the view states that no checks ran

#### Scenario: An empty answer does not render as a clean result

- **WHEN** the readiness answer contains no entries
- **THEN** no passing row is shown and nothing states that a target was verified

#### Scenario: The verdict still governs an empty answer

- **WHEN** the readiness answer contains no entries and reports the component as ready
- **AND** the user confirms
- **THEN** Portal submits the archive request

### Requirement: Restoring an archived component is unchanged

Un-archiving SHALL keep its current behaviour: offered on an archived component to a user with `ARCHIVE_COMPONENTS`, with no readiness check. Readiness governs retiring a component, not restoring the record.

#### Scenario: Unarchive runs no readiness check

- **WHEN** a user with `ARCHIVE_COMPONENTS` restores an archived component
- **THEN** no readiness request is made and the component is restored

#### Scenario: An archived component offers no readiness view

- **WHEN** an archived component is viewed
- **THEN** no readiness view or Archive affordance is offered
