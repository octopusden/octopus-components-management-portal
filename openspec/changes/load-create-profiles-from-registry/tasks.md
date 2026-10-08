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
- [ ] 1.1a Re-vendor from registry `main` once the registry change merges. Until then the
      merge gate's `vendor-spec:check` (pinned to `main`) fails on this branch. (added on review)
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
      registry lists them, `test-fixtures/component-profiles.contract.json`.
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
  - [x] 6.1.5 a listing with no `regular` profile shows the same error instead of the wizard
  - [x] 6.1.6 a clone whose profiles fail to load shows the same error
  - [x] 6.1.7 scratch pre-selects the first usable profile; none usable → nothing selected
  - [x] 6.1.8 the explicit question shows only for `ask`
  - [x] 6.1.9 changing profile clears the key and re-checks against the new rules
  - [x] 6.1.10 typing `resolution-service` under Regular external shows the registry's message
- [x] 6.2 Implement the Profile step over `useComponentProfiles`: the page gates on the
      profiles (skeleton, or the error with Retry); the wizard takes them as a prop, holds the
      selected id, disables unusable tiles with their reason, and arrow keys skip them. A clone
      still derives the built-in id and takes the registry profile with that id until section 7.
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
  - [x] 7.1.7 a clone with nothing pre-selected opens on the Profile step and Create stays
        disabled until a profile is picked
- [x] 7.2 Rewrite `profileFromSource` (now in `createProfile.ts`, the old one removed from
      `createFormModel.ts`); drop the re-seed on `solutionKeyPatterns` arrival (the
      profiles are loaded before the wizard mounts, so no re-seed is needed); open a clone on
      Profile when nothing is pre-selected and extend the Profile gate to clones.
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
      on the Profile step it opens. (added on review)
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
      kept, hidden → stripped (`buildCreateRequest` gains `buildTasksVisibility`).
- [x] 10.2a Request-shape cases in `buildCreateRequest.test.ts` (8 new); the clone general-fields
      test now seeds labels as `initialValues` does; the `main` snapshot (9.1.1) gains the two
      new empty fields. (added on review)
- [x] 10.3 Confirm tests pass. `buildCreateRequest.test.ts` 74/74; `CreateComponentPage.test.tsx`
      79/79 (7 new); full vitest 178 files / 2634 tests; `tsc`, `eslint .` clean.

## 11. Registry container (Decision 9) — Gradle

- [ ] 11.1 Bump `crs.version` in `gradle.properties` to the first registry release with profiles.
      Open: no registry release carries profiles yet.
- [x] 11.2 The e2e registry container loads the four profiles from
      `src/test/resources/e2e/crs-fixture/component-profiles.yml` via
      `SPRING_CONFIG_ADDITIONAL_LOCATION` (design Decision 9). The file matches the registry's own
      `application-dev.yml` profile set (ids, kinds, classifications, order, patterns — compared
      by script). That the container starts is confirmed only once 11.1 lands, on CI.
- [x] 11.3 `infra/dev/docker-compose.yml` registry service loads the same file.
- [x] 11.4 `e2e/visual/_helpers.ts` gains `mockComponentProfiles` (the shared unit-test fixture);
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
