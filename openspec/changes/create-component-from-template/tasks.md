> Frontend work runs under npm/vitest (`frontend/`); the e2e driver and `crs.version` under
> Gradle. Groups 1–10 are frontend, group 11 is backend/infra.
>
> Depends on the registry change `add-component-templates` merging and being released, and on
> `load-create-profiles-from-registry` (this branch's base) merging first.
>
> Test-first: each behaviour task starts with a failing test.

## 1. Contract

- [x] 1.1 Re-vendor `frontend/src/lib/api/v4.json` from the registry branch carrying templates
      (`CRS_SPEC_REF=component-templates bash scripts/vendor-spec.sh`) and run
      `npm run generate-types`. `schema.d.ts` has `/rest/api/4/component-templates/{id}`,
      `/rest/api/4/component-templates/{id}/components`, `/rest/api/4/admin/component-profiles`,
      `ComponentTemplateResponse`, `TemplateComponentRequest`, `TemplateRunResponse`,
      `AdminComponentProfilesResponse`. Vendored from the registry branch at `d4aa615b`.
- [x] 1.2 Re-vendor from registry `main` once the registry change merges; `vendor-spec:check`
      passes.
- [x] 1.3 `npm run generate-types:check` passes; `tsc --noEmit` clean.

## 2. Portal-only rules over a create request (Decision 4)

- [x] 2.1 Failing tests for `portalCreateRules(request, options)`, one per rule, each asserting
      the create-request path and today's exact message:
  - [x] 2.1.1 blank `baseConfiguration.jira.projectKey` → "Jira Project Key is required"
  - [x] 2.1.2 blank full version format → "Full Version Format is required"
  - [x] 2.1.3 build system needing VCS, no VCS path → "VCS Path is required for this build system"
  - [x] 2.1.4 non-`ssh://` VCS path → the `ssh://` message; `ssh://` on another host → the host
        message naming the ecosystem host
  - [x] 2.1.5 missing tag / branch → "Tag is required" / "Production branch is required"
  - [x] 2.1.6 build system needing no VCS (`PROVIDED` and the rest of the exempt set) → no VCS
        issue
  - [x] 2.1.7 ownership group ID with a bad token, an unsupported prefix, EXPLICIT mode with no
        tokens → one issue each on that row's path
  - [x] 2.1.8 explicit external without display name / release manager / security champion →
        one issue each; skipped when `editable` says the field is not editable
  - [x] 2.1.9 explicit external maven / docker / package coordinate incomplete or with an
        unsupported group prefix → issue on that coordinate path
  - [x] 2.1.10 not explicit external → no display-name, people or coordinate issue
  - [x] 2.1.11 a fully valid request → no issues
- [x] 2.2 Implement `frontend/src/lib/component/portalCreateRules.ts`, reusing
      `vcsBlockApplies`, `SSH_VCS_URL_REGEX`, `isVcsHostSupported`, `findUnsupportedGroupId`,
      `isBadToken`.
- [x] 2.3 Rewire `makeCreateSchema` to call it on the request it builds and map each path with
      `formFieldOfRule`, skipping the Jira project key and full version format rules that the
      Zod object already requires at field level. Before and after: the full `createFormModel.test.ts` and
      `CreateComponentPage.test.tsx` suites pass unchanged — no test edited.
- [x] 2.1.12 a coordinate type the creator chose but the request does not carry (a blank Docker
        image is not sent) is read from `coordinateType`; with neither, one issue asks for a
        coordinate. (added on review: the request alone cannot tell "Docker, name missing" from
        "no coordinate")
- [x] 2.4 Confirm tests pass. `portalCreateRules.test.ts` 26/26; `src/lib/component` +
      `CreateComponentPage.test.tsx` 378/378 before and after the rewire, no test edited; `tsc`
      and `eslint src/lib/component` clean.

## 3. Profile listing keeps templates (Decision 1)

- [x] 3.1 Failing tests for `useComponentProfiles`:
  - [x] 3.1.1 returns `regular` and `template` entries in the registry's order
  - [x] 3.1.2 drops any other kind
- [x] 3.2 Failing tests for `initialProfile`:
  - [x] 3.2.1 a template listed first is never pre-selected; the first usable regular one is
  - [x] 3.2.2 only templates usable → nothing pre-selected
  - [x] 3.2.3 a clone never matches a template
- [x] 3.3 Implement; existing call sites that assume `regular` only (`noProfiles`, clone matching)
      filter by kind.
- [x] 3.4 Confirm tests pass. `isRegular` / `isTemplate` live in `createProfile.ts` (the page test
      mocks the hooks module); until group 7 the page hands the wizard the regular entries only,
      so it behaves as before. `src/lib/component`, `src/hooks`, `CreateComponentPage.test.tsx`
      37 files / 649 tests; `tsc`, `eslint` clean.

## 4. Local parameter checks (Decision 2)

- [x] 4.1 Failing tests for `templateParameterErrors(parameters, values)`:
  - [x] 4.1.1 required parameter empty → required message; optional empty → none
  - [x] 4.1.2 an empty parameter with a default takes the default, so required passes
  - [x] 4.1.3 blank values dropped; the same value twice counts once
  - [x] 4.1.4 two values for a single-value parameter → number-of-values message
  - [x] 4.1.5 text longer than `maxLength` → length message
  - [x] 4.1.6 pattern fails with `message` → that message; without `message` → a generic one
        naming the pattern
  - [x] 4.1.7 pattern that does not compile → skipped
  - [x] 4.1.8 select value not in `options` → option message
  - [x] 4.1.9 multi select over `maxSelection` → maximum-selection message
  - [x] 4.1.10 `crs-list` and `person` → only required and number of values; `labels` list takes
        several values
- [x] 4.2 Implement `frontend/src/lib/component/templateParameters.ts`, plus
      `templateRunBody(values, overrides)` building `{parameters: {NAME: string[]}, overrides}`;
      an empty parameter is left out so the registry fills its default.
- [x] 4.3 Confirm tests pass. `templateParameters.test.ts` 20/20. The checks were written before
      their first red run; two mutations (unanchored pattern, `labels` not taking several values)
      each failed exactly the test that names them.

## 5. Template API hooks (Decisions 3, 7)

- [x] 5.1 Failing tests:
  - [x] 5.1.1 `useComponentTemplate(id)` fetches `/component-templates/{id}`, not cached across
        wizard opens, exposes error and refetch
  - [x] 5.1.2 `useTemplateRun` dry run posts `dryRun=true` with the body and returns the run
  - [x] 5.1.3 a response for a run superseded by a newer one is discarded
  - [x] 5.1.4 create posts `dryRun=false`; 201 returns the component; 422 returns the run as a
        rejection; 404 / 403 / 400 surface `errorMessage` with the status
- [x] 5.2 Implement `hooks/useComponentTemplate.ts`, `hooks/useTemplateRun.ts`.
- [x] 5.1.5 `discard` drops the shown run and ignores a run still in flight (added on review: the
        "changing a parameter discards the run" rule needs it)
- [x] 5.3 Confirm tests pass. `useTemplateRun.test.ts` 13/13; `tsc`, `eslint src/hooks` clean.

## 6. Problem attribution (Decision 5)

- [x] 6.1 Failing tests for `reviewProblems(run, portalIssues)`:
  - [x] 6.1.1 a registry problem keeps its fields, parameters and `templateProblem`
  - [x] 6.1.2 a Portal issue on a path with sources names those parameters
  - [x] 6.1.3 a Portal issue on a path with no sources and not overridden is a template problem
  - [x] 6.1.4 a Portal issue on an overridden path names no parameter and is not a template
        problem
  - [x] 6.1.5 a `name: …` prefixed message is placed on that field; an unprefixed one at the top
  - [x] 6.1.6 the same path and message from both sides is shown once
- [x] 6.2 Implement `frontend/src/lib/component/templateReview.ts`.
- [x] 6.1.7 a registry problem with neither field nor prefix is shown at the top; registry
        problems are listed before the Portal's (added on review)
- [x] 6.3 Confirm tests pass. `templateReview.test.ts` 8/8; `tsc`, `eslint` clean.

## 7. Parameters step (Decisions 1, 2)

- [x] 7.1 Failing component tests for `TemplateParameterForm`:
  - [x] 7.1.1 one input per parameter in order, label, hint, required / optional marker
  - [x] 7.1.2 text → input; single select / crs-list → dropdown; multi select and `labels` →
        chips with "Add" offering only the options; person → people picker (people list when
        `multiple`)
  - [x] 7.1.3 defaults pre-filled; a person default shows that user
  - [x] 7.1.4 a pattern failure shows the template's message under the input while typing
  - [x] 7.1.5 no request is sent while typing
- [x] 7.2 Failing wizard tests in `CreateComponentPage.test.tsx`:
  - [x] 7.2.1 template tile renders with version and "Template" marker; disabled with reason when
        not usable
  - [x] 7.2.2 picking it shows the steps Profile, Parameters, Review & create
  - [x] 7.2.3 picking a regular tile afterwards restores the regular steps and the key typed
        before
  - [x] 7.2.4 template load failure → error with Retry, Next disabled
  - [x] 7.2.5 Next disabled while a check fails; enabled when all pass
  - [x] 7.2.6 Next sends exactly one dry run, with values and overrides and no Jira task key or
        comment; a parameter problem from it keeps the wizard on Parameters with the message on
        that input
  - [x] 7.2.6a after Review, changing a parameter discards the run: Review cannot be opened from
        the step list until Next runs again
  - [x] 7.2.7 a clone shows no template tiles
  - [x] 7.2.8 templates but no regular profile → template tiles beside the classification
        choices
- [x] 7.3 Implement `components/template/TemplateParameterForm.tsx` and the wizard's template
      path in `CreateComponentPage.tsx`.
- [x] 7.3a `WizardStepRail`, `CreatedPanel` and `ChangeMetadataFields` moved out of the page into
      `components/wizard/`, so both paths show the same rail, success panel and change metadata;
      `CreateComponentPage.test.tsx` 104/104 unchanged. (added on review)
- [x] 7.3b `TemplateWizard` owns the template path; the regular wizard stays mounted behind it, so
      its values survive a switch back. (added on review)
- [x] 7.4 Confirm tests pass. `CreateComponentPage.templates.test.tsx` (new file) 19/19,
      `TemplateParameterForm.test.tsx` 9/9.

## 8. Review & create (Decisions 5, 6, 7)

- [x] 8.1 Failing component tests for `TemplateReview`:
  - [x] 8.1.1 every rendered field shown, grouped as in the regular Review; an unknown path
        under "Other fields"
  - [x] 8.1.2 problems show with their parameter links; a link returns to Parameters with that
        input focused
  - [x] 8.1.3 a template problem names the template id and version, no link
  - [x] 8.1.4 the rendered VCS path off the ecosystem host shows the Portal message naming the
        source parameter; Create disabled
  - [x] 8.1.5 only overridable fields are editable, each with the input for its field kind
  - [x] 8.1.6 an edited field is marked "changed from template" and checked while typing with the
        Portal rules and the template's field rules from its listing entry; no dry run while
        typing; one dry run on leaving the field, with the override
  - [x] 8.1.7 clearing the edit removes the override and shows the template's value
  - [x] 8.1.8 Create disabled while a run is in flight, while any problem stands, or while the
        Jira task key is empty or malformed
  - [x] 8.1.9 "more problems may follow" note when a create-rule problem is shown
- [x] 8.2 Failing wizard tests for Create:
  - [x] 8.2.1 Create posts `dryRun=false` with values, overrides, Jira task key and comment;
        201 → the success panel linking to the component
  - [x] 8.2.2 422 → stays on Review with the returned problems
  - [x] 8.2.3 404 → back to Profile with the message, the withdrawn template no longer offered (the
        wizard keeps the listing it opened with rather than refetching it mid-flow)
  - [x] 8.2.4 403 / 400 → message at the top of Review
- [x] 8.3 Implement `components/template/TemplateReview.tsx`, `TemplateOverrideField.tsx`, and
      the create wiring.
- [x] 8.3a `reviewFieldGroups` (rows keyed by create-request path, unknown set fields under "Other
      fields") and `applyOverrides` (an edit checked before its dry run), with tests; `dryRun`
      returns its result. (added on review)
- [x] 8.3b Found while wiring: after a successful dry run Next stepped to Review through a guard
      that read the previous render's "no run yet", so Review never opened; it now enters Review
      from the result itself. (added on review)
- [x] 8.4 Confirm tests pass. `TemplateReview.test.tsx` 10/10, `templateReview.test.ts` 16/16,
      `useTemplateRun.test.ts` 14/14. Full vitest 186 files / 2799 tests; `tsc`, `eslint .` clean.

## 9. Templates tab (Decision 8)

- [x] 9.1 Failing tests for `useAdminComponentProfiles` (fetch per tab open, error state).
- [x] 9.2 Failing component tests for `TemplatesPanel`:
  - [x] 9.2.1 every entry with id, kind ("unknown" when absent), status, and title and version when live; a failed
        entry lists its problems and shows its configuration text
  - [x] 9.2.2 last load status and problems, configuration version, and the "how templates
        change" note
  - [x] 9.2.3 a live template's details: parameters with settings, classification, overridable
        fields, configuration text with Copy
  - [x] 9.2.4 Try it: parameter form with local checks; Run sends one dry run; the result shows
        each field's source parameters and every problem, including Portal rules; no Create,
        no editable field
- [x] 9.3 Failing test in `AdminSettingsPage.test.tsx`: the Templates tab is offered under the
      page's `IMPORT_DATA` gate.
- [x] 9.4 Implement `hooks/useAdminComponentProfiles.ts`, `components/admin/TemplatesPanel.tsx`,
      the tab in `AdminSettingsPage.tsx`; Try it reuses `TemplateParameterForm` and
      `TemplateReview` in read-only mode.
- [x] 9.5 Confirm tests pass. `TemplatesPanel.test.tsx` 9/9, `AdminSettingsPage.test.tsx` 10/10;
      `tsc`, `eslint src` clean. The details read the live template from the admin listing itself;
      no second request.

## 10. e2e (route-mocked)

- [x] 10.1 `frontend/e2e/visual/_helpers.ts` gains `mockComponentTemplate` (description, dry run
      and create); the spec passes the shipped profiles plus a template entry to
      `mockComponentProfiles`, and mocks `/portal/links` so the rendered VCS host matches.
- [x] 10.2 Spec `editor-create-from-template.spec.ts` (the `editor-` prefix puts it in the
      chromium-admin project): pick the template, fill parameters, Next, Review shows the
      component, Create → success. `eslint e2e` clean; not run locally — the e2e stack runs on CI
      (11.3).

## 11. Registry container — Gradle

- [ ] 11.1 Bump `crs.version` to the first registry release with templates.
- [ ] 11.2 Add the starter template to `src/test/resources/e2e/crs-fixture/component-profiles.yml`
      and the `infra/dev` registry, matching the registry's own dev template.
- [ ] 11.3 Run the e2e suite on CI.

## 12. Docs

- [x] 12.1 `docs/features/create-component.md`: template tiles, Parameters, Review & create, and the
      shared Portal-only rules.
- [x] 12.2 New `docs/features/admin-templates.md`; linked from `AGENTS.md`'s feature list and the
      `README.md` docs line.

## 13. Finalization

- [x] 13.1 Full vitest green (187 files / 2809 tests); `tsc`, `eslint . --max-warnings 0` and
      `eslint e2e` clean. `./gradlew qualityStatic`: `npmBuild`, `detekt`, `ktlintCheck` green;
      `compileTestKotlin` fails locally resolving `kotlin-test` 2.3.21, as on `main` — CI.
- [x] 13.2 Out-of-scope boundaries hold: no diff against the base branch in `components/editor/`,
      `ComponentDetailPage.tsx`, `lib/solutionKey.ts` or backend `src/main`. The regular wizard's
      tests were not edited by group 2 or by the component extractions (7.3a).
- [x] 13.3 The risks in `design.md` are still accurate. Decision 7's 404 handling now says the
      wizard drops the withdrawn template instead of refetching the listing.
- [ ] 13.4 Open until the registry change is released: 1.2 (re-vendor from `main`) and group 11
      (`crs.version`, the starter template in the e2e and dev registry, the e2e run on CI). A
      template in the fixture before then would be read by a registry that does not know the kind.

## 14. Review after the profiles change merged (added on review)

- [x] 14.1 Merged `main` (the squashed profiles change, the hide-test-components change, the
      quality-plugin bump). Every conflict was a file `main` carries exactly as the profiles branch
      already merged here, so this branch's side was kept; the only new change is
      `settings.gradle.kts`. The v4 contract keeps the template endpoints and the test-component
      fields; `generate-types:check` passes.
- [x] 14.2 With field-config locking the distribution flags, the request omits them, so the shared
      Portal-only rules skipped every explicit-external check (display name, people, coordinate)
      that `main` runs from the form. The wizard now passes its own explicit-external flag
      (Decision 4). 2 schema tests (fail here, pass on `main`), 1 rules test.
- [x] 14.3 Edits in the regular steps lost their unsaved-changes guard once a template tile was
      picked, since only the template path's guard is mounted then. The template path now also
      guards the regular steps' unsaved changes. 2 page tests (1 fails without the fix).

## 15. Fourth review (added on review)

- [x] 15.1 A picker on Review (labels, people list, build system, escrow generation) ran its dry
      run with the overrides from before the pick, so the registry checked the old value. The edit
      and its dry run now go together, with the new value. 1 page test (fails without the fix).
- [x] 15.2 A create rejected with parameter problems carries no rendered component, so Review went
      blank and the reason was never shown. The wizard now returns to Parameters with the messages,
      as after a dry run. 1 page test, 1 spec scenario.
- [x] 15.3 A produced artifact showed only as a summary line, so an overridable group ID was
      edited as that line, and mode and artifacts had no input. When any of its fields is
      overridable or has a problem, each gets its own row with the raw value; the mode edits with
      the ownership-mode dropdown, the artifacts as chips, and overrides keep them a list. 2 unit
      tests, 1 component test.
- [x] 15.4 A dry run answered 404 (the template withdrawn by a reload) left the user on the
      template. Any dry run's 404 now returns to the Profile step without it, as a create's does.
      1 page test.
- [x] 15.5 The registry change merged; `vendor-spec:check` passes against its `main` with no
      change to the vendored contract (task 1.2).

## 16. Fifth review (added on review)

- [x] 16.1 While Create waited, the user could change a parameter and run a newer dry run; a late
      rejection of the old Create then replaced the newer review, and a late failure or parameter
      problem could do the same. Create now takes its place in the dry runs' order: a created
      component always counts, a rejection or failure that a newer run overtook is dropped. 1 hook
      test, 1 page test (both fail without the fix).

## 17. Sixth review (added on review)

- [x] 17.1 Merged `main` (the Maintenance tab rename, the CRS re-vendor, the README license line):
      the Templates tab sits beside Maintenance; the vendored contract still matches the registry's
      `main`.
- [x] 17.2 A create that succeeded after a newer dry run withdrew the template (or another tile
      was picked) reported to the template path, which was already gone, so no success panel
      showed. The template path now hands a created component to the wizard, which shows the
      success panel for either path. 1 page test (fails without the fix).
