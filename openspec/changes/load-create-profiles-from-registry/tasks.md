> Frontend work runs under npm/vitest (`frontend/`); the e2e driver and `crs.version` under
> Gradle. Groups 1–10 are frontend, group 11 is backend/infra.
>
> Depends on the registry change that adds `GET /rest/api/4/component-profiles` and
> `ComponentCreateRequest.profile` merging and being released first.
>
> Test-first: each behaviour task starts with a failing test.

## 1. Contract

- [ ] 1.1 Re-vendor `frontend/src/lib/api/v4.json` from the registry branch carrying the
      profiles, and run `npm run generate-types`; re-vendor from registry `main` once it merges.
- [ ] 1.2 `npm run generate-types:check` passes.

## 2. Profiles hook (Decision 1)

- [ ] 2.1 Failing tests for `useComponentProfiles`:
  - [ ] 2.1.1 returns the `regular` profiles in the order the registry sends them
  - [ ] 2.1.2 drops entries whose `kind` is not `regular`
  - [ ] 2.1.3 refetches when a new consumer mounts (no cached list served across wizard opens)
  - [ ] 2.1.4 exposes the error state when the request fails
- [ ] 2.2 Implement `frontend/src/hooks/useComponentProfiles.ts`.
- [ ] 2.3 Confirm the hook tests pass.

## 3. Classification from the profile (Decision 2)

- [ ] 3.1 Failing tests for `flagsForProfile` over a registry profile:
  - [ ] 3.1.1 solution / external / explicit `true` → all three `true`, the answer ignored
  - [ ] 3.1.2 external, explicit `ask`, answer No → explicit `false`
  - [ ] 3.1.3 internal, explicit `ask`, answer Yes → external `false`, explicit `true`
  - [ ] 3.1.4 explicit `false` → `false` regardless of the answer
  - [ ] 3.1.5 `asksExplicit` is true only for `ask`
- [ ] 3.2 Rewrite `flagsForProfile` in `createFormModel.ts`; remove `PROFILE_META`, the
      `ComponentProfile` union and `DEFAULT_SCRATCH_PROFILE`.
- [ ] 3.3 Confirm tests pass.

## 4. Field-rule checker (Decision 3)

- [ ] 4.1 Failing tests for `profileRuleErrors(rules, request)`:
  - [ ] 4.1.1 a `name` rule that fails returns its message on `name`
  - [ ] 4.1.2 a passing value returns nothing
  - [ ] 4.1.3 whole-value match: `[a-z]+` rejects `payments-1`
  - [ ] 4.1.4 an absent value is matched as `""` (a rule requiring a value fails on it)
  - [ ] 4.1.5 a path outside the registry's list is skipped
  - [ ] 4.1.6 an uncompilable pattern is skipped, other rules still checked
  - [ ] 4.1.7 the regular profiles' rule rejects `resolution-service` and `x-dmp-bundle`,
        accepts `payments`
  - [ ] 4.1.8 the Solution rule rejects `payments-dmp-bundle`; the DMP Bundle rule accepts it
  - [ ] 4.1.9 the reader returns the request value for every path in the registry's list (one
        case per path, `[0]` reads the first entry only)
  - [ ] 4.1.10 the path → form-field table covers every path in the registry's list
- [ ] 4.2 Implement `frontend/src/lib/component/profileRules.ts` (request reader over the
      registry's paths, path → field table, anchored compile, per-rule-list cache).
- [ ] 4.3 Confirm tests pass.

## 5. Schema and key check (Decision 3)

- [ ] 5.1 Failing tests for `makeCreateSchema` / `componentKeyError`:
  - [ ] 5.1.1 a charset failure is reported alone, before any profile rule
  - [ ] 5.1.2 a profile rule failure on `name` is reported on `name`
  - [ ] 5.1.3 a rule on `baseConfiguration.build.buildTasks` is reported on `buildTasks`
  - [ ] 5.1.4 no rules → only today's checks apply
  - [ ] 5.1.5 the old substring rule is gone: `my-solution` passes a profile with no rules
  - [ ] 5.1.6 a rule is checked against the built request: a Maven-group rule with a Docker
        coordinate fails as `""`, reported on `coordinate.groupPattern`
  - [ ] 5.1.7 a rule on a field the user may not edit is checked as `""`
- [ ] 5.2 `makeCreateSchema` takes the selected profile's rules and `requestFor(values)` (the
      page's `buildCreateRequest` with its editability) instead of the profile enum and
      `solutionPatterns`; `componentKeyError` keeps the charset check only.
- [ ] 5.3 Confirm tests pass; `isSolutionCandidate` and the editor's tests are untouched.

## 6. Profile step (Decisions 1, 5)

- [ ] 6.1 Failing tests in `CreateComponentPage.test.tsx`:
  - [ ] 6.1.1 tiles render the registry's titles and descriptions in order
  - [ ] 6.1.2 an unusable profile is disabled and shows its reason; clicking it changes nothing
  - [ ] 6.1.3 arrow keys skip the unusable tile
  - [ ] 6.1.4 loading shows a skeleton and Create is disabled
  - [ ] 6.1.5 a failed listing shows the error and Retry; Retry that succeeds shows the tiles
  - [ ] 6.1.6 a listing with no `regular` profile shows the error and Create is disabled
  - [ ] 6.1.7 scratch pre-selects the first usable profile; none usable → nothing selected
  - [ ] 6.1.8 the explicit question shows only for `ask`
  - [ ] 6.1.9 changing profile clears the key and re-checks against the new rules
  - [ ] 6.1.10 typing `resolution-service` under Regular external shows the registry's message
- [ ] 6.2 Implement the Profile step over `useComponentProfiles`.
- [ ] 6.3 Confirm tests pass.

## 7. Clone pre-selection (Decision 4)

- [ ] 7.1 Failing tests for `profileFromSource(source, profiles)`:
  - [ ] 7.1.1 `payments-dmp-bundle` solution → `dmp-bundle`
  - [ ] 7.1.2 `payments-solution` solution → `solution`
  - [ ] 7.1.3 internal non-solution → `regular-internal`, explicit seeded from the source
  - [ ] 7.1.4 classification matches but no rule passes → first classification match
  - [ ] 7.1.5 no classification match → none
  - [ ] 7.1.6 an unusable profile is never pre-selected
- [ ] 7.2 Rewrite `profileFromSource`; drop the re-seed on `solutionKeyPatterns` arrival, re-seed
      on profiles arrival instead (until the user picks).
- [ ] 7.3 Confirm tests pass.

## 8. Submit and error routing (Decision 6)

- [ ] 8.1 Failing tests:
  - [ ] 8.1.1 the create request carries `profile` with the selected id
  - [ ] 8.1.2 `solution` is still sent only when editable, from the profile's classification
  - [ ] 8.1.3 a 400 on `profile` opens the Profile step with the message
  - [ ] 8.1.4 a 400 on `name` with a rule message shows under the key on General
  - [ ] 8.1.5 a 400 `baseConfiguration.jira.projectKey: …` opens Jira and shows under the
        project key (not General)
  - [ ] 8.1.6 a 400 on `baseConfiguration.mavenArtifacts[0].groupPattern` opens Distribution
- [ ] 8.2 Implement in `onSubmit` / `stepOfField`, mapping rule paths through the table from 4.2.
- [ ] 8.3 Confirm tests pass.

## 9. Today's pre-filled values (Decision 7)

- [ ] 9.1 Failing tests:
  - [ ] 9.1.1 `initialValues` for scratch with Regular external (`ask`) pre-selected equals
        today's scratch values for the same component-defaults (snapshot taken from `main`
        before the change)
  - [ ] 9.1.2 a first profile with explicit `true` and external `true` seeds the copyright
        default
  - [ ] 9.1.3 clone values unchanged for a solution, a regular external and an internal source
  - [ ] 9.1.4 the page shows the skeleton until profiles, component-defaults and the source
        have loaded
  - [ ] 9.1.5 owner seeding and the version prefix following the key still work
- [ ] 9.2 `initialValues` takes the pre-selected profile's flags; add profiles to the page's
      `ready` gate; remove `DEFAULT_SCRATCH_PROFILE`.
- [ ] 9.3 Confirm tests pass.

## 10. Labels and build tasks (Decision 8)

- [ ] 10.1 Failing tests:
  - [ ] 10.1.1 General shows Labels with options from the labels list; free text cannot be added
  - [ ] 10.1.2 picked labels are on Review and in the request
  - [ ] 10.1.3 no labels → request as today
  - [ ] 10.1.4 Labels hidden by field-config is not shown
  - [ ] 10.1.5 Build shows Build tasks; a value is on Review and in
        `baseConfiguration.build.buildTasks`
  - [ ] 10.1.6 blank build tasks are not sent
  - [ ] 10.1.7 `build.buildTasks` hidden by field-config is not shown
  - [ ] 10.1.8 clone starts with the source's labels and build tasks; editing them wins
- [ ] 10.2 Add both to `CreateFormValues`, `initialValues`, `buildCreateRequest`, the steps and
      Review.
- [ ] 10.3 Confirm tests pass.

## 11. Registry container (Decision 9) — Gradle

- [ ] 11.1 Bump `crs.version` in `gradle.properties` to the first registry release with profiles.
- [ ] 11.2 `E2ETestcontainersDriver` passes the four profiles to the registry container as
      `SPRING_APPLICATION_JSON`; the container starts.
- [ ] 11.3 `infra/dev/docker-compose.yml` registry service gets the same profiles.
- [ ] 11.4 Update `frontend/e2e/editor-copy-component.spec.ts` and any create-wizard e2e for the
      registry's tile titles; add an e2e: create with Regular external and the key
      `resolution-service` shows the rule message.
- [ ] 11.5 Run the e2e suite on CI (needs infrastructure; not run locally).

## 12. Docs

- [ ] 12.1 `docs/tech-debt/`: the editor's Solution toggle still reads
      `portal.component.solution-key-patterns`, a second source next to the profile rules.
- [ ] 12.2 `AGENTS.md` feature list / `docs/features/` — note the Profile step reads the
      registry's profiles.

## 13. Finalization

- [ ] 13.1 `./gradlew qualityStatic` and the full vitest suite green.
- [ ] 13.2 Out-of-scope boundaries hold: the editor's Solution toggle and
      `PortalComponentProperties.solutionKeyPatterns` unchanged (grep); no template tile code.
- [ ] 13.3 The risks in `design.md` are still accurate.
