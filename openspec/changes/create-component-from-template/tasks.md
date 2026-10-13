> Frontend work runs under npm/vitest (`frontend/`); the e2e driver and `crs.version` under
> Gradle. Groups 1–10 are frontend, group 11 is backend/infra.
>
> Depends on the registry change `add-component-templates` merging and being released, and on
> `load-create-profiles-from-registry` (this branch's base) merging first.
>
> Test-first: each behaviour task starts with a failing test.

## 1. Contract

- [ ] 1.1 Re-vendor `frontend/src/lib/api/v4.json` from the registry branch carrying templates
      (`CRS_SPEC_REF=component-templates bash scripts/vendor-spec.sh`) and run
      `npm run generate-types`. `schema.d.ts` has `/rest/api/4/component-templates/{id}`,
      `/rest/api/4/component-templates/{id}/components`, `/rest/api/4/admin/component-profiles`,
      `ComponentTemplateResponse`, `TemplateComponentRequest`, `TemplateRunResponse`,
      `AdminComponentProfilesResponse`.
- [ ] 1.2 Re-vendor from registry `main` once the registry change merges; `vendor-spec:check`
      passes.
- [ ] 1.3 `npm run generate-types:check` passes; `tsc --noEmit` clean.

## 2. Portal-only rules over a create request (Decision 4)

- [ ] 2.1 Failing tests for `portalCreateRules(request, options)`, one per rule, each asserting
      the create-request path and today's exact message:
  - [ ] 2.1.1 blank `baseConfiguration.jira.projectKey` → "Jira Project Key is required"
  - [ ] 2.1.2 blank full version format → "Full Version Format is required"
  - [ ] 2.1.3 build system needing VCS, no VCS path → "VCS Path is required for this build system"
  - [ ] 2.1.4 non-`ssh://` VCS path → the `ssh://` message; `ssh://` on another host → the host
        message naming the ecosystem host
  - [ ] 2.1.5 missing tag / branch → "Tag is required" / "Production branch is required"
  - [ ] 2.1.6 build system needing no VCS (`PROVIDED` and the rest of the exempt set) → no VCS
        issue
  - [ ] 2.1.7 ownership group ID with a bad token, an unsupported prefix, EXPLICIT mode with no
        tokens → one issue each on that row's path
  - [ ] 2.1.8 explicit external without display name / release manager / security champion →
        one issue each; skipped when `editable` says the field is not editable
  - [ ] 2.1.9 explicit external maven / docker / package coordinate incomplete or with an
        unsupported group prefix → issue on that coordinate path
  - [ ] 2.1.10 not explicit external → no display-name, people or coordinate issue
  - [ ] 2.1.11 a fully valid request → no issues
- [ ] 2.2 Implement `frontend/src/lib/component/portalCreateRules.ts`, reusing
      `vcsBlockApplies`, `SSH_VCS_URL_REGEX`, `isVcsHostSupported`, `findUnsupportedGroupId`,
      `isBadToken`.
- [ ] 2.3 Rewire `makeCreateSchema` to call it on the request it builds and map each path with
      `formFieldOfRule`, skipping the Jira project key and full version format rules that the
      Zod object already requires at field level. Before and after: the full `createFormModel.test.ts` and
      `CreateComponentPage.test.tsx` suites pass unchanged — no test edited.
- [ ] 2.4 Confirm tests pass. <record suite and counts>

## 3. Profile listing keeps templates (Decision 1)

- [ ] 3.1 Failing tests for `useComponentProfiles`:
  - [ ] 3.1.1 returns `regular` and `template` entries in the registry's order
  - [ ] 3.1.2 drops any other kind
- [ ] 3.2 Failing tests for `initialProfile`:
  - [ ] 3.2.1 a template listed first is never pre-selected; the first usable regular one is
  - [ ] 3.2.2 only templates usable → nothing pre-selected
  - [ ] 3.2.3 a clone never matches a template
- [ ] 3.3 Implement; existing call sites that assume `regular` only (`noProfiles`, clone matching)
      filter by kind.
- [ ] 3.4 Confirm tests pass.

## 4. Local parameter checks (Decision 2)

- [ ] 4.1 Failing tests for `templateParameterErrors(parameters, values)`:
  - [ ] 4.1.1 required parameter empty → required message; optional empty → none
  - [ ] 4.1.2 an empty parameter with a default takes the default, so required passes
  - [ ] 4.1.3 blank values dropped; the same value twice counts once
  - [ ] 4.1.4 two values for a single-value parameter → number-of-values message
  - [ ] 4.1.5 text longer than `maxLength` → length message
  - [ ] 4.1.6 pattern fails with `message` → that message; without `message` → a generic one
        naming the pattern
  - [ ] 4.1.7 pattern that does not compile → skipped
  - [ ] 4.1.8 select value not in `options` → option message
  - [ ] 4.1.9 multi select over `maxSelection` → maximum-selection message
  - [ ] 4.1.10 `crs-list` and `person` → only required and number of values; `labels` list takes
        several values
- [ ] 4.2 Implement `frontend/src/lib/component/templateParameters.ts`, plus
      `templateRequestBody(values, overrides)` building `{parameters: {NAME: string[]}, overrides}`.
- [ ] 4.3 Confirm tests pass.

## 5. Template API hooks (Decisions 3, 7)

- [ ] 5.1 Failing tests:
  - [ ] 5.1.1 `useComponentTemplate(id)` fetches `/component-templates/{id}`, not cached across
        wizard opens, exposes error and refetch
  - [ ] 5.1.2 `useTemplateRun` dry run posts `dryRun=true` with the body and returns the run
  - [ ] 5.1.3 a response for a run superseded by a newer one is discarded
  - [ ] 5.1.4 create posts `dryRun=false`; 201 returns the component; 422 returns the run as a
        rejection; 404 / 403 / 400 surface `errorMessage` with the status
- [ ] 5.2 Implement `hooks/useComponentTemplate.ts`, `hooks/useTemplateRun.ts`.
- [ ] 5.3 Confirm tests pass.

## 6. Problem attribution (Decision 5)

- [ ] 6.1 Failing tests for `reviewProblems(run, portalIssues)`:
  - [ ] 6.1.1 a registry problem keeps its fields, parameters and `templateProblem`
  - [ ] 6.1.2 a Portal issue on a path with sources names those parameters
  - [ ] 6.1.3 a Portal issue on a path with no sources and not overridden is a template problem
  - [ ] 6.1.4 a Portal issue on an overridden path names no parameter and is not a template
        problem
  - [ ] 6.1.5 a `name: …` prefixed message is placed on that field; an unprefixed one at the top
  - [ ] 6.1.6 the same path and message from both sides is shown once
- [ ] 6.2 Implement `frontend/src/lib/component/templateReview.ts`.
- [ ] 6.3 Confirm tests pass.

## 7. Parameters step (Decisions 1, 2)

- [ ] 7.1 Failing component tests for `TemplateParameterForm`:
  - [ ] 7.1.1 one input per parameter in order, label, hint, required / optional marker
  - [ ] 7.1.2 text → input; single select / crs-list → dropdown; multi select and `labels` →
        chips with "Add" offering only the options; person → people picker (people list when
        `multiple`)
  - [ ] 7.1.3 defaults pre-filled; a person default shows that user
  - [ ] 7.1.4 a pattern failure shows the template's message under the input while typing
  - [ ] 7.1.5 no request is sent while typing
- [ ] 7.2 Failing wizard tests in `CreateComponentPage.test.tsx`:
  - [ ] 7.2.1 template tile renders with version and "Template" marker; disabled with reason when
        not usable
  - [ ] 7.2.2 picking it shows the steps Profile, Parameters, Review & create
  - [ ] 7.2.3 picking a regular tile afterwards restores the regular steps and the key typed
        before
  - [ ] 7.2.4 template load failure → error with Retry, Next disabled
  - [ ] 7.2.5 Next disabled while a check fails; enabled when all pass
  - [ ] 7.2.6 Next sends exactly one dry run; a parameter problem from it returns to Parameters
        with the message on that input
  - [ ] 7.2.7 a clone shows no template tiles
  - [ ] 7.2.8 templates but no regular profile → template tiles beside the classification
        choices
- [ ] 7.3 Implement `components/template/TemplateParameterForm.tsx` and the wizard's template
      path in `CreateComponentPage.tsx`.
- [ ] 7.4 Confirm tests pass.

## 8. Review & create (Decisions 5, 6, 7)

- [ ] 8.1 Failing component tests for `TemplateReview`:
  - [ ] 8.1.1 every rendered field shown, grouped as in the regular Review; an unknown path
        under "Other fields"
  - [ ] 8.1.2 problems show with their parameter links; a link returns to Parameters with that
        input focused
  - [ ] 8.1.3 a template problem names the template id and version, no link
  - [ ] 8.1.4 the rendered VCS path off the ecosystem host shows the Portal message naming the
        source parameter; Create disabled
  - [ ] 8.1.5 only overridable fields are editable, each with the input for its field kind
  - [ ] 8.1.6 an edited field is marked "changed from template" and checked while typing; no
        dry run while typing; one dry run on leaving the field, with the override
  - [ ] 8.1.7 clearing the edit removes the override and shows the template's value
  - [ ] 8.1.8 Create disabled while a run is in flight, while any problem stands, or while the
        Jira task key is empty or malformed
  - [ ] 8.1.9 "more problems may follow" note when a create-rule problem is shown
- [ ] 8.2 Failing wizard tests for Create:
  - [ ] 8.2.1 Create posts `dryRun=false` with values, overrides, Jira task key and comment;
        201 → the success panel linking to the component
  - [ ] 8.2.2 422 → stays on Review with the returned problems
  - [ ] 8.2.3 404 → back to Profile with the message, listing refetched
  - [ ] 8.2.4 403 / 400 → message at the top of Review
- [ ] 8.3 Implement `components/template/TemplateReview.tsx`, `TemplateOverrideField.tsx`, and
      the create wiring.
- [ ] 8.4 Confirm tests pass.

## 9. Templates tab (Decision 8)

- [ ] 9.1 Failing tests for `useAdminComponentProfiles` (fetch per tab open, error state).
- [ ] 9.2 Failing component tests for `TemplatesPanel`:
  - [ ] 9.2.1 every entry with id, title, kind, version, status; a failed entry lists its
        problems
  - [ ] 9.2.2 last load status and problems, configuration version, and the "how templates
        change" note
  - [ ] 9.2.3 a live template's details: parameters with settings, classification, overridable
        fields, configuration text with Copy
  - [ ] 9.2.4 Try it: parameter form with local checks; Run sends one dry run; the result shows
        each field's source parameters and every problem, including Portal rules; no Create,
        no editable field
- [ ] 9.3 Failing test in `AdminSettingsPage.test.tsx`: the Templates tab is offered under the
      page's `IMPORT_DATA` gate.
- [ ] 9.4 Implement `hooks/useAdminComponentProfiles.ts`, `components/admin/TemplatesPanel.tsx`,
      the tab in `AdminSettingsPage.tsx`; Try it reuses `TemplateParameterForm` and
      `TemplateReview` in read-only mode.
- [ ] 9.5 Confirm tests pass.

## 10. e2e (route-mocked)

- [ ] 10.1 `frontend/e2e/visual/_helpers.ts` gains a template entry in `mockComponentProfiles`,
      and mocks for the template description, dry run and create.
- [ ] 10.2 Spec: pick the template, fill parameters, Next, Review shows the component, Create →
      success. `eslint e2e` clean.

## 11. Registry container — Gradle

- [ ] 11.1 Bump `crs.version` to the first registry release with templates.
- [ ] 11.2 Add the starter template to `src/test/resources/e2e/crs-fixture/component-profiles.yml`
      and the `infra/dev` registry, matching the registry's own dev template.
- [ ] 11.3 Run the e2e suite on CI.

## 12. Docs

- [ ] 12.1 `docs/features/create-component.md`: template tiles, Parameters, Review & create.
- [ ] 12.2 New `docs/features/admin-templates.md`; linked from `AGENTS.md`'s feature list.

## 13. Finalization

- [ ] 13.1 Full vitest green; `tsc`, `eslint .` and `eslint e2e` clean; `./gradlew qualityStatic`.
- [ ] 13.2 Out-of-scope boundaries hold: no diff in `components/editor/`, `ComponentDetailPage.tsx`,
      `lib/solutionKey.ts` or backend `src/main`; the regular wizard's tests unchanged by group 2.
- [ ] 13.3 The risks in `design.md` are still accurate.
