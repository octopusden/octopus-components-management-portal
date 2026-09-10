## Why

- Archiving a component is the last step of the Component End of Support Regulation. The earlier steps — closing the remaining issues, retiring the issue-tracker project, archiving the TeamCity projects and the repositories — are carried out by hand in those systems. Portal is where someone records that the component is retired.
- Portal records it with no checks at all. Choosing Archive flips the flag immediately. Nothing asks whether the preceding steps actually happened, so a component can be marked retired while its repositories are live, its builds still run, and issues are still open against it. None of that is reversible in the external systems.
- **CRS answers the question but does not enforce the answer.** The readiness endpoint is advisory by CRS's own decision: `deleteComponent` is CRS's soft delete, so refusing on readiness would mean deleting a mistakenly created component required its retirement steps to be finished first. CRS declined that trade and left every write path untouched. The consequence is the shape of this change — **Portal's gate is the only gate**, and it is a client-side one. A caller that goes straight to the API can still archive an unready component.
- Some infrastructure is shared. One TeamCity project, one repository, or one issue-tracker project can serve several components. When a target is still used by a live component it must be left alone — so "not archived" is the correct and expected state for it, and demanding otherwise would make such a component impossible to retire. A reader of the screen has no way to know this happened unless Portal says so.
- **Not every check always runs.** When an external system is not configured, CRS returns no entries for it at all rather than an entry saying so. An answer can therefore come back with the verdict `ready: true` and an empty entry list, meaning *nothing was checked* — which rendered naively is a screen that looks like a clean bill of health.

## What Changes

- **Archiving becomes a two-step flow.** Choosing Archive no longer archives. Portal asks CRS whether the component is ready, shows the answer per target, and only then offers to proceed. Portal gates on CRS's own `ready` verdict rather than re-deriving one from the entries, so an outcome value Portal does not recognise can never unblock archiving. A component CRS reports as not ready cannot be archived from Portal at all — there is no override.
- **A readiness view.** Each target CRS reports — the issue-tracker project, the open issues against it, each TeamCity project, each repository — is listed with its own outcome. Fetched when someone asks to archive, not on every component load: the answer is assembled from live calls to three external systems and is too slow to sit on the detail page's critical path.
- **Portal writes the blocking sentence.** CRS sends no reason on a blocking `NOT_COMPLETED` entry — the outcome and the target kind are the whole answer it gives. The wording that tells someone a repository is still not archived is Portal's to author, per target kind.
- **Unreadable is not the same as not-archived, and the remedy differs.** When CRS cannot determine a target's state it reports `UNKNOWN`, which blocks, and classifies why: a system that could not be reached, registry data that needs correcting, or CRS configuration that is missing. Only the first is worth retrying. Telling someone to try again later when the recorded repository URL is unresolvable sends them to wait for something that will never change.
- **Targets shared with live components are named, not hidden.** A target that passed because another live component still uses it is shown as such, naming those components, and the view opens with a summary line when more than one target is in that state. Without it the screen reads as a wall of successful checks and the person believes everything was retired.
- **An answer with nothing in it is not presented as a pass.** When CRS reports no entries, Portal says that no checks ran rather than showing an empty list of green rows.

## Capabilities

### New Capabilities

- `component-archive-readiness`: how Portal gates archiving a component on CRS's readiness verdict, how it presents each target's outcome — including targets that passed because other live components share them, and blocking outcomes whose remedy differs — and how it handles an answer in which nothing was checked.

### Modified Capabilities

<!-- None as a contract change. The component-detail capability keeps its shape; this change replaces the archive dialog's immediate submit with a gated flow behind the same affordance and the same permission. -->

## Out of scope

- **Performing the archives.** Portal does not archive repositories, TeamCity projects, or the issue-tracker project, and does not ask CRS to. This change only checks and records.
- **Server-side enforcement.** CRS decided the readiness answer is advisory and left `deleteComponent`, `updateComponent`, `createComponent` and the bulk import exactly as they were, with a regression test asserting none of them consults readiness. Portal does not argue that decision here and does not handle a write-time refusal, because there is none to handle.
- **Un-archiving.** Restoring a component stays exactly as it is today: the Unarchive button, `ARCHIVE_COMPONENTS`, no checks. Nothing in the external systems is restored either.
- **The gate logic itself** — which systems are consulted, how shared usage is determined, how an unreadable target is classified. All of it is CRS's, per DOCS.md.
- **The two archive permissions.** `DELETE_COMPONENTS` for archiving and `ARCHIVE_COMPONENTS` for restoring are inverted relative to their names. This change keeps archiving on the affordance that already requires `DELETE_COMPONENTS` — which is also what CRS's readiness endpoint itself requires — and does not renumber the permissions.
- **The components list.** Archived components are already filtered there and the flag's meaning does not change.

## Impact

**Portal only, and CRS must merge first.** The readiness endpoint exists on the CRS branch `feat/archive-readiness-gate` but not on CRS `main`, so the vendored v4 spec in this repo does not yet describe it. Everything here reads that response.

The BFF needs no change: it already proxies `/rest/**` to CRS with TokenRelay, so the new endpoint under the v4 namespace is reachable from the browser with no Gradle or Kotlin work in this repo. This is a frontend-only change here.

No existing behaviour is removed. The Archive affordance keeps its permission and its dialog; what changes is that the dialog now shows an answer before it offers to submit.
