## Context

Archiving a component is the final, recording step of the Component End of Support Regulation. The substantive steps happen in the external systems by hand: the remaining issues are closed, the issue-tracker project is reclassified, the TeamCity projects are archived, the repositories are archived. Portal's job is to note that the component is retired, and today it notes it unconditionally.

CRS has built the check. It is a read-only pre-flight, and CRS chose deliberately not to enforce it — `deleteComponent` is CRS's soft delete, so a readiness gate inside it would make deleting a mistakenly created component require that component's retirement steps to be complete first. CRS declined that trade and has a regression test proving no write path consults readiness.

That decision sets the shape of this change. **Portal is the only place the gate exists.** It is not defence in depth; it is the whole defence, and it protects the Portal user from a mistake rather than protecting the data from a determined caller. Accepted, because the failure being designed against is someone clicking Archive without knowing the repositories are still live — not someone circumventing the check on purpose.

Some infrastructure is shared between components: one TeamCity project, one repository or one issue-tracker project can serve several. Where a live component still uses a target, that target must not be archived — so for the component being retired, "this target is not archived" is the correct end state, not a failure. This produces a passing outcome that means the opposite of the other passing outcome, which is the central presentation problem of this change.

## The contract

CRS branch `feat/archive-readiness-gate`, not yet on `main`. Recorded here because every requirement below reads it and the fixtures for groups 1-5 are written from it. Reconcile against the generated types once CRS merges.

`GET /rest/api/4/components/{id}/archive-readiness` — accepts a UUID or a component name, and requires `ACCESS_COMPONENTS` + `canDeleteComponent`, the same authorization as the delete endpoint it gates.

```
{ ready: boolean, entries: Entry[] }
```

| Field | Shape | Notes |
|---|---|---|
| `ready` | `boolean` | CRS's verdict. False iff some entry is `NOT_COMPLETED` or `UNKNOWN`. |
| `targetKind` | `JIRA_ISSUES` \| `JIRA_PROJECT` \| `TEAMCITY_PROJECT` \| `REPOSITORY` | |
| `targetId` | `string` | Project key (`KEY` or `KEY:prefix` for `JIRA_ISSUES`), TC project id, or the raw recorded repository URL. |
| `targetUrl` | `string \| null` | Declared as a deep link, but **CRS sends `null` in every path today**. Portal builds its own links. |
| `outcome` | `COMPLETED` \| `NOT_COMPLETED` \| `UNKNOWN` | Three, not four. Sharing is not a fourth state. |
| `reason` | `string \| null` | **`null` on every `NOT_COMPLETED` entry.** Populated on `UNKNOWN`, and on the `COMPLETED` entries for a target that no longer exists. |
| `reasonKind` | `SYSTEM_UNAVAILABLE` \| `REGISTRY_DATA` \| `NOT_CONFIGURED` \| `null` | Non-null only on `UNKNOWN`. |
| `sharedWith` | `string[]` | Live component names sharing the target. Non-empty only on `COMPLETED`; always empty for `JIRA_ISSUES`. |
| `responsibility` | `COMPONENT_OWNER` \| `F1_TEAM` \| `null` | Who owns the remaining work. `COMPONENT_OWNER` on `JIRA_ISSUES` — only the component's own people can close its issues. `F1_TEAM` on every other kind, and on any `UNKNOWN`, since archiving infrastructure and fixing integrations are the platform team's. `null` on `COMPLETED`, where nothing is owed. |
| `openIssues` | `{ key, summary }[]` | Non-empty only on a `JIRA_ISSUES` `NOT_COMPLETED` entry. **No URL field.** |

Three consequences that are not obvious from the field list:

- **An unconfigured system produces no entries, not an entry saying so.** CRS returns early per target kind when the integration is not configured. With nothing configured, the response is `ready: true` with an empty `entries` — the verdict says yes because nothing said no.
- **`sharedWith` is checked before "is it archived".** For every sharing-aware kind, CRS returns `COMPLETED` with `sharedWith` as soon as sharing is found, without reporting whether the target also happens to be archived. So a non-empty `sharedWith` means *other live components still use this target, and it was not required to be archived* — it does not assert that the target is still running.
- **A blocking entry carries no prose.** Every `NOT_COMPLETED` result is constructed without a reason. Portal is the only place the sentence can come from — and since Portal is writing it anyway, it writes an instruction rather than a diagnosis: not *"the repository is not archived"* but *"Archive the repository"*. A person who opens this view is deciding what to do next, and a row that only names a state leaves them to work out the verb.
- **`responsibility` decides who is told, not what is said.** The instruction comes from the target kind; the badge beside it comes from `responsibility`. Splitting them means the two can be read separately — someone scanning for their own work looks at badges, someone doing the work reads instructions.

## Goals / Non-Goals

**Goals**

- No route from Portal's UI archives a component CRS did not report as ready.
- A reader of the readiness view can tell, per target, what state the external system is actually in — including which targets were left running for other components.
- A blocking check that cannot be completed never reads as work still to be done, and never sends someone to retry something that retrying will not fix.
- An answer in which nothing was checked never reads as an answer in which everything passed.

**Non-Goals**

- Performing any archive in an external system.
- Deciding readiness, or re-deriving any part of CRS's verdict.
- Arguing CRS's decision not to enforce at write time.
- Gating un-archive, or reconciling the two inverted archive permissions.

## Decisions

### 1. Readiness is fetched when someone asks to archive, not on component load

The answer requires live calls to three external systems. Putting it on the detail view's critical path would make every component load wait on the slowest of them, for information almost no visit needs. Fetching on demand also means the answer is as fresh as it can be at the moment it matters.

Consequence: the readiness view has a loading state of its own, and it is the first thing the person sees after choosing Archive.

### 2. The gate reads `ready`, never the entries

CRS supplies a top-level verdict precisely so that a caller cannot compute a different one. Portal renders the entries and gates on `ready`. If CRS adds a fourth outcome, a Portal that derived the verdict itself would treat the unrecognised value as non-blocking and unblock archiving; a Portal that reads `ready` refuses correctly and merely renders the new entry poorly.

The outcome union is still declared exhaustively in the types, so an unhandled value is a type error at the render site rather than a blank cell.

### 3. Portal owns the wording for a blocking target

CRS gives outcome plus target kind and no prose on `NOT_COMPLETED`. Portal maps the pair to a sentence — a repository that is not archived, a TeamCity project that is not archived, an issue-tracker project that is not retired, open issues that are still open. This is presentation, not judgement: Portal is not deciding anything CRS did not already decide, it is naming what CRS's answer means.

Where CRS *does* supply a reason — every `UNKNOWN`, and a `COMPLETED` target that no longer exists — Portal shows CRS's text rather than inventing its own.

### 4. Three blocking presentations, because there are three different remedies

`NOT_COMPLETED` and `UNKNOWN` both block, and `UNKNOWN` splits further by `reasonKind`:

| Outcome | What the reader must do |
|---|---|
| `NOT_COMPLETED` | Go and do the outstanding work in that system |
| `UNKNOWN` + `SYSTEM_UNAVAILABLE` | Wait and retry — the check itself failed |
| `UNKNOWN` + `REGISTRY_DATA` | Correct the component's recorded data; retrying will never help |
| `UNKNOWN` + `NOT_CONFIGURED` | Someone must fix CRS's configuration; retrying will never help |

Collapsing these is how the original version of this design went wrong: it offered retry for everything, which is right for one of the three and misleading for the other two. Retry is offered only where retrying can change the answer.

### 5. A target shared with a live component is a passing outcome that must still be visible

A shared target passes, because the component being retired cannot be held responsible for infrastructure it does not solely own. But the target was not required to be archived, which is the opposite of what every other passing entry means.

So the entry says so and names the components keeping it alive, and the view opens with a count when more than one target is in that state. The failure mode being designed against is a screen of successful checks that leads someone to believe the component's infrastructure was retired when part of it was deliberately left in place.

Portal reads the names from `sharedWith` rather than parsing prose, so the count is derived rather than restated. It says the target was not required to be archived — not that the target is still running, which the response does not tell us.

### 6. An empty answer is reported as "nothing was checked", and still archives

This is the one place where CRS's verdict and honest presentation pull apart. With no integration configured, CRS returns `ready: true` and no entries.

Portal follows the verdict and offers to archive, because decision 2 says Portal does not compute a different one — refusing here would be Portal overruling CRS on exactly the question CRS owns. But it states plainly that no checks ran, so nobody reads an empty view as a clean one. The same treatment covers a partial answer: a response whose entries cover fewer target kinds than the component has is not annotated, because Portal cannot tell a system that was not configured from a target the component genuinely does not have.

If it turns out that operators do reach an empty view in a configured environment, the fix belongs in CRS — an explicit not-configured entry — not in a Portal-side refusal.

### 7. No override

The regulation is the point of the gate, and Portal's gate is now the only one. An override control would make it advisory twice over, and the operation it guards cannot be undone in the external systems. A blocked component is archived by doing the outstanding work in those systems, or by correcting the data that made a check unreadable.

### 8. Portal renders the answer and nothing more

Portal does not consult the external systems, does not compute shared usage, and does not decide that an outcome should have been different. If the answer is wrong, the fix is in CRS.

## Risks / Trade-offs

**The gate is client-side only.** CRS will archive an unready component for anyone who asks it directly. This is CRS's stated decision, not an oversight, and the check exists to stop an operator's mistake rather than to enforce an invariant. Worth knowing before someone reports it as a hole.

**Archiving depends on three external systems being reachable.** With `UNKNOWN` blocking, an outage in any one of them stops all archiving. Accepted: archiving a component is rare and never urgent, so a delay costs nothing, whereas recording a component as retired when it is not is a lasting error.

**Two of the three unreadable remedies have no path out from inside Portal.** `REGISTRY_DATA` is corrected by editing the component, which the person may be able to do; `NOT_CONFIGURED` needs a change to CRS's own configuration, which they almost certainly cannot. Those components are unarchivable from Portal until someone else acts, and with no override that is a hard stop. The wording has to make clear which of the two it is, or it reads as Portal being broken.

**The readiness view is slow the first time.** Three systems behind one request. It appears as a loading state after a deliberate action, which is the best place for it, but it is not instant.

**Portal-authored blocking wording can drift from CRS's logic.** Because `NOT_COMPLETED` carries no reason, the sentence lives in Portal while the condition lives in CRS. If CRS changes what makes a repository fail, Portal's sentence silently becomes wrong. The mitigation is that the sentence stays generic — "not archived" — and says nothing CRS's checker does not already imply from the target kind.

**CRS merges first.** Nothing here can be verified end-to-end until the readiness endpoint is on CRS `main` and the v4 spec is re-vendored. Frontend work proceeds against the contract recorded above, and the manual checks in tasks.md need a running CRS.
