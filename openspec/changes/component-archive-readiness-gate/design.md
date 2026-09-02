## Context

Archiving a component is the final, recording step of retiring it. The substantive steps happen in the external systems by hand: the remaining issues are closed, the issue-tracker project is reclassified and renamed, the TeamCity projects are archived, the repositories are archived. Portal's job is to note that the component is retired.

Portal notes it unconditionally. One affordance does it — the Archive button in the detail header, behind `DELETE_COMPONENTS`, which opens a confirmation dialog and then calls CRS's delete endpoint. CRS's delete is a soft delete: it sets the archived flag. There is no other route from the SPA that sets it. (An earlier draft of this change claimed a second route through a General tab switch. That control does not exist; the claim came from a stale comment in `GeneralTab.tsx` and a stale row in `docs/features/component-detail.md`, both of which still describe it. See proposal.md's out-of-scope note.)

Some infrastructure is shared between components: one TeamCity project, one repository or one issue-tracker project can serve several. Where a live component still uses a target, that target must not be archived — so for the component being retired, "this target is not archived" is the correct end state, not a failure. This produces a passing outcome that means the opposite of the other passing outcome, which is the central presentation problem of this change.

CRS owns all of the judgement: which systems to consult, how shared usage is determined, and whether the component is ready. It does not enforce its own answer — the write paths that set the flag are unchanged — so acting on the verdict is entirely this change's job.

## Goals / Non-Goals

**Goals**

- Archiving from Portal is impossible unless CRS says the component is ready.
- A reader of the readiness view can tell, per target, what state the external system is actually in — including which targets were deliberately left running.
- A check that could not be completed never reads as work still to be done.

**Non-Goals**

- Performing any archive in an external system.
- Deciding readiness, or re-deriving any part of CRS's answer.
- Gating un-archive, or reworking the two archive permissions.
- Cleaning up the stale references to the removed switch (own change).

## The response contract

Everything in groups 1–6 of tasks.md is built against this shape. It is written here because it is the only contract the change depends on, it does not exist in CRS yet, and without it no fixture can be written.

```
GET /rest/api/4/components/{idOrName}/archive-readiness
     permission: DELETE_COMPONENTS

{
  "ready": false,
  "entries": [
    {
      "targetKind": "JIRA_ISSUES" | "JIRA_PROJECT" | "TEAMCITY_PROJECT" | "REPOSITORY",
      "targetId":   "<project key[:version prefix] | project key | TC project id | repository url>",
      "targetUrl":  "<deep link>" | null,
      "outcome":    "PASSED" | "FAILED" | "UNKNOWN",
      "reason":     "<why it failed or could not be read>" | null,
      "reasonKind": "SYSTEM_UNAVAILABLE" | "REGISTRY_DATA" | "NOT_CONFIGURED" | null,
      "sharedWith": ["<component name>", ...],
      "openIssues": [ { "key": "...", "summary": "..." }, ... ]
    }
  ]
}
```

- **`outcome` has three values, not four.** A target that is shared with a live component reports `PASSED` with a non-empty `sharedWith`; there is no separate skipped outcome. This is a deliberate simplification — the gate only needs to know whether something blocks, and sharing does not block.
- **`sharedWith` is the structured carrier of "left as-is".** Non-empty means the target was not archived and must not be, because those components still use it. Portal reads the names from it rather than parsing `reason`, so entries can name them and the summary count is derived.
- **The issue tracker produces at least two entries, and possibly more.** `JIRA_ISSUES` carries this component's own unfinished work; `JIRA_PROJECT` carries the state of the project itself. They obey opposite rules — sharing can excuse the project but never the issues — so CRS decides them separately and they can disagree. The ordinary retirement-in-progress state is `JIRA_ISSUES: FAILED` next to `JIRA_PROJECT: PASSED`, and the view must show both without reading as self-contradictory.
- **Their count is not fixed at one each.** A component's issue-tracker configuration is a *set* of effective `(project key, version prefix)` pairs, because per-version-range overrides can put a different key or prefix in force for part of its range. CRS returns one `JIRA_ISSUES` entry per pair and one `JIRA_PROJECT` entry per distinct project key among them. The common case — no override — still yields exactly one of each, but the view must not assume it: a component with an override legitimately shows several issue rows, and possibly several project rows.
- **`targetId` on `JIRA_ISSUES` identifies the pair, not the prefix.** A bare prefix is not unique across entries — two different projects can each own a null-prefix default bucket, and both would otherwise render an empty identity. The id is the project key, plus the prefix when one is set.
- **`openIssues` is populated only on `JIRA_ISSUES` entries** and is empty elsewhere. `sharedWith` is always empty on `JIRA_ISSUES`, so the shared-target treatment never applies to those rows.
- **`PASSED` on `JIRA_PROJECT` attests a marker, not a completed procedure.** Retiring an issue-tracker project is five steps — rename, recategorise, then switch the issue-type, workflow, permission and notification schemes. CRS checks the category only; the four scheme changes need issue-tracker admin rights it deliberately does not hold, and the rename is free text it will not guess at. So this row must not be worded as "the project was retired". Same failure mode as decision 3: a screen of green that means less than it appears to.
- **`reasonKind` classifies an `UNKNOWN` by the remedy it needs.** `reason` is prose and cannot be branched on. `SYSTEM_UNAVAILABLE` is retried; `REGISTRY_DATA` never resolves by retrying and is corrected by editing the component; `NOT_CONFIGURED` is corrected in CRS. Portal offers a retry only on the first, because offering one on the other two is a button that fails every time. An unrecognised value falls back to retry — the safe default.
- **`targetUrl` is nullable**, and so is the Portal-side issue-tracker base URL (`jiraBaseUrl` on the links response). Either being absent means the entry renders without a link, never as a broken one.
- **`ready` is CRS's verdict and Portal gates on it directly.** Portal does not recompute it from the entries — see decision 5.

## Decisions

### 1. Readiness is fetched when someone asks to archive, not on component load

The answer requires live calls to three external systems. Putting it on the detail view's critical path would make every component load wait on the slowest of them, for information almost no visit needs. Fetching on demand also means the answer is as fresh as it can be at the moment it matters.

Consequence: the view has a loading state of its own, and it is the first thing the person sees after choosing Archive. That state is specified, not left to the implementer — a spinner with no indication that three external systems are being consulted reads as a hung dialog.

### 2. Two outcomes block, and they must not read alike

`FAILED` and `UNKNOWN` both block, but they need different wording because they need different actions — one sends the person to go archive something, the other tells them to try again later. Reporting an unreachable system as "not archived" would send someone to archive a target that may already be archived.

Portal does not collapse the two into one blocking style.

### 3. A target left as-is is a passing outcome that must still be visible

A target shared with a live component passes, because the component being retired cannot be held responsible for infrastructure it does not solely own. But the target is untouched and still serving another component, which is the opposite of what every other passing entry means.

So the entry says so and names the components keeping it alive, and the view opens with a count when more than one target is in that state. The failure mode being designed against is a screen of successful checks that leads someone to believe the component's infrastructure was retired when half of it is still running.

### 4. Whole-request failure is its own state, distinct from a per-target `UNKNOWN`

`UNKNOWN` means CRS answered and told us one target could not be read. A failed request means we have no answer at all — no entries, nothing to render per target. It is also the more likely failure, since the endpoint fans out to three external systems behind one call.

These cannot share a presentation: one is a list with a bad row in it, the other is an empty view. Both refuse archiving and both offer a retry.

### 5. Portal gates on `ready`, not on its own reading of the entries

CRS decides. If Portal recomputed the verdict from the entries, the two could disagree — and since CRS does not enforce, Portal's reading would silently become the real gate, with no second opinion behind it. Entries are for the reader; `ready` is for the gate.

This also means a future outcome value CRS adds cannot silently unblock it.

### 6. The archive call is left exactly as it is; the gate goes in front of it

CRS does not evaluate readiness when the flag is written — the verdict is advisory. So the gate is entirely Portal's, and it works by not making the call until the verdict passes. The call itself, its endpoint, its payload and its existing failure handling are untouched.

This is a deliberate boundary: the change adds a step before an existing action rather than reworking the action. It also means the verdict can go stale between the check and the confirmation, which is why readiness is fetched when Archive is chosen rather than any earlier — see decision 1.

### 7. No override

The point of the gate is that the preceding steps really happened. Since CRS does not enforce, this gate is the only one there is — an override would remove the last check standing between a click and an irreversible operation. A blocked component is archived by doing the outstanding work in those systems, not by dismissing the check.

### 8. A component with no targets is ready

A component with no repositories and no TeamCity projects yields an entry list with nothing blocking, so `ready` is true and archiving proceeds. This is stated rather than left implicit because an empty list is easy to mistake for a failed fetch, and the two must not render alike.

### 9. Three passing outcomes, three readings

CRS passes an entry for three different reasons: the target is archived, the target is still needed by a live component, or the target no longer exists. All three arrive as `PASSED`, distinguished only by the reason and `sharedWith`.

Portal renders them as three distinct readings, because they say opposite things about the component's infrastructure — retired, still running for someone else, deleted outright. A single green tick across all three tells the reader nothing, and specifically hides the case where half the infrastructure is still live.

### 10. A dead integration is one message, not N mystery failures

An expired credential produces one unreadable entry per repository, all carrying the same system-level reason. Listing them individually invites the reader to investigate five repositories when nothing is wrong with any of them.

So when every entry of one system blocks under the same system-level reason, the view says it once, about the integration. Entries that fail for their own reasons stay individual — the collapse applies only to a whole system failing identically.

### 11. Render what arrives, never what was expected

CRS omits a system's entries entirely when that system is not configured, so a short entry list is a normal answer rather than a truncated one. Portal does not reconstruct an expected target list from the component's own data and does not mark a missing kind of row as incomplete.

Doing otherwise would put Portal in the business of deciding which targets should exist — which is exactly the judgement this change leaves with CRS.

## Risks / Trade-offs

**Archiving depends on three external systems being reachable.** With `UNKNOWN` and request failure both blocking, an outage in any one of them stops all archiving. Accepted: archiving a component is rare and never urgent, so a delay costs nothing, whereas recording a component as retired when it is not is a lasting error. The mitigation is presentation — the person must be told the check failed and can be retried, not left with a timeout.

**The readiness view is slow the first time.** Three systems behind one request. It appears as a loading state after a deliberate action, which is the best place for it, but it is not instant, and the loading copy has to say why.

**A permanently broken integration still blocks, and Portal cannot fix it.** With no override, a component whose targets sit behind a dead integration cannot be archived from Portal until someone repairs the integration or unconfigures it in CRS. That remedy is deliberately operational and not exposed here. Whether it is enough without an audited override is open.

**The gate is advisory, so it only binds Portal.** Anyone calling CRS's archive endpoint directly archives an unready component exactly as they do today. Accepted: the existing archive path was not to be changed. The gate raises the floor for people using the Portal and does nothing for anyone bypassing it.

**A passing verdict can go stale.** Someone reopens an issue between the check and the confirmation, and nothing re-checks — CRS does not evaluate readiness on the write. Fetching on demand keeps the window to seconds rather than minutes, which is the whole mitigation.

**The contract above is agreed, not implemented.** If CRS ships a different shape, groups 1–6 need revisiting. Task 1.4 reconciles the hand-written types against the generated ones once the endpoint is on CRS `main`, which is where a divergence would surface.

**CRS merges first.** Nothing here can be verified end-to-end until the readiness endpoint and the write-time refusal exist on CRS `main`. Frontend work proceeds against the contract above with fixtures; the manual checks in tasks.md need a running CRS.
