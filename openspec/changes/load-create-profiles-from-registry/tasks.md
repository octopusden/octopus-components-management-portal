> Frontend work runs under npm/vitest (`frontend/`); the e2e driver and `crs.version` under
> Gradle. Groups 1–10 are frontend, group 11 is backend/infra.
>
> Depends on the registry change that adds `GET /rest/api/4/component-profiles` and
> `ComponentCreateRequest.profile` merging and being released first.
>
> Test-first: each behaviour task starts with a failing test.

## 1. Contract

- [x] 1.1 Re-vendor `frontend/src/lib/api/v4.json` from the registry branch carrying the
      profiles, and run `npm run generate-types`. Vendored with
      `CRS_SPEC_REF=component-profiles-from-config bash scripts/vendor-spec.sh`; `schema.d.ts`
      now has `/rest/api/4/component-profiles`, `ComponentProfileResponse` and the request's
      `profile`.
- [x] 1.1a Re-vendor from registry `main` once the registry change merges. Until then the
      merge gate's `vendor-spec:check` (pinned to `main`) fails on this branch. (added on review)
      Done after the registry change merged: `npm run vendor-spec` against `main` leaves
      `v4.json` and `schema.d.ts` unchanged, and `vendor-spec:check` passes.
- [x] 1.2 `npm run generate-types:check` passes; `tsc --noEmit` clean.

## 2. Profiles hook (Decision 1)

- [x] 2.1 Failing tests for `useComponentProfiles`:
  - [x] 2.1.1 returns the `regular` profiles in the order the registry sends them
  - [x] 2.1.2 drops entries whose `kind` is not `regular`
  - [x] 2.1.3 refetches when a new consumer mounts (no cached list served across wizard opens)
  - [x] 2.1.4 exposes the error state when the request fails, and a refetch for Retry
- [x] 2.2 Implement `frontend/src/hooks/useComponentProfiles.ts`.
- [x] 2.3 Confirm the hook tests pass. `useComponentProfiles.test.ts` 4/4; `tsc`, `eslint` clean.

## 3. Classification from the profile (Decision 2)

- [x] 3.1 Failing tests for `flagsForProfile` over a registry profile:
  - [x] 3.1.1 solution / external / explicit `true` → all three `true`, the answer ignored
  - [x] 3.1.2 external, explicit `ask`, answer No → explicit `false`
  - [x] 3.1.3 internal, explicit `ask`, answer Yes → external `false`, explicit `true`
  - [x] 3.1.4 explicit `false` → `false` regardless of the answer
  - [x] 3.1.5 `asksExplicit` is true only for `ask`
- [x] 3.2 `flagsForProfile` and `asksExplicit` over a registry profile, in the new
      `frontend/src/lib/component/createProfile.ts`. Shared fixture: the four shipped profiles as the
      registry lists them, `frontend/src/test-fixtures/component-profiles.contract.json`.
- [x] 3.2a Remove the old `flagsForProfile`, `PROFILE_META` and the `ComponentProfile` union from
      `createFormModel.ts` with their last callers, so every commit builds: `PROFILE_META` went with
      the Profile step (6.2); the union and the old `flagsForProfile` go with `profileFromSource`
      (7.2) and `initialValues` (9.2). (added on review)
- [x] 3.3 Confirm tests pass. `createProfile.test.ts` 5/5; `tsc`, `eslint` clean.

## 4. Field-rule checker (Decision 3)

- [x] 4.1 Failing tests for `profileRuleErrors(rules, request)`:
  - [x] 4.1.1 a `name` rule that fails returns its message on `name`
  - [x] 4.1.2 a passing value returns nothing
  - [x] 4.1.3 whole-value match: `[a-z]+` rejects `payments-1`
  - [x] 4.1.4 an absent value is matched as `""` (a rule requiring a value fails on it)
  - [x] 4.1.5 a path outside the registry's list is skipped
  - [x] 4.1.6 an uncompilable pattern is skipped, other rules still checked
  - [x] 4.1.7 the regular profiles' rule rejects `resolution-service` and `x-dmp-bundle`,
        accepts `payments`
  - [x] 4.1.8 the Solution rule rejects `payments-dmp-bundle`; the DMP Bundle rule accepts it
  - [x] 4.1.9 the reader returns the request value for every path in the registry's list (one
        case per path, `[0]` reads the first entry only)
  - [x] 4.1.10 the path → form-field table covers every path in the registry's list
- [x] 4.2 Implement `frontend/src/lib/component/profileRules.ts` (request reader over the
      registry's paths, path → field table, anchored compile, per-rule-list cache).
- [x] 4.3 Confirm tests pass. `profileRules.test.ts` 34/34 (20 path cases, 7 shipped-rule cases);
      `tsc`, `eslint` clean.

## 5. Schema and key check (Decision 3)

- [x] 5.1 Failing tests for `makeCreateSchema` / `componentKeyError`:
  - [x] 5.1.1 a charset failure is reported alone, before any profile rule
  - [x] 5.1.2 a profile rule failure on `name` is reported on `name`
  - [x] 5.1.3 a rule on `baseConfiguration.build.buildTasks` is reported on `buildTasks`
  - [x] 5.1.4 no rules → only today's checks apply
  - [x] 5.1.5 the old substring rule is gone: `my-solution` passes a profile with no rules
  - [x] 5.1.6 a rule is checked against the built request: a Maven-group rule with a Docker
        coordinate fails as `""`, reported on `coordinate.groupPattern`
  - [x] 5.1.7 a rule on a field the user may not edit is checked as `""`
- [x] 5.2 `makeCreateSchema` takes the selected profile's rules and builds the request with
      `buildCreateRequest` itself (design Decision 3); `componentKeyError` keeps the charset check
      only; a blank key shows "required" alone. The page passes the rules of the registry
      profile whose id matches its built-in choice until the Profile step moves over (6.2).
- [x] 5.2a The page tests mock `useComponentProfiles` with the shipped fixture; the Solution
      key test now expects the registry's message. (added on review)
- [x] 5.3 Confirm tests pass; `isSolutionCandidate` and the editor's tests are untouched.
      `createFormModel.test.ts` 35/35 (8 new); full vitest 178 files / 2583 tests green; `tsc`,
      `eslint` clean; no diff in `solutionKey.ts`, `ComponentDetailPage.tsx` or `components/editor`.

## 6. Profile step (Decisions 1, 5)

- [x] 6.1 Failing tests in `CreateComponentPage.test.tsx`:
  - [x] 6.1.1 tiles render the registry's titles and descriptions in order
  - [x] 6.1.2 an unusable profile is disabled and shows its reason; clicking it changes nothing
  - [x] 6.1.3 arrow keys skip the unusable tile
  - [x] 6.1.4 a failed listing shows the error and Retry instead of the wizard; Retry refetches.
        That a successful refetch opens the wizard is covered by the hook test (2.1.4): the page
        test mocks the hook, so it cannot observe a real refetch.
  - [x] 6.1.5 (superseded by 14.2.2) an empty listing is no longer an error; this test was
        replaced by the no-profiles notice test
  - [x] 6.1.6 a clone whose profiles fail to load shows the same error
  - [x] 6.1.7 scratch pre-selects the first usable profile; none usable → nothing selected
  - [x] 6.1.8 the explicit question shows only for `ask`
  - [x] 6.1.9 changing profile clears the key and re-checks against the new rules
  - [x] 6.1.10 typing `resolution-service` under Regular external shows the registry's message
- [x] 6.2 Implement the Profile step over `useComponentProfiles`: the page gates on the
      profiles (skeleton, or the error with Retry); the wizard takes them as a prop, holds the
      selected id, disables unusable tiles with their reason, and arrow keys skip them. A clone
      still derives the built-in id and takes the registry profile with that id until section 7.
      (Since 14, only a failed listing gates; an empty one mounts the wizard.)
- [x] 6.3 Confirm tests pass. `CreateComponentPage.test.tsx` 63/63 (11 new); full vitest
      178 files / 2594 tests; `tsc`, `eslint .` clean.

## 7. Clone pre-selection (Decision 4)

- [x] 7.1 Failing tests for `profileFromSource(source, profiles)`:
  - [x] 7.1.1 `payments-dmp-bundle` solution → `dmp-bundle`
  - [x] 7.1.2 `payments-solution` solution → `solution`
  - [x] 7.1.3 internal non-solution → `regular-internal`, explicit seeded from the source
  - [x] 7.1.4 classification matches but no rule passes → first classification match
  - [x] 7.1.5 no classification match → none
  - [x] 7.1.6 an unusable profile is never pre-selected
  - [x] 7.1.7 (superseded by 16.2, narrowed by 19.1) a clone with nothing pre-selected now sets its
        classification directly and opens on General
- [x] 7.2 Rewrite `profileFromSource` (now in `createProfile.ts`, the old one removed from
      `createFormModel.ts`); drop the re-seed on `solutionKeyPatterns` arrival (the
      profiles are loaded before the wizard mounts, so no re-seed is needed); open a clone on
      Profile when nothing is pre-selected and extend the Profile gate to clones. (superseded by
      16.2: such a clone now sets its classification directly and opens on General; narrowed by
      19.1: only when no profile has the classification, unusable-only matches open on Profile)
- [x] 7.3 Confirm tests pass. `createProfile.test.ts` 11/11; `CreateComponentPage.test.tsx`
      63/63 — the clone test for a late `solutionKeyPatterns` re-seed is removed with the
      re-seed; the wizard no longer reads portal-config. `tsc`, `eslint .` clean.

## 8. Submit and error routing (Decision 6)

- [x] 8.1 Failing tests:
  - [x] 8.1.1 the create request carries `profile` with the selected id
  - [x] 8.1.2 `solution` is still sent only when editable, from the profile's classification
        (already true before this section; pinned so it stays)
  - [x] 8.1.3 a 400 on `profile` opens the Profile step with the message
  - [x] 8.1.4 a 400 on `name` with a rule message shows under the key on General
  - [x] 8.1.5 a 400 `baseConfiguration.jira.projectKey: …` opens Jira and shows under the
        project key (not General)
  - [x] 8.1.6 a 400 on `baseConfiguration.mavenArtifacts[0].groupPattern` opens Distribution
- [x] 8.2 Implement in `onSubmit` / `stepOfField`, mapping rule paths through the table from 4.2.
      `ComponentCreateRequest` gains `profile`; `stepOfField` routes `buildTasks` to Build.
- [x] 8.2a `parseServerFieldErrors` reads plain camelCase names only, so a nested rule path was
      never parsed: new `ruleErrorOf(rawBody)` in `profileRules.ts` (4 tests) reads
      `<rule path>: <message>` for the registry's paths. (added on review)
- [x] 8.2b The server-error banner showed only on Review; a profile rejection now also shows it
      on the Profile step it opens. (added on review; superseded by 16.4: every step a rejection
      opens shows it)
- [x] 8.3 Confirm tests pass. `CreateComponentPage.test.tsx` 69/69 (6 new); `profileRules.test.ts`
      38/38; full vitest 178 files / 2610 tests; `tsc`, `eslint .` clean.

## 9. Today's pre-filled values (Decision 7)

- [x] 9.1 Failing tests:
  - [x] 9.1.1 `initialValues` for scratch with Regular external (`ask`) pre-selected equals
        today's scratch values for the same component-defaults (snapshot taken from `main`
        before the change: recorded from `initialValues(null, FULL)` with every
        component-defaults key set, before `initialValues` was touched)
  - [x] 9.1.2 a first profile with explicit `true` and external `true` seeds the copyright
        default
  - [x] 9.1.3 no usable profile → explicit/external stay at `SCRATCH_DEFAULTS`
  - [x] 9.1.4 clone values unchanged for a solution, a regular external and an internal source
        (the pre-selected profile does not reach a clone's values)
  - [x] 9.1.5 the page shows the skeleton until profiles, component-defaults and the source
        have loaded
  - [x] 9.1.6 owner seeding and the version prefix following the key still work (9.1.5 and
        9.1.6 pass on first run: they pin behaviour that already held; none covered it before)
- [x] 9.2 `initialValues` takes the pre-selected profile's flags; add profiles to the page's
      `ready` gate (done in 6.2); remove `DEFAULT_SCRATCH_PROFILE`, the old `flagsForProfile` and
      the `ComponentProfile` union — `createFormModel.ts` now uses `createProfile.ts`.
- [x] 9.3 Confirm tests pass. `createFormModel.test.ts` 41/41; `CreateComponentPage.test.tsx` 72/72;
      full vitest 178 files / 2619 tests; `tsc`, `eslint .` clean.

## 10. Labels and build tasks (Decision 8)

- [x] 10.1 Failing tests:
  - [x] 10.1.1 General shows Labels with options from the labels list; free text cannot be added
  - [x] 10.1.2 picked labels are on Review and in the request
  - [x] 10.1.3 no labels → request as today
  - [x] 10.1.4 Labels hidden by field-config is not shown
  - [x] 10.1.5 Build shows Build tasks; a value is on Review and in
        `baseConfiguration.build.buildTasks`
  - [x] 10.1.6 blank build tasks are not sent
  - [x] 10.1.7 `build.buildTasks` hidden by field-config is not shown
  - [x] 10.1.8 clone starts with the source's labels and build tasks; editing them wins
- [x] 10.2 Add both to `CreateFormValues`, `initialValues`, `buildCreateRequest`, the steps and
      Review. Labels: `ChipsInput` over `useLabels()` (no free text by design), sent from the form
      when `component.labels` is editable, else the source's as before. Build tasks: gated like
      escrow generation — editable → form wins (blank drops a copied value), readonly → source's
      kept, hidden → stripped (`buildCreateRequest` gains `buildTasksVisibility`). (changed by
      16.5: Labels follow visibility; both are passed as `{ labels, buildTasks }`. Readonly build
      tasks changed by 18.1: not shown, not sent)
- [x] 10.2a Request-shape cases in `buildCreateRequest.test.ts` (8 new); the clone general-fields
      test now seeds labels as `initialValues` does; the `main` snapshot (9.1.1) gains the two
      new empty fields. (added on review)
- [x] 10.3 Confirm tests pass. `buildCreateRequest.test.ts` 74/74; `CreateComponentPage.test.tsx`
      79/79 (7 new); full vitest 178 files / 2634 tests; `tsc`, `eslint .` clean.

## 11. Registry container (Decision 9) — Gradle

- [x] 11.1 Bump `crs.version` in `gradle.properties` to the first registry release with profiles.
      `3.0.16` (the #520 merge commit); `main` has since moved it to `3.1.0`, as has `infra/dev`.
- [x] 11.2 The e2e registry container loads the four profiles from
      `src/test/resources/e2e/crs-fixture/component-profiles.yml` via
      `SPRING_CONFIG_ADDITIONAL_LOCATION` (design Decision 9). The file matches the registry's own
      `application-dev.yml` profile set (ids, kinds, classifications, order, patterns — compared
      by script). The file is optional, so the container starts either way; that it serves the
      profiles is confirmed only once 11.1 lands, on CI.
- [x] 11.3 `infra/dev/docker-compose.yml` registry service loads the same file.
- [x] 11.4 `frontend/e2e/visual/_helpers.ts` gains `mockComponentProfiles` (the shared unit-test fixture);
      `editor-copy-component.spec.ts` uses it — the shipped titles keep the existing radios
      working — and adds "the registry profile's key rule rejects resolution-service under
      Regular external". `eslint e2e` clean.
- [ ] 11.5 Run the e2e suite on CI (needs a running portal and Keycloak; not run locally).
- [ ] 11.5a `./gradlew compileTestKotlin` fails locally resolving `kotlin-test` 2.3.21
      (`kotlin-test-framework-junit5` capability) — on `main` too, so an environment issue; the
      driver change compiles on CI. (added on review)

## 12. Docs

- [x] 12.1 `docs/tech-debt/TD-006-solution-key-patterns-second-source.md`: the editor's Solution
      toggle still reads `portal.component.solution-key-patterns`, a second source next to the
      profile rules; listed in `AGENTS.md` and `README.md`.
- [x] 12.2 New `docs/features/create-component.md` (the wizard had no feature doc): Profile step,
      checks and create, the two new fields; linked from the `AGENTS.md` feature list.

## 13. Finalization

- [x] 13.1 Full vitest green (178 files / 2634 tests); `tsc`, `eslint .` and `eslint e2e` clean.
      `./gradlew qualityStatic`: `detekt` (after wrapping one driver line), `ktlintCheck` and
      `npmBuild` green; `compileTestKotlin` fails locally on `kotlin-test` resolution, as on `main`
      (11.5a) — CI.
- [x] 13.2 Out-of-scope boundaries hold: no diff against `main` in `lib/solutionKey.ts`,
      `ComponentDetailPage.tsx`, `components/editor/`, `hooks/useInfo.ts` or backend `src/main`
      (so `PortalComponentProperties.solutionKeyPatterns` is unchanged); no template code.
- [x] 13.3 The risks in `design.md` are still accurate; the solution-key risk now names TD-006,
      and one found during implementation is added (the live rule check treats build tasks as
      editable).
- [x] 13.4 SonarCloud flagged `CreateComponentWizard` at cognitive complexity 19 (limit 15). The
      wizard body now calls `initialProfile` (`createProfile.ts`, 3 tests), `useFieldVisibility`
      (`useFieldConfig.ts`, 4 tests) and `startStepFor`; Review takes `showLabels` /
      `showBuildTasks`; the profile and rule rejection routing moved out of `onSubmit` into
      `routeProfileRejection`. Checked with `eslint-plugin-sonarjs`: the wizard and `SummaryDiff`
      are within 15; `onSubmit` is 47 against 46 on `main` (an existing issue). Full vitest 178
      files / 2641 tests. (added on review)

## 14. The registry starts without profiles (Decision 10) (added on review)

> The registry change now starts with no profiles when service-config has none, and its
> functional spec has the create dialog fall back to choosing the classification.

- [x] 14.1 Re-vendor `v4.json` from the registry branch head (typed reload-config responses; the
      Portal's `useReloadConfig` reads the body as a plain record, unaffected).
- [x] 14.2 Failing tests:
  - [x] 14.2.1 `manualFlags`: solution only with external and explicit; otherwise `false`
  - [x] 14.2.2 an empty listing shows the notice and the classification choices, no tiles, no
        error
  - [x] 14.2.3 a create without profiles carries the chosen classification and no `profile`
  - [x] 14.2.4 Solution is shown only for External + Yes; leaving it clears Solution (a ticked
        Solution is checked through the classification recap: an explicit external create needs
        the gated fields, which this test does not fill; `manualFlags` covers the flag)
  - [x] 14.2.5 no rule message for `resolution-service` without profiles
  - [x] 14.2.6 a clone without profiles opens on General with the source's classification
- [x] 14.3 Implement the empty-list path: the page no longer treats it as an error; the wizard
      shows the classification controls, drops the Profile gate and sends no `profile`
      (`profile: profile?.id`, dropped from the JSON body when undefined). Helpers kept outside the
      wizard so it stays within the cognitive-complexity limit (`eslint-plugin-sonarjs`);
      `onSubmit` stays at 47, as after 13.4.
- [x] 14.4 Docs and comments: the e2e driver, `infra/dev` compose and the profiles fixture no
      longer say the registry cannot start without profiles; `docs/features/create-component.md`
      describes the no-profiles step.
- [x] 14.5 Confirm tests pass. `createProfile.test.ts` 16/16; `CreateComponentPage.test.tsx` 84/84
      (6 new, the no-`regular`-profile error test removed); full vitest 178 files / 2648 tests;
      `tsc`, `eslint .`, `detekt`, `ktlintCheck` clean.

## 15. Alignment pass (added on review)

- [x] 15.1 Docs brought in line with the code: the clone's classification-only fallback
      (proposal, feature doc); Affected areas list `createProfile.ts`, `useFieldVisibility`,
      `buildCreateRequest`, `types.ts`, the e2e helper and docs; `crs.version` is bumped only once
      the registry is released; the contract is vendored from the registry branch until it
      merges; Labels follow editability (not shown when not editable; superseded by 16.5) and Build tasks follow
      visibility (readonly shown disabled; superseded by 18.1); the query's `retry: false`; the rule cache is per rule
      object; the first failing rule per path wins; the Retry wording no longer claims the clone
      source error has one; the Profile step shows a profile rejection; the guard covers profile
      and manual classification changes.
- [x] 15.2 Tests for scenarios that had none: Labels not editable (now "shows readonly labels
      disabled with the source labels in a clone", 16.5), readonly Build tasks in a clone (now
      "does not show readonly build tasks, which the registry would reject", 18.1),
      answering No clears Solution (`CreateComponentPage.test.tsx` 87/87 then).

## 16. Fixes from the alignment pass (added on review)

- [x] 16.1 A reopened wizard opened on the cached listing, and a failed background refetch replaced
      the open form with the error panel. `useProfilesForWizard` (page) waits for a listing
      fetched after mount, keeps it while the wizard is open, and reports the error only while
      none has arrived (moved to `hooks/useProfilesForWizard.ts` by 18.9). Tests: waits for a fresh listing; keeps the open wizard when a later
      refetch fails (store-backed hook result).
- [x] 16.2 A clone whose source matches no usable profile opened on Profile and had to pick one,
      changing its classification. It now sets the classification directly, starting from the
      source's, with a "no profile matches" notice; opens on General and sends no profile
      (`isManualClassification`, design Decisions 4 and 10). (narrowed by 19.1: only when no
      profile has the classification; unusable-only matches open on Profile)
- [x] 16.3 A clone of a solution that is not explicit external kept `solution` in its direct
      classification; it was hidden and not sent, but came back ticked once the user chose
      External + Yes. `initialManualClassification` now seeds Solution through `manualFlags`.
- [x] 16.4 A rule rejection on a field the step does not show opened the step with no message.
      Every step a rejection routes to now shows it at the top (`StepServerError`), replacing the
      Profile-only banner; the Maven-group rejection test asserts the message on Distribution.
- [x] 16.5 A hidden Labels field still sent a clone source's labels, and readonly Labels were hidden
      rather than shown disabled like Build Tasks (whose readonly case 18.1 later dropped). Labels now follow `useFieldVisibility` the same
      way (readonly: disabled, source's kept; hidden: none sent). `buildCreateRequest` takes
      `{ labels, buildTasks }` visibilities; the build-tasks branch moved to `buildAspectFor`,
      keeping the function at `main`'s cognitive complexity (30).
- [x] 16.6 General said "Derived from the profile" when no profile was in use; with the
      classification set directly it now says "Set on the Profile step".
- [x] 16.7 A profile rule failing while typing on a field the step shows no error for (a hidden or
      non-editable field, a VCS field without a VCS block, the version prefix and formats, a
      coordinate when not explicit external) blocked Create with no message. The schema tags rule
      issues (`params.profileRule`); `StepRuleMessages` lists those whose field shows no error
      (`fieldShowsError`) at the top of the step. Rules on shown fields keep their message under
      the field only. Tests: a version-prefix rule shows on Jira; a project-key rule shows once.

## 17. Second alignment pass (added on review)

- [x] 17.1 Docs: the fresh listing kept while open (spec, design Decision 1, proposal, feature
      doc) and a later failed refetch scenario; "Create another" reuses the listing; the clone
      falls back to direct classification when no *usable* profile matches (superseded by 19.1:
      when no profile has the classification); rule messages shown at
      the top of the step when the field shows none (spec, Decision 3) and for rejections
      (spec, feature doc); the solution flag is sent only when editable (spec), from `manualFlags`
      in direct classification (Decision 6); the build-tasks exception to "checked against the
      request" (proposal, Decision 3; labels unaffected, Risks); `crs.version` still open
      (Decision 9); General's "Set on the Profile step" wording (spec). Superseded notes on 7.2,
      8.2b, 10.2, 15.1, 15.2; fixture path in 3.2.
- [x] 17.2 Stale code comments and test titles: the clone step comment, `profileFromSource` KDoc,
      the `buildCreateRequest` header, "skips the Profile step" (page test, e2e comment).
- [x] 17.3 Test for "Retry succeeds": the wizard opens with the tiles (store-backed hook result).
      `CreateComponentPage.test.tsx` 93/93.

## 18. Re-review fixes (added on review)

- [x] 18.1 A clone with readonly Build tasks kept the source's value, which the registry rejects
      (`enforceEditabilityOnCreate`: any value for a field the user may not edit). Build tasks are
      now shown and sent only when editable (`buildAspectFor`); readonly behaves as hidden.
- [x] 18.2 The live rule check built the request with every field visibility editable, so a rule
      on hidden build tasks read a value the create never sends. `makeCreateSchema` now takes
      the page's `{ labels, buildTasks }` visibilities (test: a build-tasks rule with the field
      hidden fails); the matching risk in `design.md` is marked resolved.
- [x] 18.3 Without the `u` flag JavaScript compiled Java-only escapes (`\p{Lower}`, `\Q…\E`,
      `\A`) as literal text, so such a rule failed every key in the browser. `regexOf` compiles in
      Unicode mode; those patterns are skipped and left to the registry (3 tests).
- [x] 18.4 The ownership rule read the whole `org.a,org.b` input while the registry checks the
      first stored group, and its message landed on form row 0 even when that row was blank and
      not sent. The reader takes `splitGroupIds(...)[0]`; `addProfileRuleIssues` targets the first
      non-blank row (2 tests).
- [x] 18.5 The registry trims the display name before its rule check; the reader read it raw, so
      `" Foo"` failed `^[A-Z].*` in the browser only. The reader trims it (1 test).
- [x] 18.6 A rule failing on a seeded or untouched value (a default full version format, a blank
      ownership row, a Maven group under a Docker coordinate) held Create with no message: the
      field could show an error but RHF held none for it. `StepRuleMessages` now also lists a rule
      whose field holds no error (`hasError`). A profile switch revalidates fields showing a rule
      message, so a stale one clears. 3 page tests.
- [x] 18.7 After a `profile:` rejection the server error kept the Profile step invalid, so Next stayed
      disabled until the next submit. Choosing another profile, or changing the direct
      classification, now clears a Profile-step rejection (1 test).
- [x] 18.8 An unusable tile without a reason pointed `aria-describedby` at an element that did not
      exist. It now does so only when the registry gives a reason (1 test).
- [x] 18.9 Tests that passed for the wrong reason or mocked the guarantee away: the two
      rule-rejection tests now prove the message under the field (exact text once) and the step
      banner (full `path: message`); `useProfilesForWizard` moved to its own hook file and is tested
      against a real QueryClient — a seeded cache does not open the wizard, the fetched listing
      does; Retry clears "unavailable" (2 tests).

## 19. Decisions on the re-review (added on review)

- [x] 19.1 A clone whose matching profiles were all unusable fell back to direct classification,
      sent no profile, and so sidestepped the restriction. Direct classification now applies only
      when no profile has the classification (`profileFromSource` reports `matchesAny`); otherwise
      the clone opens on Profile with the tiles disabled and Create held. 2 unit tests, 1 page test.
- [x] 19.2 With an explicit external profile first, a new component started with the default
      copyright; switching to a profile that is not explicit external kept and sent it. The
      wizard now clears a copyright still equal to its starting value when the classification
      leaves explicit external; one the user entered is kept. 2 page tests.
- [x] 19.3 With field-config failed to load, every field counted as not editable and Create still
      went ahead, silently dropping values (a clone's labels and build tasks among them). Create is
      now held on a field-config error too, and Review says why (1 page test).

## 20. Third alignment pass (added on review)

- [x] 20.1 With the first ownership row blank, the rule's message showed both under the first
      filled row and at the top of Build, and a rejection on `artifactIds[0].groupPattern` went to
      row 0. `formFieldOfRule` maps the path to the first filled row for both, and
      `fieldShowsError` accepts any row. 1 unit test, 1 page test (fails without the fix).
- [x] 20.2 Docs: the Profile gate applies when tiles are shown (Decision 4); the field-config
      bullet moved to Submit (Decision 6), which also notes a profile change clears a Profile-step
      rejection; the fields that show no error (Decision 3, spec); the trimmed Display Name and
      the ownership pattern's first group (spec); a new component with no usable profile (spec);
      the copyright clearing also covers a clone's copied value and direct classification
      (Decision 7, proposal, feature doc); field-config failure holds Create (proposal, feature
      doc); a clone's build tasks only when editable (feature doc); `useProfilesForWizard.ts` in
      Affected areas; superseded notes on 7.1.7, 7.2, 10.2, 15.1, 15.2, 16.1, 16.2, 16.5, 17.1.
- [x] 20.3 Tests: clearing a clone's copied copyright from the direct classification (1 page
      test); the stale `usePortalConfig` mock and the "No Profile step in clone" comment removed.
- [x] 20.4 The e2e Playwright container mounts only `frontend/e2e`, so the specs' import of
      `src/test-fixtures/component-profiles.contract.json` failed on CI and every spec file
      errored. `PlaywrightContainer` now also mounts `frontend/src/test-fixtures` read-only.
- [x] 20.5 Registry 3.0.16 refuses to start without `teamcity.validation.*` (mandatory since the
      pinned 3.0.2 build), so the e2e registry container exited. The driver and `infra/dev` compose
      pass placeholder template and step ids; compose and `.env.example` default to `3.0.16`, so
      local dev serves the profiles too.

## 21. Fourth review (added on review)

- [x] 21.1 Clicking the already-selected profile, answer or classification cleared a clone's
      copied copyright although the classification never was explicit external. The copyright is
      now cleared only when the classification was explicit external before the change;
      `applyManual` checks before setting the new flags. 2 page tests (fail without the fix).
- [x] 21.2 A rule path named like an inherited object member (`constructor`, `toString`) found
      that member in the path tables: the rule failed, and `formFieldOfRule` threw inside the
      schema. Lookups now read own keys only, so such a path is unknown and skipped. 7 unit tests
      (fail without the fix).
- [x] 21.3 A clone whose classification no profile has could set it directly to one a profile
      has — e.g. external, explicit and Solution — and create without that profile's key rule,
      even when the user may not use it. A classification set directly that a profile has now
      takes that profile (`profilesCovering`, `profileForClassification` in `createProfile.ts`):
      its tiles show, it is named on create, its rules apply, and an unusable one blocks Create.
      5 unit tests, 4 page tests (3 fail without the fix). Spec, design Decision 10, proposal and
      the feature doc updated.
- [x] 21.4 `.release-line` moves to `1.1`.
- [x] 21.5 Rule patterns that compile in Java and plain JavaScript but not in Unicode mode
      (`\-`, `\_`, `a{1,`) skip the live check; the create still rejects. Left as is, by decision.

## 22. Fifth review (added on review)

- [x] 22.1 21.3 selected the covering profile only when the user changed the classification. A
      clone whose source matches no profile but whose starting classification one covers (a
      solution that is not explicit external starts as not a solution, which Regular external
      covers) opened with no tile selected and Create held. The starting profile now comes from
      the starting classification too (`initialProfileId`). 1 page test (fails without the fix).
- [x] 22.2 `profileForClassification`'s KDoc moved from above `profilesCovering` to its function.
- [x] 22.3 22.1 left the unsaved-changes check comparing against the source's profile (none), so
      such a clone counted as changed when it opened and Cancel asked to discard. The check now
      compares against the profile the wizard opened with. The 22.1 page test asserts the guard
      is off (fails without the fix).
