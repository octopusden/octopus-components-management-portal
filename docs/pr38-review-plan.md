# PR #38 — review action plan

> **STATUS — superseded by landed commits.** This doc was the working tracker
> during the multi-agent review pass. The "P1 — block merge", "P2 — fix before
> merge", and "Actionable Copilot findings" sections below are **historical
> context** describing what was found at review time. The authoritative current
> state is the **"Final landed state on PR #38"** table further down — every
> P1 item is either ✓ landed or explicitly deferred to a follow-up PR with the
> reason. Don't read the early sections as a current to-do list.

Multi-agent review of `feature/crs-schema-v2` (schema-v2 contract migration, Waves A–C + 0) + Copilot inline threads. Generated 2026-05-17 after the `2.0.84-3395 → 2.0.84-3519` CRS pin bump (commit `5ceb97a`) and unblocking draft → ready.

PR: https://github.com/octopusden/octopus-components-management-portal/pull/38

This doc is a working plan, not a TD. Items here that survive merge should fold into `docs/tech-debt/TD-005-schema-v2-followups.md` or become GH issues; the rest should be closed by commits on this branch.

## Status snapshot

- PR state: open, ready for review (was draft), mergeable.
- CI: all gates green except `security/dependency-check` and `security/codeql` (skipped — known TD, baseline scan pending on `main`).
- CodeRabbit auto-review: skipped — PR base is `develop`, not the default branch.
- Author-resolved threads: documented in 5 top-level comments referencing commits `aa4a543`, `afe4de8`, `080d416`, `555fe44`, `b869e39`.
- Pre-merge policy gate: `./gradlew e2eTest` must run locally against the bumped pin (per `gradle.properties:32-33`) — two CRS contract probes (`sort=componentKey`, `/meta/build-systems` persistence enum) plus the OIDC bare-roles sanity probe in `E2ETestcontainersDriver` must stay green.

## Copilot threads — current state

10 threads on the PR, all marked unresolved on UI. Verified against actual file state below.

### Already addressed in code — close threads on UI (no commit needed)

| Path:line | Copilot ask | Code today |
|---|---|---|
| `frontend/src/components/editor/FieldOverrideInline.tsx:61` | Boolean override value sent as string | `BOOLEAN_OVERRIDE_PATHS` Set at :17; Switch dispatch + JSON-bool coercion |
| `frontend/src/components/editor/GeneralTab.tsx:532` | `serverUrl` indexed by row position, diverges on reorder | Memoized `tcUrlByProjectId.get(currentProjectId)` at :520 |
| `frontend/src/components/editor/GeneralTab.tsx:580` | Doc Links inputs unlabeled for screen readers | `aria-label={`Doc link major version (row ${index + 1})`}` at :581 (same pattern applied to docComponentKey, artifactId, projectId) |
| `frontend/src/pages/ComponentDetailPage.tsx:281` | Pre-hydration save can wipe server data via clear-branches | `dirtyFields.{groupId,teamcityProjects,docs,artifactIds}` gates at :217,237,260,275 |
| `frontend/src/components/editor/DistributionTab.tsx:161` | Required fields sent unvalidated, blank rows reach server | `.trim()` on all string fields :119-147; blank-row filters in `handleSave` |
| `frontend/src/components/editor/VcsTab.tsx:61` | Blank `vcsPath` sent on Save | `.trim()` :75-80 + `.filter((e) => e.vcsPath !== '')` at :82 |
| `src/test/.../E2ETestcontainersDriver.kt` (outdated, errorStream IOException) | `inputStream` may throw on non-200 | `runCatching { (conn.errorStream ?: conn.inputStream)... }.getOrElse { "<unreadable body: ...>" }` at :501-503 |
| `gradle.properties` (outdated, sort=name) | Stale comment about removed backward-compat alias | Comment rewritten to `sort=componentKey (schema-v2 entity property)` — `:25-28` |

**Action:** click "Resolve conversation" on each in the GitHub UI.

### Actionable Copilot findings — ✓ ALL ADDRESSED in commit `441e08a`

- **A1** ✓ — `src/test/.../E2ETestcontainersDriver.kt:498-499, 558-559` — `connectTimeout = 30_000; readTimeout = 60_000` added on both new probes.
- **A2** ✓ — `frontend/src/components/CreateComponentDialog.tsx:115-117` — rewritten to "Renaming the component key later requires the Rename Components permission."

## Multi-agent fleet — findings

Six specialized agents reviewed architecture, security, tests, UI/UX, codegen, code-quality + one Sonnet validator on the CRS bump commit. Detailed reports captured in agent transcripts; consolidated and de-duplicated below. P0 already-fixed items are dropped from this list.

### P1 — block merge — historical (see "Final landed state" table for current status)

1. **Types misalign with required wire shape.** `frontend/src/lib/types.ts:48,57-62` declares `labels`, `docs`, `artifactIds`, `securityGroups`, `teamcityProjects`, `configurations` as `?:`, but OpenAPI marks them required. (`systems` is already required at `types.ts:15,35` — no fix needed there.) A backend bug dropping `configurations` would surface as a silently-empty editor, not an error. **Fix:** drop `?:` from the six server-required arrays; surface absent-required as error in `selectBaseRow`/refetch.

2. **`clearGroup` semantic gap.** `frontend/src/lib/types.ts:348` makes `clearGroup` optional; OpenAPI marks required. All tab Saves (Build/Jira/Escrow/Vcs/Distribution) PATCH without `clearGroup`. If Jackson enforces required, every non-General save 400s. **Fix:** default `clearGroup: false` in every `updateMutation.mutateAsync` callsite, or verify backend leniency and pin a contract test.

3. **`solution` flag not dirty-gated.** `frontend/src/pages/ComponentDetailPage.tsx:296` sends `solution: values.solution` unconditionally. Form default `false`; fast Save before `useEffect` mirrors server `null` → "unknown" rewritten as `false`. Companion to Copilot dirty-gates already in place; this one slipped through. **Fix:** gate behind `dirtyFields.solution` like archived/releasesInDefaultBranch.

4. **Split-brain form state across tabs.** `BuildTab` `useState + useEffect([component])`; `GeneralTab` RHF. After Save on tab A → parent refetch → tab B `useEffect` clobbers unsaved edits silently. No `isDirty`, no route-leave guard, Save active without changes (no-op PATCH bumps `version`). **Fix:** either migrate all tabs to one RHF form (recommended) or gate `useEffect` mirror on `component.id` identity + add per-tab dirty tracking.

5. **OverrideRowEditor type-picker uses bare `<input type="radio">`.** `frontend/src/components/editor/OverrideRowEditor.tsx:468-489`. Tailwind dark-mode tokens broken, focus ring inconsistent with the rest of the dialog (all other controls are shadcn `Select`). **Fix:** replace with shadcn `RadioGroup` or `Tabs`.

6. **Drift gate not wired into CI.** `frontend/package.json:17` defines `generate-types:check`, but `.github/workflows/merge-gate.yml` does not run it. The "Wave 0 drift gate" is local-only — any contributor can re-vendor `v4.json` and merge without regenerating `schema.d.ts`. PR body + TD-005 line 15 both overclaim. **Fix:** add a `run: npm run generate-types:check` step to the `frontend` job between `npm ci` and `lint`.

7. **`:e2eTest` Gradle task not in any workflow.** `build.gradle.kts:196` defines `e2eTest` but `.github/workflows/` has zero references. The three Kotlin contract probes (`sort=componentKey`, `/meta/build-systems` persistence enum, OIDC bare roles) run only on engineer laptops. **Fix:** add a job (or extend `quality`) that runs `:e2eTest` on PRs that touch `src/test/kotlin/**` or `gradle.properties`.

8. **Override marker submit-body assertions thin.** `frontend/src/components/editor/OverrideRowEditor.test.tsx` exercises a full marker submit body for `build.requiredTools` only; the other five markers (`vcs.settings`, `distribution.{maven,fileUrl,docker,packages}`) get "renders Add button" smoke. **Fix:** parametrized table-driven test that adds N child rows per marker, types values, submits, asserts wire body shape.

9. **Override delete round-trip never asserted.** `frontend/src/components/editor/FieldOverrides.test.tsx:178-192` opens the confirm dialog and asserts visibility, then stops. `mockDeleteMutateAsync` is declared and reset but `toHaveBeenCalled()` is never asserted anywhere. The deletion API takes only `overrideId: string` (`useComponent.ts:119`; `FieldOverrides.tsx:56` passes `overrideId` through). **Fix:** click Delete, assert `mockDeleteMutateAsync('fo-scalar')` (the override row's id, e.g. `'fo-scalar'` in the fixture) was called, assert toast.

### P2 — fix before merge — historical (see "Final landed state" table for current status)

11. **`useComponent.fieldOverrides` test asserts only cache invalidation.** `frontend/src/hooks/useComponent.fieldOverrides.test.ts` — body of the underlying `api.post/patch/delete` calls never inspected. **Fix:** add assertions on `mockApi.post.mock.calls[0][0]` (URL) and `[1]` (body) for one scalar + one marker create.

11a. **`OverrideRowEditor.buildMarkerChildren` skips trim/blank-row filter.** `frontend/src/components/editor/OverrideRowEditor.tsx:328-378` — five of six marker keys (`vcsEntries`, `mavenArtifacts`, `fileUrlArtifacts`, `dockerImages`, `packages`) spread raw row state into the wire payload with no normalization. Whitespace-only required fields satisfy browser `required` validation and reach the server as `"   "` for `vcsPath`, `groupPattern`, `artifactPattern`, `url`, `imageName`, `packageType`, `packageName` → 400 from CRS. The matching VcsTab `:75-82` and DistributionTab `:119-147` already trim + drop blank rows; `requiredTools` at `:374` is the only marker that gets it right inside the modal. **Fix:** apply the same `.trim()` + `.filter(blank-required-fields-out)` to all five marker branches; ideally extract a shared `cleanRow` helper used by both the tabs and the modal.

12. **SCALAR_ATTRS catalogue is a hand-mirror with no contract gate.** `frontend/src/components/editor/OverrideRowEditor.tsx:43-80` duplicates Kotlin `ConfigurationRowAccessors.SCALAR_ATTRIBUTE_PATHS`. CRS drift surfaces only as a runtime "Unknown scalar attribute" toast. **Fix:** add `/meta/scalar-attributes` to CRS (track in TD-005 + CRS-side task list) and load via TanStack Query, with this hardcoded list as fallback. Until then, add a console.warn when a stored override references an attribute not in the catalogue.

13. **`SecurityGroupRequest.groupType` optional in types, required on wire.** `frontend/src/lib/types.ts:267-269`. Type system allows `{ groupName: "..." }` without `groupType`; CRS will 400. **Fix:** `groupType: string` (no `?`).

14. **`selectBaseRow` masks multi-BASE bug.** `frontend/src/lib/api/baseRow.ts:11` returns first match silently. Server invariant: exactly one BASE per component. **Fix:** when `filter(r => r.rowType === 'BASE').length > 1`, log + use the most recent (or error and refetch).

15. **Tab-level 409 handling weaker than page-level.** `BuildTab.tsx:88-96` (+ Jira/Escrow/Vcs/Distribution) toast "Please refresh and try again" without `refetchQueries` or `describeOptimisticConflict`. User loops on 409s. **Fix:** extract page-level conflict handler from `ComponentDetailPage.tsx:321-338` and reuse.

16. **`OverrideRowEditor` is a god component (805 LOC).** Scalar and marker paths share only the `Dialog` shell, version range, and submit footer. Six near-identical marker-child blocks at :584-789 duplicate the same shape that DistributionTab renders again at :208+. **Fix:** extract `<ListEditor>` + `<ListEditorRow>` primitive; split modal into `<ScalarOverrideForm>` + `<MarkerOverrideForm>` under a shared shell. ~250 LOC savings across both files.

17. **`handleSave` is 230 LOC of pure mapping in a page component.** `frontend/src/pages/ComponentDetailPage.tsx:131-365`. Four near-identical patch-blocks for tcProjects/group/docs/artifactIds. **Fix:** extract `lib/component/buildUpdateRequest.ts` taking `(component, values, fcVisibilities, dirtyFields)` → pure function, unit-testable. Page reduces to `try { await mutate(build(...)) } catch { toast }`.

18. **Inline vs modal override editors — two UX models, one data.** `FieldOverrideInline.tsx` (inline, scalar-only) coexists with `OverrideRowEditor.tsx` (modal, scalar+marker). Build-tab users never see an entry point for `build.requiredTools` (marker). **Fix:** pick one. Recommend keeping the modal as primary and dropping inline, OR add "Manage overrides…" per section button that opens modal pre-filtered. Today both exist and the user has to know.

19. **Migration comments will rot.** `types.ts:1-4`, `OverrideRowEditor.tsx:65-70`, `ComponentDetailPage.tsx:64,70,148,196,225,245,352`. References to "Wave A/B", "CRS PR #192/193", `TODO(3.1b)` lose meaning post-merge. **Fix:** rewrite for *why* without referencing specific PRs. Example: `// until CRS registers escrow.buildTask in SCALAR_ATTRIBUTE_PATHS` not `// CRS PR #193 didn't wire it`.

20. **`schema.d.ts` carries dead schema-v1 types.** `VersionedComponentConfiguration`, `VCSSettingsDTO`, `JiraComponentDTO` still in the generated file because CRS still publishes the v2 endpoints. They'll appear in IDE autocomplete and confuse readers. **Fix:** track in TD-005 — drop from spec once CRS retires v2 endpoints; out of scope for this PR.

### P3 — follow-up (file as TD-005 items or new issues)

- `selectBaseRow` doesn't surface `isSyntheticBase` — caller can't tell real vs synthesized BASE; PATCH semantics differ (creates vs updates). Add `selectBaseRow(detail): { row, isSynthetic }`.
- `types.ts:428` `value: unknown` divergence from generated `Record<string, never>` needs an inline comment explaining the Springdoc artifact.
- Test fixture duplication: every editor `.test.tsx` redefines `makeComponent`, `makeMutation`, `renderWithProviders` (~50 LOC × 5 files). Extract `frontend/src/test-utils/component-fixtures.ts`.
- `ConfigurationsTab.tsx:59` unchecked `as 'build'|'escrow'|'jira'` cast — future scalar in a new aspect family silently un-renderable.
- `MigrationPanel` 501 banner — long four-sentence paragraph in `StatusBanner` with no icon. Tighten copy.
- Free-text inputs where enums exist: `OverrideRowEditor.tsx:605` (vcs `repositoryType`), `DistributionTab.tsx:393` (security `groupType`). Use `EnumSelect`.
- Booleans in `FieldOverrideInline` rendered as bare `Switch` with no on/off label. Add inline true/false text.
- Helper text density wildly varies across tabs. BuildTab/JiraTab have none; GeneralTab has helpful prose under every field.
- Save buttons no spinner / no `aria-busy` during pending PATCH (MigrationPanel has spinner; tab Saves don't).
- Dialog focus-return on modal close not explicitly set (Radix default — verify behavior).
- "Synthetic group (isFake)" leaks wire field name to user. Tooltip needed.
- TD-005 dangling items #5, #6, #10 should be GitHub issues, not bullets — they will be forgotten when TD-005 stops being read post-merge.

### Security verdict

Clean. One defence-in-depth follow-up only:

- `ConfigurationsTab.tsx:52-68` `scalarOverrideSummary`: server-supplied `overriddenAttribute` walks the prototype chain via `!(fieldKey in aspect)`. No XSS (React escapes), no prototype pollution (read-only path), but tighten to `Object.hasOwn(aspect, fieldKey)` + an allowlist matching `OverrideRowEditor`'s `SCALAR_BY_PATH`.

Forbidden-token gate (`OpenWay|CARDS|DWH_DB|F1SC-`) — zero hits across diffed files, commit subjects, and PR title.

## Action plan — commit-sized chunks

Order chosen so each commit is independently mergeable and the riskier wire-shape fixes land first. Each commit must have a Sonnet review subagent per project policy.

1. **`fix(portal): align nullability + clearGroup default with CRS v4 contract`**
   Closes P1-1, P1-2, P2-13. Touch: `types.ts` (drop `?:` from server-required arrays, drop optional on `SecurityGroupRequest.groupType`, change `clearGroup` to required); add `clearGroup: false` default to every `mutateAsync` callsite outside GeneralTab. Compile-driven — TypeScript will surface caller breakage in `useComponent.ts`, `baseRow.ts`, every tab.

2. **`fix(portal): dirty-gate solution flag in central save handler`**
   Closes P1-3. Touch: `ComponentDetailPage.tsx:296` to gate `solution` behind `dirtyFields.solution`, matching the surrounding archived/releasesInDefaultBranch pattern. Add a regression test in `ComponentDetailPage.test.tsx` analogous to the existing TC-projects pre-hydration tests.

3. **`fix(portal): replace bare radio in OverrideRowEditor type-picker`**
   Closes P1-5. Touch: `OverrideRowEditor.tsx:468-489` (use shadcn `RadioGroup` or `Tabs`). Visual snapshot + a11y test for the radio.

4. **`fix(e2e): connect/read timeouts on CRS contract probes + CreateComponentDialog copy`**
   Closes A1, A2 (Copilot). Touch: `E2ETestcontainersDriver.kt:503` (timeouts on both new probes), `CreateComponentDialog.tsx:115` (rewrite copy).

4a. **`fix(portal): trim + drop blank rows in OverrideRowEditor marker payloads`**
   Closes P2-11a. Touch: `OverrideRowEditor.tsx:328-378` — apply the existing VcsTab/DistributionTab `.trim()` + blank-required-row `.filter()` pattern to the five marker branches that don't have it. Add regression test in `OverrideRowEditor.test.tsx` analogous to `DistributionTab.test.tsx:91-156` (the blank-row filter regression-lock that's already in the repo per project memory). Optional: extract a shared `lib/component/cleanRow.ts` helper used by tabs + modal.

5. **`test(portal): full marker submit + delete round-trip + body assertions`**
   Closes P1-8, P1-9, P2-11. Touch: `OverrideRowEditor.test.tsx` (parametrized markers), `FieldOverrides.test.tsx` (delete flow — assert `mockDeleteMutateAsync('fo-scalar')`), `useComponent.fieldOverrides.test.ts` (URL + body assertions).

6. **`ci(merge-gate): wire generate-types:check + :e2eTest into PR gate`**
   Closes P1-6, P1-7. Touch: `.github/workflows/merge-gate.yml` (add `npm run generate-types:check` step in `frontend` job; add `gradle :e2eTest` job conditional on touched paths). Re-run on this PR to verify CI green.

7. **`refactor(portal): unify list-editor primitive + split OverrideRowEditor`**
   Closes P2-15, P2-16, P2-18. New: `frontend/src/components/ui/ListEditor.tsx`. Use from DistributionTab + OverrideRowEditor + GeneralTab. Split `OverrideRowEditor` into `<ScalarOverrideForm>` + `<MarkerOverrideForm>` under shared shell. Drop `FieldOverrideInline` (or keep with feature flag — decide).

8. **`refactor(portal): split-brain form state — single RHF tree`** *(largest change — defer if PR scope already too big)*
   Closes P1-4. Migrate Build/Distribution/Escrow/Vcs/Jira to share GeneralTab's RHF form, or at minimum gate `useEffect` mirror on `component.id` and surface `isDirty` per tab. Strongly recommended before merge but acceptable as a follow-up PR if waves get tight.

9. **`refactor(portal): extract buildUpdateRequest + scrub migration-PR comments`**
   Closes P2-17, P2-19. New: `frontend/src/lib/component/buildUpdateRequest.ts` (pure function). Add unit tests for cross-tab patch logic. Sweep migration/Wave references from comments.

10. **`fix(portal): tab-level 409 handler + selectBaseRow multi-BASE guard + SCALAR_ATTRS warn`**
    Closes P2-12, P2-14, P2-15 (continued). Extract `useOptimisticConflict()` hook from `ComponentDetailPage.handleSave`. Log when multi-BASE detected. Console-warn when stored override path absent from catalogue.

11. **`docs(tech-debt): TD-005 reconciliation + P3 items as GH issues`**
    File P3 items as GH issues; update TD-005 with their numbers; downgrade TD-005 line 15 status to reflect P1-7 (drift gate is local-only until CI lands).

## Pre-merge checklist

- [ ] All P1 commits landed (1, 2, 3, 4, 5, 6 above).
- [ ] P2-before-merge commits landed:
  - [ ] **4a** — `OverrideRowEditor` marker trim/blank-row filter (P2-11a wire-shape risk; matches established VcsTab/DistributionTab pattern).
  - [ ] **P2-13** — `SecurityGroupRequest.groupType` non-optional (folded into commit 1).
  - [ ] **P2-15** — tab-level 409 handler unified with page-level (commit 10).
- [ ] `./gradlew e2eTest` green locally against CRS `2.0.84-3519`.
- [ ] CI green including new `generate-types:check` + `:e2eTest` steps.
- [ ] All 10 Copilot threads resolved on UI (8 already-addressed + 2 new fixed).
- [ ] PR body smoke checklist run against `2.0.84-3519` and ticked.
- [ ] CRS PR #192 + #193 merged to `v3` (external blocker — track in CRS).
- [ ] Sonnet review subagent run on each implementation commit (project policy).

## Notes

- P3 items have not been triaged for "fix-now vs defer". The default is defer unless trivially bundled into a P2 commit (e.g. comments, helper text).
- The P2 split-brain form-state refactor (item 8 above) is the largest open structural risk. If kept out of this PR, the follow-up should land before the next schema migration so the per-tab `useState` pattern doesn't propagate further.
- The hand-rolled `types.ts` vs generated `schema.d.ts` cutover is parked. Every P1-1/P1-2/P2-13 finding would be a compile error for free if the cutover happened. Worth a dedicated PR after this one merges.

## Final landed state on PR #38

| # | Commit | Closes |
|---|---|---|
| 1 | `46a6848` | P1-1 nullability + P1-2 clearGroup + P2-13 groupType |
| 2 | `b2b9e67` | P1-3 solution dirty-gate |
| 3 | `bfc5c1b` | P1-5 bare radio → Tabs |
| 4 | `441e08a` | A1 e2e timeouts + A2 dialog copy |
| 4a | `33cc9ad` | P2-11a marker trim/filter |
| 5 | `25c3c37` | P1-8 marker submit + P1-9 delete + P2-11 hook contract |
| 5a | `07f5b13` | aria-labels (Sonnet follow-up) |
| 6 | `935ffdf` | P1-6 drift gate wired in CI |
| 6a | `0340703` | TD-005 line 15 status reconciled |
| 9 | `0ac28b7` | P2-17 extract buildUpdateRequest + 20 unit tests |
| 10 | `f5b73ea` | P2-12 SCALAR_ATTRS warn + P2-14 multi-BASE guard + P2-15 unified 409 handler |
| 10a | `41abcc2` | Copilot follow-up: solution shouldDirty + systems pre-hydration gate |
| 10b | `2595d6a` | Sonnet follow-up: empty-after-dirty systems guard |
| 12 | `05cd94a` | P2-19 scrub Wave / CRS PR #192/193 comments |
| 12a | `32552ab` | Scrub CRS PR #188 comments (TeamCity unrelated) |

Tests: 510 → 660+ (frontend unit). CI: green (frontend, build, quality, security/trivy, gate/merge). Pre-merge runtime gates that remain manual: `./gradlew e2eTest` against CRS `2.0.84-3519`; CRS PR #192 + #193 merge to `v3`.

## Deferred items (suggest follow-up PRs)

- **P1-4** split-brain form state (planned #8) — migrate Build/Distribution/Escrow/Vcs/Jira tabs from `useState + useEffect([component])` to a single RHF tree. Largest structural change; deferred to avoid bloating this PR past review-able size.
- **P1-7** wire `./gradlew :e2eTest` into CI — needs Docker-on-runner + internal CRS registry credentials + bootJar build + Ryuk/sock configuration. Tracked in TD-005.
- **P2-16/P2-18** split OverrideRowEditor (805 LOC) into `<ScalarOverrideForm>` + `<MarkerOverrideForm>` and extract `<ListEditor>` primitive used by both modal and tabs. Single-file refactor across ~11 sites; defer to focused PR.
- All remaining P3 items (test-utils fixture extraction, dead schema-v1 types, etc.) — should be filed as GH issues against this repo per the plan's commit #11.
