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

CRS supplies no reason on a blocking entry that reports outstanding work. For such an entry Portal SHALL state what is wrong, derived from the target's kind. Where CRS does supply a reason, Portal SHALL present CRS's reason rather than substituting its own.

Where CRS reports open issues on an entry, they SHALL be listed and SHALL link to the issue tracker. CRS supplies no URL for an issue or for a target, so Portal SHALL construct the link; when the issue-tracker base URL is not configured, the issues SHALL still be listed, without links.

#### Scenario: Every reported entry appears

- **WHEN** the readiness answer contains entries for an issue-tracker project, its open issues, two TeamCity projects and one repository
- **THEN** the view shows five rows, each naming its target

#### Scenario: A blocking entry says what is wrong

- **WHEN** a repository entry blocks and CRS supplies no reason for it
- **THEN** that entry states the repository is not archived

#### Scenario: Blocking wording follows the target's kind

- **WHEN** a TeamCity project entry and a repository entry both block with no reason supplied
- **THEN** each states what is outstanding for its own kind of target

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

A person opening this view is deciding what to do next. A row reading *"the repository is not archived"* names a fact and leaves them to work out the verb, the system and the step; a row reading *"Archive the repository"* is the same information already turned into work. CRS supplies no prose on these entries, so Portal is writing the sentence either way — this requires that it write the useful one.

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

### Requirement: A row that owes work is badged with who owes it

Portal SHALL show, on every entry that does not report `COMPLETED`, a badge naming the responsible party CRS reported. An entry reporting `COMPLETED` SHALL carry no such badge.

The badge SHALL be visually distinct from the outcome, so the two are read separately: the outcome says whether this step is done, the badge says whose step it is. Someone scanning the view for their own work reads badges; someone doing the work reads instructions.

Portal SHALL take the party from the response rather than deriving it from the target kind, so the two sides cannot drift apart. A party Portal does not recognise SHALL be shown as reported rather than omitted or guessed at.

#### Scenario: An open-issues row is badged to the component owner

- **WHEN** an open-issues entry reports `NOT_COMPLETED` with the component owner responsible
- **THEN** the row carries a badge naming the component owner

#### Scenario: An infrastructure row is badged to the platform team

- **WHEN** a repository entry reports `NOT_COMPLETED` with the platform team responsible
- **THEN** the row carries a badge naming the platform team

#### Scenario: The badge is separate from the outcome

- **WHEN** a row shows both an outcome and a responsibility badge
- **THEN** the two are distinguishable from each other

#### Scenario: Two rows owed by different parties are distinguishable

- **WHEN** one row is owed by the component owner and another by the platform team
- **THEN** their badges differ, so a reader can tell which work is theirs

#### Scenario: A completed row carries no badge

- **WHEN** an entry reports `COMPLETED`
- **THEN** the row carries no responsibility badge

#### Scenario: An unrecognised party is shown as reported

- **WHEN** an entry names a responsible party Portal does not recognise
- **THEN** the badge shows what was reported, and the row is not left unbadged

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
