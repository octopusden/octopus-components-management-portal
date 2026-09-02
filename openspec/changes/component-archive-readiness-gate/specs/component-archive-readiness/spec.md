## Purpose

Defines how Portal gates archiving a component on CRS's archive-readiness answer, how it presents each target's outcome — including targets deliberately left alone because other live components share them — and how it behaves when the check cannot be completed.

The gate is Portal's. CRS supplies the verdict but does not enforce it: the archive request Portal issues after the gate passes is the request it issues today, unchanged.

Archiving is governed by `DELETE_COMPONENTS`. Everything here applies to a component that is not yet archived; restoring an archived component is governed by `ARCHIVE_COMPONENTS` and is out of scope.

Portal never decides readiness. It does not consult the external systems, does not determine whether a target is shared, does not re-derive the verdict from the entries, and does not second-guess an outcome CRS reported. It renders the answer and refuses to proceed when the answer says so. The response shape all of this reads is recorded in `design.md`.

## ADDED Requirements

### Requirement: Archiving a live component requires a readiness verdict from CRS

Choosing Archive SHALL NOT archive the component. Portal SHALL first request readiness from CRS and present the outcome, and SHALL offer to proceed only when CRS reports the component ready. There SHALL be no way to archive from Portal otherwise — no override control, no confirmation that bypasses the verdict, and no path that submits the flag directly.

The gate SHALL follow CRS's `ready` verdict. Portal SHALL NOT compute readiness from the entries, so that an outcome value Portal does not recognise can never unblock it.

Readiness SHALL be requested when someone asks to archive, not when the component is loaded.

#### Scenario: Archive opens the readiness view instead of archiving

- **WHEN** a user with `DELETE_COMPONENTS` chooses Archive on a component that is not archived
- **THEN** the component is not archived, and the readiness outcome for each target is presented

#### Scenario: Readiness is not fetched on component load

- **WHEN** a component detail view is opened and Archive has not been chosen
- **THEN** no readiness request is made

#### Scenario: A component reported not ready cannot be archived

- **WHEN** CRS reports the component not ready
- **THEN** no control is offered that archives the component, and the component stays unarchived

#### Scenario: A component reported ready can be archived after confirming

- **WHEN** CRS reports the component ready
- **AND** the user confirms
- **THEN** Portal submits the archive request

#### Scenario: The verdict is taken from CRS, not derived

- **WHEN** CRS reports the component not ready while every entry it returned carries a passing outcome
- **THEN** archiving is still not offered

#### Scenario: An unrecognised outcome does not unblock the gate

- **WHEN** CRS reports the component not ready and an entry carries an outcome value Portal does not recognise
- **THEN** archiving is not offered, and the entry is rendered without claiming the target passed

#### Scenario: Archive is unavailable without the permission

- **WHEN** a user without `DELETE_COMPONENTS` views a component that is not archived
- **THEN** no Archive affordance is offered

### Requirement: The readiness request has a visible loading state that says what is happening

While the readiness request is in flight, Portal SHALL show that the check is running and SHALL indicate that external systems are being consulted. No archive control SHALL be offered while it is in flight.

The check fans out to three external systems, so it is slow enough that an unlabelled spinner reads as a stuck dialog.

#### Scenario: The loading state explains the wait

- **WHEN** the readiness request is in flight
- **THEN** the view indicates that the check is running against external systems

#### Scenario: Nothing is archivable mid-flight

- **WHEN** the readiness request is in flight
- **THEN** no control is offered that archives the component

### Requirement: Each target is listed with its own outcome and reason

The readiness view SHALL list every entry CRS returned as its own row carrying that target's identity and its outcome. A blocking entry SHALL state what is wrong. Entries SHALL NOT be collapsed into a single aggregate verdict, and a passing entry SHALL NOT be omitted.

Reported open issues SHALL be listed. A target or issue SHALL link out only when a usable link can be built; when the link is unavailable the entry SHALL render its identity as plain text rather than a dead link.

#### Scenario: Every returned entry appears

- **WHEN** the answer covers the component's open issues, its issue-tracker project, two TeamCity projects and one repository
- **THEN** the view shows five rows, each naming its target

#### Scenario: A passing issue-tracker project row does not claim the project was retired

- **WHEN** the issue-tracker project entry passes
- **THEN** the row reports the retired category as set, and does not state or imply that the project's retirement procedure was completed

#### Scenario: The two issue-tracker rows are shown separately

- **WHEN** the answer carries a blocking open-issues entry and a passing issue-tracker project entry
- **THEN** both rows are shown with their own outcomes, and neither is merged into the other nor suppressed as contradictory

#### Scenario: A blocking entry says what is wrong

- **WHEN** a repository entry blocks because it is not archived
- **THEN** that entry states the repository is not archived

#### Scenario: Passing entries are not hidden

- **WHEN** three entries pass and one blocks
- **THEN** all four are shown, not only the blocking one

#### Scenario: Open issues are listed

- **WHEN** the answer reports open issues against the component's versions
- **THEN** each is listed with its key

#### Scenario: A missing link renders as text, not a dead link

- **WHEN** an entry has no target link available, or the issue-tracker base URL is absent
- **THEN** the entry shows its identity as plain text and offers no link

### Requirement: The issue tracker's rows are shown as many as CRS returns

CRS returns one `JIRA_ISSUES` entry per effective `(project key, version prefix)` pair the component carries, and one `JIRA_PROJECT` entry per distinct project key among those pairs. A component with per-version-range overrides on its issue-tracker configuration therefore carries more than one of either kind, legitimately.

Portal SHALL render every one of them as its own row, SHALL NOT assume at most one of each kind, and SHALL NOT merge rows of the same kind together. Each `JIRA_ISSUES` row SHALL be identifiable by the pair CRS reports on it, so two rows on the same project are told apart.

The two kinds SHALL never be merged into each other. They are decided by opposite rules and can disagree — the ordinary retirement-in-progress state is a blocking issues row beside a passing project row — and that pairing SHALL NOT read as self-contradictory.

#### Scenario: Several issue rows are all shown

- **WHEN** the answer carries three `JIRA_ISSUES` entries from a component with version-range overrides
- **THEN** the view shows three separate issue rows, each identified by the pair CRS reported

#### Scenario: Several project rows are all shown

- **WHEN** the answer carries two `JIRA_PROJECT` entries for two distinct project keys
- **THEN** the view shows two separate project rows

#### Scenario: Two issue rows on the same project are distinguishable

- **WHEN** two `JIRA_ISSUES` entries carry the same project key with different version prefixes
- **THEN** each row is identified so the two are told apart, not rendered as duplicates

#### Scenario: Issue rows are never merged into project rows

- **WHEN** the answer carries one `JIRA_ISSUES` entry and one `JIRA_PROJECT` entry for the same project
- **THEN** both rows are shown with their own outcomes, and neither is folded into the other

#### Scenario: The common case is still one of each

- **WHEN** a component has no version-range override on its issue-tracker configuration
- **THEN** the view shows exactly one issue row and one project row

### Requirement: Sharing is never shown on an issue row

`sharedWith` is always empty on a `JIRA_ISSUES` entry — open issues are the component's own unfinished work, which no other component can cause or close, so sharing cannot excuse them. Portal SHALL NOT present an issue row as left as-is, and SHALL NOT count one toward the left-as-is summary.

#### Scenario: An issue row is never treated as shared

- **WHEN** a `JIRA_ISSUES` entry is rendered
- **THEN** it is not presented as left as-is, whatever else the answer contains

#### Scenario: A blocking issue row reads as this component's own work

- **WHEN** a `JIRA_ISSUES` entry blocks while the `JIRA_PROJECT` entry for the same project passes with a non-empty `sharedWith`
- **THEN** the issue row states the component's own issues are still open, and does not suggest another component is responsible

### Requirement: Targets left as-is because other components share them are named

An entry that passed while reporting components that still use the target SHALL say the target was left as-is and SHALL name those components. When more than one such entry is present, the view SHALL open with a summary line stating how many targets were left as-is.

Such an entry SHALL be presented distinguishably from an entry that passed because the target really is archived. The two mean opposite things about the state of the external system — one is retired, one is untouched and still serving another component — and a reader who cannot tell them apart will believe the whole component was retired.

These entries SHALL NOT block archiving.

#### Scenario: A shared target names the components keeping it alive

- **WHEN** a TeamCity project entry passes and reports two other live components using it
- **THEN** that entry says the project was left as-is and names both components

#### Scenario: A summary line appears when several targets were left as-is

- **WHEN** two entries pass reporting components that still use their targets
- **THEN** the view opens with a line stating that two targets were left as-is

#### Scenario: One such entry produces no summary line

- **WHEN** exactly one entry passes reporting a component that still uses its target
- **THEN** no summary line is shown, and that entry still says the target was left as-is

#### Scenario: An entry reporting no sharing is not counted

- **WHEN** a passing entry reports no components using its target
- **THEN** it is not counted toward the left-as-is summary and is not marked as left as-is

#### Scenario: Left-as-is reads differently from archived

- **WHEN** one entry passed because its target is archived and another passed because a live component shares it
- **THEN** the two are distinguishable from each other without expanding either

#### Scenario: A shared target does not block

- **WHEN** the only non-archived targets are ones other live components share, and CRS reports the component ready
- **THEN** archiving is offered

### Requirement: A target that no longer exists reads as gone, not as archived

CRS passes an entry whose target the external system reports absent — a repository that was deleted rather than archived, a build project that no longer exists. Portal SHALL present such an entry as gone, distinguishably from an entry that passed because its target is archived and from one that passed because a live component shares it.

Three different facts about the external system arrive as the same outcome: retired, still running for someone else, and gone. Rendering them identically tells the reader nothing about what actually happened to the component's infrastructure.

These entries SHALL NOT block archiving.

#### Scenario: A deleted target says so

- **WHEN** an entry passes with a reason stating the target no longer exists
- **THEN** the row says the target no longer exists

#### Scenario: Gone, archived and left-as-is are three distinct readings

- **WHEN** one entry passed because its target is archived, one because a live component shares it, and one because the target no longer exists
- **THEN** all three are distinguishable from each other without expanding any of them

#### Scenario: A gone target does not block

- **WHEN** the only non-archived target is one reported as no longer existing
- **AND** CRS reports the component ready
- **THEN** archiving is offered

### Requirement: A whole integration being down is shown once, about the integration

When every entry belonging to one external system blocks under the same system-level reason, Portal SHALL present that as one statement about the integration rather than as a separate problem per target.

A broken credential produces one unreadable entry per repository. Listing five mystery failures invites the reader to go looking at five repositories, when nothing is wrong with any of them and nothing about this component is special.

#### Scenario: A dead integration is one message

- **WHEN** three repository entries all block under the same reason identifying the VCS integration
- **THEN** the view states once that the VCS integration could not be consulted, rather than presenting three separate target problems

#### Scenario: One integration down does not hide the others

- **WHEN** the repository entries all block on the integration and the TeamCity and issue-tracker entries carry real outcomes
- **THEN** those other entries are still shown individually with their own outcomes

#### Scenario: A single target's own failure is not generalised

- **WHEN** one repository entry blocks and another repository entry passes
- **THEN** the blocking entry is shown as its own problem, not as an integration outage

### Requirement: A system CRS did not check produces no row

CRS omits a system's targets entirely when that system is not configured. Portal SHALL render only the entries it receives, SHALL NOT invent a placeholder row for a target it expected, and SHALL NOT present a shorter entry list as an incomplete or failed check.

The issue tracker is configured per client rather than as one system: reading projects and searching issues are separate connections in CRS, each configured independently. Portal SHALL therefore tolerate `JIRA_ISSUES` rows arriving without `JIRA_PROJECT` rows, or the reverse, without treating either absence as an error.

Nor SHALL Portal reconstruct an expected target list from the component's own data. Which targets exist is CRS's judgement, and a component's two version lines pointing at one build project produce one entry, not two.

#### Scenario: One issue-tracker client configured without the other

- **WHEN** the response carries `JIRA_PROJECT` entries and no `JIRA_ISSUES` entries
- **THEN** the project rows are shown, no issue rows appear, and nothing indicates the answer is incomplete

#### Scenario: A target recorded twice appears once

- **WHEN** the response carries one entry for a build project the component records on two version lines
- **THEN** the view shows one row for it, and does not report a target as missing

#### Scenario: Absent entries are not fabricated

- **WHEN** the response carries no repository entries because the VCS integration is unconfigured
- **THEN** the view shows no repository rows and does not indicate that anything is missing

#### Scenario: A partial entry list still allows archiving

- **WHEN** the response carries only issue-tracker and TeamCity entries, and CRS reports the component ready
- **THEN** archiving is offered

### Requirement: A target whose state could not be read blocks with its own wording

When an entry reports that the target's state could not be determined, Portal SHALL present it distinguishably from an entry reporting the target as not archived, and SHALL NOT state that the target is not archived.

The remedy Portal offers SHALL follow the entry's own classification of what would resolve it, not a single treatment for every unreadable entry:

- **The system was unavailable** — say the check could not be completed, and offer a retry without leaving the view.
- **The registry's data cannot be resolved** — say the component's own configuration needs correcting, and SHALL NOT offer a retry. Retrying cannot succeed, and offering it sends someone to press a button that will fail every time.
- **Required configuration is absent** — say the check is not configured, direct it at an administrator, and SHALL NOT offer a retry.

An entry whose classification Portal does not recognise SHALL be treated as unavailable, which is the safe default: a retry that cannot help is a smaller harm than withholding one that could.

#### Scenario: Unreadable is worded as a failed check, not as unfinished work

- **WHEN** an entry reports that the target's state could not be determined
- **THEN** it says the check could not be completed and can be retried, and does not state that the target is not archived

#### Scenario: Unreadable reads differently from not-archived

- **WHEN** one entry reports a target as not archived and another reports a target whose state could not be determined
- **THEN** the two are distinguishable from each other

#### Scenario: The check can be retried in place

- **WHEN** an entry reports that the state could not be determined
- **THEN** a control is offered that requests readiness again without closing the view

### Requirement: An unreadable entry says which remedy applies

Portal SHALL make the three unreadable cases readable as three different situations, not one. A reader of a blocked archive SHALL be able to tell whether to wait, to fix the component, or to ask an administrator, without opening the external system to find out.

#### Scenario: An unavailable system offers a retry

- **WHEN** an entry is unreadable and classified as the system being unavailable
- **THEN** the row says the check could not be completed and offers a retry

#### Scenario: A registry-data problem offers no retry

- **WHEN** an entry is unreadable and classified as unresolvable registry data
- **THEN** the row says the component's configuration needs correcting and offers no retry

#### Scenario: Missing configuration points at an administrator

- **WHEN** an entry is unreadable and classified as absent configuration
- **THEN** the row says the check is not configured and offers no retry

#### Scenario: The three read differently from each other

- **WHEN** three unreadable entries carry the three different classifications
- **THEN** each states a different remedy, and no two read alike

#### Scenario: An unrecognised classification falls back to retry

- **WHEN** an unreadable entry carries a classification Portal does not recognise
- **THEN** it is treated as an unavailable system and a retry is offered

### Requirement: A readiness request that fails outright is its own state

When the readiness request itself fails — no response, an error status, or a timeout — Portal SHALL present that as a failed check with no per-target detail, SHALL NOT present it as a target-level problem, and SHALL NOT offer to archive. A retry SHALL be offered.

This is distinct from an entry reporting an unreadable target: there, CRS answered and named the target; here there is no answer at all.

#### Scenario: A failed request refuses the archive

- **WHEN** the readiness request fails
- **THEN** no control is offered that archives the component

#### Scenario: A failed request is not shown as a target problem

- **WHEN** the readiness request fails
- **THEN** the view states that the check could not be run, and shows no target rows

#### Scenario: A failed request can be retried

- **WHEN** the readiness request fails
- **THEN** a control is offered that requests readiness again

#### Scenario: An empty entry list is not a failure

- **WHEN** CRS reports the component ready with no entries — a component with no repositories and no build projects
- **THEN** the view does not present a failed check, and archiving is offered

### Requirement: The archive request itself is unchanged

Once the verdict passes and the user confirms, Portal SHALL issue the same archive request it issues today — same endpoint, same payload, same permission. The gate SHALL sit in front of that call and SHALL NOT alter it, and its existing failure handling SHALL remain in place.

CRS does not evaluate readiness when the flag is written; the verdict is advisory and applying it is Portal's job. A verdict can therefore go stale between the check and the confirmation, which is why readiness is requested when Archive is chosen rather than earlier.

#### Scenario: Confirming issues the existing request

- **WHEN** the verdict passes and the user confirms
- **THEN** Portal issues the archive request it issued before this change, unchanged

#### Scenario: An archive failure is still reported

- **WHEN** the archive request fails for any reason
- **THEN** the existing failure message is shown and the component is still shown as not archived

### Requirement: Restoring an archived component is unchanged

Un-archiving SHALL keep its current behaviour: offered on an archived component to a user with `ARCHIVE_COMPONENTS`, with no readiness check. Readiness governs retiring a component, not restoring the record.

#### Scenario: Unarchive runs no readiness check

- **WHEN** a user with `ARCHIVE_COMPONENTS` restores an archived component
- **THEN** no readiness request is made and the component is restored

#### Scenario: An archived component offers no readiness view

- **WHEN** an archived component is viewed
- **THEN** no readiness view or Archive affordance is offered
