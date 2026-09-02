> Frontend-only change (`frontend/`, npm/vitest). No backend (Gradle/Kotlin)
> group is needed — the BFF already proxies `/rest/**` to CRS with TokenRelay,
> so the new CRS endpoint is reachable with no change in this repo.
>
> **Blocked on CRS.** The readiness endpoint does not exist on CRS `main`.
> Groups 1-7 are built against the response contract in `design.md` with
> fixtures; group 8's manual checks need a real CRS + Portal pair. Do not close
> this change before 8 passes against real CRS.
>
> **The archive call is not modified.** CRS does not enforce readiness on the
> write, so the gate is Portal's and works by withholding the existing call
> until the verdict passes. Group 7 asserts that call is untouched.
>
> Archiving is governed by `DELETE_COMPONENTS`; un-archiving by
> `ARCHIVE_COMPONENTS`. Both already exist in `lib/auth.ts` — no permission
> work here.

## 1. Types and client

- [ ] 1.1 Add the readiness types to `frontend/src/lib/types.ts`, matching `design.md`'s contract: the entry (`targetKind`, `targetId`, `targetUrl`, `outcome`, `reason`, `sharedWith`, `openIssues`) and the envelope (`ready`, `entries`)
- [ ] 1.2 Declare `outcome` as the union `'PASSED' | 'FAILED' | 'UNKNOWN'` — three values, not four; a shared target reports `PASSED` with a non-empty `sharedWith` rather than an outcome of its own
- [ ] 1.2a Declare `targetKind` as the union `'JIRA_ISSUES' | 'JIRA_PROJECT' | 'TEAMCITY_PROJECT' | 'REPOSITORY'` — four kinds. The issue tracker yields at least two entries from one project, decided by opposite rules, so the view must never merge them back into one row
- [ ] 1.2b Type the entry list so nothing assumes at most one `JIRA_ISSUES` or one `JIRA_PROJECT`. A component with per-version-range overrides carries one issue entry per effective (project key, version prefix) pair and one project entry per distinct key — `targetId` on an issue entry is the pair, not the prefix alone
- [ ] 1.2c Declare `reasonKind` as `'SYSTEM_UNAVAILABLE' | 'REGISTRY_DATA' | 'NOT_CONFIGURED' | null` — it decides which remedy a row offers, so an unhandled value must be a type error rather than a silently wrong button
- [ ] 1.3 Declare `targetUrl` and the issue-tracker base URL as nullable, so the missing-link path is a type-level concern rather than a runtime surprise
- [ ] 1.4 Add the readiness fetch to `frontend/src/lib/api.ts`, under the existing `rest/api/4` helper
- [ ] 1.5 Once CRS's endpoint is on `main`: run `npm run vendor-spec` and `npm run generate-types`, reconcile the hand-written types against the generated ones, and record any deliberate difference here

## 2. Readiness hook

- [ ] 2.1 Failing test: the hook does not fetch until it is enabled
- [ ] 2.2 Failing test: enabling it fetches once and exposes the envelope
- [ ] 2.3 Failing test: a failed request surfaces as an error state, distinct from a successful response with an empty entry list
- [ ] 2.4 Failing test: refetching replaces the previous entries rather than appending
- [ ] 2.5 Implement `useArchiveReadiness` in `frontend/src/hooks/`, lazily enabled

## 3. Readiness view — entries

- [ ] 3.1 Failing test: every entry in the response is rendered, one row per target, each naming its target
- [ ] 3.2 Failing test: a passing entry is rendered, not omitted, when another entry blocks
- [ ] 3.3 Failing test: an entry blocking because the target is not archived states that
- [ ] 3.4 Failing test: reported open issues are listed with their keys
- [ ] 3.5 Failing test: an entry whose outcome is `UNKNOWN` renders as a failed check that can be retried, and does not state that the target is not archived
- [ ] 3.6 Failing test: a `FAILED` entry and an `UNKNOWN` entry are distinguishable from each other
- [ ] 3.7 Failing test: the retry control requests readiness again without closing the view
- [ ] 3.7a Failing test: an `UNKNOWN` entry classified `SYSTEM_UNAVAILABLE` says the check could not be completed and offers a retry
- [ ] 3.7b Failing test: one classified `REGISTRY_DATA` says the component's configuration needs correcting and offers **no** retry
- [ ] 3.7c Failing test: one classified `NOT_CONFIGURED` says the check is not configured, points at an administrator, and offers no retry
- [ ] 3.7d Failing test: the three classifications read differently from each other
- [ ] 3.7e Failing test: an unrecognised classification falls back to the retry treatment
- [ ] 3.8 Failing test: an entry with `targetUrl: null` renders its identity as plain text and offers no link
- [ ] 3.9 Failing test: an open issue renders as plain text when the issue-tracker base URL is absent
- [ ] 3.10 Failing test: an entry carrying an unrecognised `outcome` value renders without claiming the target passed
- [ ] 3.11 Implement the entry list, modelled on `TeamCityValidationsTab`'s per-finding card layout

## 3b. Readiness view — the three passing kinds and a dead integration

- [ ] 3b.1 Failing test: an entry passing with a reason that the target no longer exists renders as gone
- [ ] 3b.2 Failing test: archived, left-as-is and gone are three distinguishable readings, without expanding any of them
- [ ] 3b.3 Failing test: a gone entry does not block when `ready` is true
- [ ] 3b.4 Failing test: three repository entries blocking under the same system-level reason render as one statement about the integration
- [ ] 3b.5 Failing test: with the repository entries collapsed, TeamCity and issue-tracker entries are still shown individually
- [ ] 3b.6 Failing test: one repository blocking while another passes renders as its own problem, not an integration outage
- [ ] 3b.7 Failing test: a response with no repository entries renders no repository rows and indicates nothing missing
- [ ] 3b.8 Failing test: a partial entry list with `ready: true` still offers archiving
- [ ] 3b.9 Implement the three passing treatments, the per-system collapse, and render-what-arrives

## 3c. Readiness view — the issue tracker's rows

- [ ] 3c.1 Failing test: three `JIRA_ISSUES` entries render as three separate rows, each identified by its pair
- [ ] 3c.2 Failing test: two `JIRA_PROJECT` entries for two project keys render as two rows
- [ ] 3c.3 Failing test: two `JIRA_ISSUES` entries sharing a project key with different prefixes are distinguishable, not rendered as duplicates
- [ ] 3c.4 Failing test: an issue row and a project row for the same project are both shown, neither folded into the other
- [ ] 3c.5 Failing test: a component with no override renders exactly one issue row and one project row
- [ ] 3c.6 Failing test: a `JIRA_ISSUES` row is never presented as left as-is and never counted toward the left-as-is summary
- [ ] 3c.7 Failing test: a blocking issue row beside a passing shared project row reads as this component's own open work, not another component's responsibility
- [ ] 3c.8 Failing test: `JIRA_PROJECT` rows without any `JIRA_ISSUES` rows render without indicating an incomplete answer — the two clients are configured independently
- [ ] 3c.9 Implement the issue-tracker row rendering

## 4. Readiness view — targets left as-is

- [ ] 4.1 Failing test: a passing entry with a non-empty `sharedWith` says the target was left as-is and names those components
- [ ] 4.2 Failing test: that entry is distinguishable from a passing entry with an empty `sharedWith`, without expanding either
- [ ] 4.3 Failing test: two such entries produce a summary line stating that two targets were left as-is
- [ ] 4.4 Failing test: one such entry produces no summary line, but the entry still reads as left as-is
- [ ] 4.5 Failing test: no such entry produces no summary line
- [ ] 4.6 Failing test: the count is derived from `sharedWith`, so a passing entry with an empty `sharedWith` is not counted
- [ ] 4.7 Implement the left-as-is treatment and the summary line

## 5. Loading, request failure, and the empty case

- [ ] 5.1 Failing test: while in flight, the view indicates the check is running against external systems
- [ ] 5.2 Failing test: while in flight, no control is offered that archives
- [ ] 5.3 Failing test: a failed request states the check could not be run and renders no target rows
- [ ] 5.4 Failing test: a failed request offers no archive control
- [ ] 5.5 Failing test: a failed request offers a retry that requests readiness again
- [ ] 5.6 Failing test: `ready: true` with an empty entry list is not presented as a failed check, and archiving is offered
- [ ] 5.7 Implement the loading, request-error and empty-list states as three distinct renderings

## 6. The gate

- [ ] 6.1 Failing test: choosing Archive does not archive — it requests readiness and presents the outcome
- [ ] 6.2 Failing test: no readiness request is made when the detail view loads and Archive has not been chosen
- [ ] 6.3 Failing test: `ready: false` offers no control that archives
- [ ] 6.4 Failing test: `ready: true` plus confirmation submits the archive request
- [ ] 6.5 Failing test: `ready: false` with every entry passing still offers no archive control — the verdict is CRS's, not derived from the entries
- [ ] 6.6 Failing test: shared-target entries alone do not block when `ready` is true
- [ ] 6.7 Failing test: a user without `DELETE_COMPONENTS` is offered no Archive affordance
- [ ] 6.8 Failing test: an archived component is offered no Archive affordance and no readiness view
- [ ] 6.9 Failing test: un-archiving makes no readiness request
- [ ] 6.10 Implement — replace the archive dialog's immediate submit with the gated flow in `ComponentDetailPage.tsx`

## 7. The archive call stays unchanged

- [ ] 7.1 Failing test: confirming a passing verdict issues the same archive request as before this change — same endpoint, same payload
- [ ] 7.2 Failing test: an archive failure still surfaces the existing failure message, and the component is still shown as not archived
- [ ] 7.3 Failing test: the pre-existing component-detail tests, which construct components without readiness data, pass unchanged
- [ ] 7.4 Confirm the archive mutation and its hook were not modified — this group asserts absence of change, so it is tests only

## 8. Verification

- [ ] 8.1 `./gradlew qualityStatic` clean
- [ ] 8.2 `npm run lint` clean
- [ ] 8.3 `npm run vendor-spec:check` and `npm run generate-types:check` clean
- [ ] 8.4 Full vitest suite green, including the pre-existing component-detail suites
- [ ] 8.5 Manual, against a real CRS: a component whose targets are all archived can be archived
- [ ] 8.6 Manual: a component with an open issue is refused, and the issue is listed
- [ ] 8.7 Manual: a component sharing a TeamCity project with a live component archives, and the view names that component
- [ ] 8.8 Manual: with one external system deliberately unreachable, the affected entry reads as a failed check that can be retried, and archiving is refused
- [ ] 8.9 Manual: with CRS itself unreachable, the view reads as a failed check with no target rows
- [ ] 8.10 Manual: a component whose repository was deleted rather than archived is archivable, and the row says the repository no longer exists
- [ ] 8.11 Manual: with a deliberately invalid VCS credential in CRS, the view says once that the VCS integration could not be consulted, and no row claims a repository is absent
- [ ] 8.12 Update `docs/features/component-detail.md` with the gated archive flow. Its `Archive / unarchive` row currently reads `none (Switch is always interactive)`, which is wrong on both counts — the switch is gone and the gate is being added here
