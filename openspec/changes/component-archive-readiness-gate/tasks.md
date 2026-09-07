> Frontend-only change (`frontend/`, npm/vitest). No backend (Gradle/Kotlin)
> group is needed — the BFF already proxies `/rest/**` to CRS with TokenRelay,
> so the new CRS endpoint is reachable with no change in this repo.
>
> **Blocked on CRS.** `GET /rest/api/4/components/{id}/archive-readiness` exists
> on the CRS branch `feat/archive-readiness-gate` but not on CRS `main`, so the
> vendored v4 spec here does not describe it yet. Groups 1-6 are built against
> the contract recorded in design.md ("The contract") with hand-written
> fixtures; group 7's manual checks need a real CRS + Portal pair. Do not close
> this change before 7 passes against real CRS.
>
> **CRS does not enforce readiness on write.** There is no write-time refusal to
> handle — CRS's write paths are unchanged and a regression test on the CRS side
> asserts they never consult readiness. Portal's gate is the only gate.
>
> Archiving is governed by `DELETE_COMPONENTS`; un-archiving by
> `ARCHIVE_COMPONENTS`. Both already exist in `lib/auth.ts` — no permission
> work here.

## 1. Types and client

- [x] 1.1 Add the readiness response types to `frontend/src/lib/types.ts` per design.md's contract table: the envelope (`ready` + `entries`) and the entry (`targetKind`, `targetId`, `outcome`, `reason`, `reasonKind`, `sharedWith`, `openIssues`)
- [x] 1.2 Declare `outcome` as a union of the three values CRS reports (`COMPLETED` / `NOT_COMPLETED` / `UNKNOWN`) and `reasonKind` as a union of its three, not bare `string`, so an unhandled value is a type error rather than a blank cell
- [x] 1.3 Type `reason` and `reasonKind` as nullable, and note at the declaration that `reason` is null on every `NOT_COMPLETED` entry — the render code must not assume it is present
- [x] 1.4 The hook calls `api.get<ArchiveReadinessResponse>(...)` directly, matching the existing convention (`useComponent`, `useTeamCityValidations`) — there is no per-endpoint wrapper function in `api.ts` for anything else either, so none was added here.
- [ ] 1.5 Run `npm run vendor-spec` and `npm run generate-types` once CRS's endpoint is on `main`; reconcile the hand-written types against the generated ones and record any deliberate difference here

## 2. Readiness hook

- [x] 2.1 Failing test: the hook does not fetch until it is enabled
- [x] 2.2 Failing test: enabling it fetches once and exposes the verdict and the entries
- [x] 2.3 Failing test: a failed request surfaces as an error state, distinct from a successful answer with no entries
- [x] 2.4 Failing test: refetching replaces the previous entries rather than appending
- [x] 2.5 Implement `useArchiveReadiness` in `frontend/src/hooks/`, lazily enabled

## 3. Readiness view — entries and blocking wording

- [x] 3.1 Failing test: every entry in the response is rendered, one row per entry, each naming its target kind and identity
- [x] 3.2 Failing test: an answer covering an issue-tracker project, its open issues, two TeamCity projects and one repository renders five rows
- [x] 3.3 Failing test: a passing entry is rendered, not omitted, when another entry blocks
- [x] 3.4 Failing test: a `NOT_COMPLETED` repository entry with `reason: null` still carries Portal's own wording (now the instruction — see 5b.3)
- [x] 3.5 Failing test: a `NOT_COMPLETED` TeamCity entry and a `NOT_COMPLETED` repository entry each carry wording specific to their own kind
- [x] 3.6 Failing test: an entry carrying a `reason` shows CRS's text rather than Portal's derived wording
- [x] 3.7 Failing test: reported open issues are listed and each links to the issue tracker when the base URL is configured
- [x] 3.8 Failing test: reported open issues are still listed, without links, when no base URL is configured
- [x] 3.9 Failing test: the loading state is shown while the request is in flight, and no entry rows are rendered
- [x] 3.10 Failing test: a failed request renders as a failure, not as an empty or passing outcome, and offers no archive control
- [x] 3.11 Implement the entry list, the per-kind blocking wording, and the loading and request-failure states, modelled on `TeamCityValidationsTab`'s per-finding card layout

## 4. Readiness view — shared targets

- [x] 4.1 Failing test: a passing entry with a non-empty `sharedWith` says the target was not required to be archived and names those components
- [x] 4.2 Failing test: that entry is distinguishable from a passing entry with an empty `sharedWith`, without expanding either
- [x] 4.3 Failing test: the entry does not state that the target is still live
- [x] 4.4 Failing test: two such entries produce a summary line stating that two targets were not required to be archived
- [x] 4.5 Failing test: one such entry produces no summary line
- [x] 4.6 Failing test: no such entry produces no summary line
- [x] 4.7 Failing test: the count comes from `sharedWith`, so a passing entry with an empty list is not counted
- [x] 4.8 Implement the shared-target treatment and the summary line

## 5. Readiness view — unreadable targets and their remedies

- [x] 5.1 Failing test: an `UNKNOWN` entry says the check could not be completed and does not state that the target is not archived
- [x] 5.2 Failing test: an `UNKNOWN` entry and a `NOT_COMPLETED` entry are distinguishable from each other
- [x] 5.3 Failing test: `SYSTEM_UNAVAILABLE` is worded as retryable and offers a retry control
- [x] 5.4 Failing test: the retry control requests readiness again without closing the view
- [x] 5.5 Failing test: `REGISTRY_DATA` states the component's recorded data needs correcting and offers no retry
- [x] 5.6 Failing test: `NOT_CONFIGURED` states the CRS configuration needs fixing and offers no retry
- [x] 5.7 Failing test: the three classifications are distinguishable from each other
- [x] 5.8 Implement the unreadable treatment, keyed on `reasonKind`

## 5b. Action wording and responsibility badges

Built against CRS as it stands: its entry carries neither `targetUrl` nor
`responsibility`, so Portal drops the first and derives the second.

- [x] 5b.1 Drop `targetUrl` from `ArchiveReadinessEntry` — CRS's DTO has no such field, and declaring it made the type lie. Removed from every fixture too (the type error found all four files)
- [x] 5b.2 Add `ArchiveReadinessResponsibility` to `types.ts`, documented at the declaration as derived rather than reported
- [x] 5b.3 Failing test: `actionFor` gives a distinct instruction per kind, each opening with a verb, naming the system for infrastructure targets
- [x] 5b.4 Failing test: `responsibilityFor` gives open issues to `COMPONENT_OWNER`
- [x] 5b.5 Failing test: every other outstanding kind goes to `F1_TEAM`
- [x] 5b.6 Failing test: any `UNKNOWN` goes to `F1_TEAM`, whatever kind it sits on
- [x] 5b.7 Failing test: a `COMPLETED` entry owes nobody
- [x] 5b.8 Failing test: an unrecognised party is labelled as reported rather than dropped — guards CRS starting to report a value Portal predates
- [x] 5b.9 Failing test: an open-issues row is assigned to the component owner and a repository row to the platform team
- [x] 5b.10 Failing test: the assignment reads as one ("Responsible:") and names the recorded owner as a person
- [x] 5b.11 Failing test: infrastructure work names the team collectively and does not name the owner
- [x] 5b.12 Failing test: a reader who is the owner is told the work is theirs, matched case-insensitively, and the row is emphasised
- [x] 5b.13 Failing test: a reader who is not the owner, or is not signed in, sees no row claimed as theirs
- [x] 5b.14 Failing test: a component with no recorded owner names the role instead of a person
- [x] 5b.15 Failing test: the assignment is distinct from the outcome, and a `COMPLETED` row carries neither assignment nor instruction
- [x] 5b.16 Implement `actionFor` / `responsibilityFor` / `responsibleParty` in `lib/archiveReadinessOwnership.ts`; thread `componentOwner` and the signed-in username from `ComponentDetailPage` into `ArchiveReadinessView`
- [x] 5b.17 Removed `failedReasonFor` — the instruction replaces it, and leaving it would have been dead code with a test guarding it. Its three call-site assertions now assert the instruction instead
- [ ] 5b.18 If CRS ever reports `responsibility`, prefer it over the derived value — `responsibilityFor` is the single place to change
- [ ] 5b.19 Deep links, not done here: `targetId` renders as plain text on repository and TeamCity rows, so an instruction to archive something gives no route to it. `/portal/links` already exposes `gitBaseUrl` and `tcBaseUrl`, and `ComponentTable.tsx` already builds a Bitbucket browse URL from a `vcsPath` — this is wiring, not new capability. It is what CRS's removed `targetUrl` was originally for

## 6. The gate

- [x] 6.1 Failing test: choosing Archive does not archive — it requests readiness and presents the outcome
- [x] 6.2 Failing test: no readiness request is made when the detail view loads and Archive has not been chosen
- [x] 6.3 Failing test: `ready: false` offers no control that archives
- [x] 6.4 Failing test: `ready: true` plus confirming submits the archive request
- [x] 6.5 Failing test: the gate reads `ready` — `ready: false` with entries carrying an unrecognised outcome still refuses
- [x] 6.6 Failing test: `ready: true` with only shared-target entries archives
- [x] 6.7 Failing test: an empty `entries` with `ready: true` states that no checks ran, renders no passing row, and still allows archiving on confirm
- [x] 6.8 Failing test (regression): a user without `DELETE_COMPONENTS` is offered no Archive affordance
- [x] 6.9 Failing test (regression): an archived component is offered no Archive affordance and no readiness view
- [x] 6.10 Failing test (regression): un-archiving makes no readiness request and still restores the component
- [x] 6.11 Failing test: the existing component-detail and General tab tests, which construct a component with no readiness data, still pass unchanged
- [x] 6.12 Implement — replace the existing archive dialog's immediate submit with the gated flow in `ComponentDetailPage.tsx`

## 7. Verification

- [~] 7.1 `./gradlew qualityStatic` itself cannot run in this sandbox — the `octopus-quality` plugin's `:nodeSetup` needs the corporate Artifactory mirror, unreachable here (DNS failure). Ran its frontend-relevant substance directly instead: `npx tsc --noEmit` clean, full-project `npm run lint` clean (see 7.2).
- [x] 7.2 `npm run lint` clean (full project). `npm run generate-types:check` clean (vendored `v4.json` unchanged, so the checked-in `schema.d.ts` still matches). `npm run vendor-spec:check` not run — it shells out to `gh`, unauthenticated in this session — but a direct fetch of CRS `main`'s spec confirmed it is byte-identical to the vendored copy, so there is nothing for it to catch yet.
- [x] 7.3 Full vitest suite green, including the pre-existing component-detail and General tab suites
- [ ] 7.4 Manual, against a real CRS: a component whose targets are all archived can be archived
- [ ] 7.5 Manual: a component with an open issue is refused, and the issue is listed and links correctly
- [ ] 7.6 Manual: a component sharing a TeamCity project with a live component archives, and the view names that component
- [ ] 7.7 Manual: with one external system deliberately unreachable, the affected entries read as a retryable failed check and archiving is refused
- [ ] 7.8 Manual: with no `archive-readiness` integration configured on CRS, the view states that no checks ran rather than showing a clean result
- [ ] 7.9 Manual: a component with an unresolvable recorded repository URL reads as needing its data corrected, with no retry offered
- [x] 7.10 Update `docs/features/component-detail.md` with the gated archive flow, and correct its stale rows describing an `archived` Switch and its gating
