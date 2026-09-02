## Why

- Archiving a component is the last step of retiring it. The earlier steps — closing the remaining issues, archiving the repositories, the TeamCity projects and the issue-tracker project — are carried out by hand in those systems. Portal is where someone records that the component is retired.
- Portal records it with no checks at all. The Archive button flips the flag immediately. Nothing asks whether the preceding steps actually happened, so a component can be marked retired while its repositories are live, its builds still run, and issues are still open against it. Archiving is not reversible in those external systems.
- Some infrastructure is shared. One TeamCity project, one repository, or one issue-tracker project can serve several components. When a target is still used by a live component it must be left alone — so "not archived" is the correct and expected state for it, and demanding otherwise would make such a component impossible to retire. A reader of the screen has no way to know this happened unless Portal says so.

## What Changes

- **Archiving becomes a two-step flow.** Choosing Archive no longer archives. Portal asks CRS whether the component is ready, shows the answer per target, and only then offers to proceed. A component that is not ready cannot be archived from Portal at all — there is no override.
- **A readiness view.** Each target the retirement steps cover — the issue-tracker project and its open issues, each TeamCity project, each repository — is listed with its own outcome and the reason behind it. Fetched when someone asks to archive, not on every component load: the answer is assembled from live calls to three external systems and is too slow to sit on the detail page's critical path.
- **Targets left as-is are named, not hidden.** A target that passed because another live component still uses it is shown as such, naming those components, and the view opens with a summary line when more than one target was left untouched. Without it the screen reads as a wall of successful checks and the person believes everything was retired.
- **Unreadable is not the same as not-archived.** When an external system cannot be reached, that target reports as unreadable rather than as failing, and archiving is refused with wording that says to try again later — not wording that sends someone to go archive something that may already be archived.
- **The issue tracker contributes more than one row.** Open issues and the state of the project itself are decided by opposite rules — sharing can excuse the project, never the issues — so they arrive as separate rows that can disagree. And because a component's issue-tracker configuration can differ per version range, there can be several of either. The view shows every row CRS returns and never merges them.
- **A target that no longer exists reads as gone, not as a mystery.** A repository deleted rather than archived, or a build project that no longer exists, passes — and the row says so. Three different facts arrive as a pass: retired, still running for another component, deleted outright. Each reads differently, because a uniform green tick hides the one case where half the infrastructure is still live.
- **A dead integration is said once.** An expired credential makes every repository unreadable under the same reason. The view states that the integration could not be consulted rather than listing five identical mystery failures, which would send someone to investigate five repositories where nothing is wrong.
- **The archive request itself is untouched.** Once the gate passes and the person confirms, Portal issues exactly the request it issues today, to the same endpoint, under the same permission. The gate is inserted in front of that call; nothing about the call changes.

## Capabilities

### New Capabilities

- `component-archive-readiness`: how Portal gates archiving a component on CRS's readiness answer, how it presents each target's outcome — including targets deliberately left alone because other live components share them — and how it behaves when the check cannot be completed.

### Modified Capabilities

<!-- None. This is additive: a gate and a new view in front of an existing action. The component-detail capability keeps its contract. -->

## Out of scope

- **Performing the archives.** Portal does not archive repositories, TeamCity projects, or the issue-tracker project, and does not ask CRS to. This change only checks and records.
- **Un-archiving.** Restoring a component stays exactly as it is today: the Unarchive button, `ARCHIVE_COMPONENTS`, no checks. Nothing in the external systems is restored either.
- **The gate logic itself** — which systems are consulted, how shared usage is determined, and how the verdict is reached. All of it is CRS's, per DOCS.md.
- **The two archive permissions.** Archiving is governed by `DELETE_COMPONENTS` and restoring by `ARCHIVE_COMPONENTS`, which reads backwards against their names. This change uses them as they are.
- **The components list.** Archived components are already filtered there and the flag's meaning does not change.
- **Cleaning up the stale references to a removed `archived` switch.** Two of them survive — a comment in `GeneralTab.tsx` and a row in `docs/features/component-detail.md` claiming the archive gate is "none (Switch is always interactive)" — along with the now-unreachable `archived` comparison in `buildUpdateRequest.ts`. They describe a control that no longer exists and they misled the first draft of this proposal. Worth removing, but as tidying, in its own change.

## Impact

**Portal only, and CRS must merge first.** Every behaviour here reads a readiness response CRS does not yet produce. The response contract this change builds against is written down in `design.md`; CRS-side work is tracked separately and covers the readiness endpoint and the shared-usage determination. CRS does not refuse the archive write — its answer is advisory, and applying it is this change's job.

The BFF needs no change: it already proxies `/rest/**` to CRS with TokenRelay, so a new CRS endpoint under the v4 namespace is reachable from the browser with no Gradle or Kotlin work in this repo. This is a frontend-only change here.

No existing behaviour is removed and no existing request changes. The Archive button keeps its permission, its position, its confirmation step and the call it makes; a readiness view is inserted before the confirmation.

Because CRS does not enforce, the gate is Portal's alone. Two consequences, both accepted: anyone calling CRS directly archives as they do today, and a passing verdict can go stale between the check and the confirmation. The mitigation for the second is to request readiness when Archive is chosen rather than earlier — which is what this change does.

## A note on the retirement steps

This proposal refers to the steps that must precede archiving — closing issues, archiving repositories, TeamCity projects and the issue-tracker project. That process is documented outside both repositories, so nothing here can link to it, and a reader cannot verify the list from the codebase. The spec therefore takes CRS's answer as the authority on which targets exist and what state each must be in, rather than restating the process as if it were a requirement of this change.
