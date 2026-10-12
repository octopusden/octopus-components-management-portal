## Context

- `createFormModel.ts` holds the four profiles as code: `ComponentProfile` (a string union),
  `PROFILE_META` (label, description, `asksExplicit`), `flagsForProfile` and `profileFromSource`.
- `componentKeyError` runs the charset check (`componentKeyCharsetError`, spec
  `component-key-format`), then a solution-substring rule fed by `portalConfig.solutionKeyPatterns`.
  It runs inside `makeCreateSchema`'s `superRefine`, with RHF `mode: 'onChange'` and a full
  `safeParse` for the stepper's cross-step markers.
- `onSubmit` builds the request with `buildCreateRequest`, overlays `solution` from the profile
  flags, and maps 400/409 bodies to a step and field.
- The registry now serves `GET /rest/api/4/component-profiles` (`ACCESS_COMPONENTS`):
  `profiles[]` of `{id, kind, title, description, classification {external, explicit:
  "true"|"false"|"ask", solution}, rules [{path, pattern, message}], usable, unusableReason?}`,
  in configured order. `ComponentCreateRequest` gains an optional `profile`; when given, the
  registry checks the profile is live and usable, the stored classification matches, and every
  rule as a whole-value Java regex match against the stored value (`""` when absent).
- The listing may be empty: the registry starts with no profiles when service-config carries no
  profile subtree, and its functional spec has the create dialog say so and let the user set the
  classification, sending no `profile`.
- The registry checks the classification against the flags it would store: a flag hidden by
  field-config is stripped, an absent flag is `false`, and a flag the user may not edit is
  rejected if sent (`enforceEditabilityOnCreate`). A rule failure answers 400
  `<create-request path>: <message>`, e.g. `baseConfiguration.jira.projectKey: …`; a profile
  failure answers 400 `profile: …`.
- Rule paths are the registry's fixed list (`CreateRequestPaths.PATHS`): `name`, `displayName`,
  `clientCode`, `artifactIds[0].groupPattern`, `baseConfiguration.build.buildTasks`, the first
  VCS entry's `vcsPath`/`branch`/`tag`, `jira.projectKey`/`versionPrefix` and the five version
  formats, the first Maven artifact's `groupPattern`/`artifactPattern`, the first Docker image's
  `imageName`/`flavor`, the first package's `packageName`.
- `initialValues(source, defaults)` pre-fills the form from component-defaults, Portal fallbacks
  and the source; for scratch it seeds explicit/external from the built-in pre-selected profile.
  The wizard mounts only once the source and component-defaults have loaded.
- `labels` and `baseConfiguration.build.buildTasks` are already on the create request. Clone
  already copies the source's labels and build aspect through `buildCreateRequest`.
- The editor gates its Solution toggle on `isSolutionCandidate(key, solutionKeyPatterns)`
  (`ComponentDetailPage.tsx`); nothing in this change touches it.

## Example

Registry profiles (as service-config ships them):

| id | classification | rule on `name` |
|---|---|---|
| `regular-external` | external, explicit `ask` | `^(?!.*(solution\|dmp-bundle)).*$` |
| `regular-internal` | internal, explicit `ask` | same |
| `solution` | solution, external, explicit | `^[a-z][a-z0-9-]*-solution(-[a-z0-9-]+)?$` |
| `dmp-bundle` | solution, external, explicit | `^[a-z][a-z0-9_-]*dmp-bundle[a-z0-9-]*$` |

Typing in the Component Key field:

| Profile | Key | Shown under the key |
|---|---|---|
| Regular external | `payments` | nothing |
| Regular external | `resolution-service` | the regular profile's message |
| Regular external | `Payments` | the charset message (checked first) |
| Solution | `payments-solution` | nothing |
| Solution | `payments-dmp-bundle` | the Solution profile's message |
| DMP Bundle | `payments-dmp-bundle` | nothing |

Clone of `payments-dmp-bundle` (solution, external, explicit): `solution` matches the
classification but its rule fails on the key; `dmp-bundle` matches both → pre-selected.

## Goals / Non-Goals

**Goals:**
- The Profile step is drawn entirely from the registry's answer.
- The wizard's fast key check and the registry's check on create use the same rules, so a key
  the wizard accepts is not rejected for a profile rule.
- Labels and build tasks can be set at create.

**Non-Goals:**
- Templates, the D&S restriction and the editor — see proposal.
- Re-implementing the registry's checks in full: a rule the Portal cannot evaluate is left to
  the create.

## Decisions

### 1. One query, fetched fresh per page and kept while open

- `useComponentProfiles()` in `frontend/src/hooks/`, TanStack Query over
  `GET /rest/api/4/component-profiles`, typed from the re-vendored `schema.d.ts` (vendored from
  the registry change's branch until it merges).
- `staleTime: 0`, `refetchOnMount: 'always'` and `retry: false`: each page mount fetches, and a
  failure shows at once.
- `useProfilesForWizard` (page) takes only a listing fetched after the page mounted
  (`isFetchedAfterMount`, not fetching), so a reopened wizard never starts from the cached list,
  and keeps it while the page is open: a later refetch that fails cannot tear down a form in
  progress. The error shows only while no listing has arrived.
- "Create another" remounts the wizard on the same page and reuses that listing.
- Entries whose `kind` is not `regular` are filtered out in the hook; the page never sees them.

### 2. The profile is the registry's object, not a Portal enum

- `ComponentProfile` is the registry's profile shape, exported by `useComponentProfiles.ts`; the
  page holds the selected `id`.
- `PROFILE_META`, the string-union type and the hard-coded `flagsForProfile` switch are removed
  from `createFormModel.ts`; the profile logic lives in `lib/component/createProfile.ts`.
- `flagsForProfile(profile, explicitAnswer)` is rewritten over `classification`: `solution` and
  `external` taken as given; `explicit` is `true`/`false` as given, or the user's answer when
  `ask`. `asksExplicit` is `classification.explicit === 'ask'`.

### 3. Field rules: checked against the request the wizard would send

- `lib/component/profileRules.ts`: `profileRuleErrors(rules, request) → Map<path, message>`, pure.
- The value checked is read from the request `buildCreateRequest` builds for the current form
  values, with the page's editability — not from the raw form. So a stripped field, a coordinate
  of another type, or a version format left on "same as" all read as `""`, as the registry sees
  them — except build tasks under field-config, see Risks.
- The reader covers the registry's path list (Context); a rule on any other path is skipped.
- A second table maps each path to the wizard field that shows its message: `name`,
  `displayName`, `clientCode`, `ownership.0.groupId`, `buildTasks`, `vcsUrl`, `vcsBranch`,
  `vcsTag`, `jiraProjectKey`, `versionPrefix`, the version-format fields, and
  `coordinate.groupPattern` / `artifactPattern` / `imageName` / `flavor` / `packageName`.
- Whole-value match: the pattern is compiled as `^(?:<pattern>)$`, matching Java's `matches()`.
- A pattern `new RegExp` cannot compile is skipped. Compiled patterns are cached per rule object
  (a `WeakMap`).
- When several rules on one path fail, the first one's message is shown.
- An absent value is matched as `""`, so the pattern decides whether it may stay empty, as in
  the registry.
- `makeCreateSchema` takes the selected profile's rules instead of the profile enum and
  `solutionPatterns`, and builds the request itself with `buildCreateRequest(values, source,
  editable)` — the escrow arguments it leaves at their defaults touch no rule path; the
  `{ labels, buildTasks }` visibilities default to editable (see Risks). `addProfileRuleIssues`
  adds one issue per failing rule on the mapped field, tagged `params.profileRule`, so the stepper
  marks the right step without new routing.
- A tagged issue whose field shows no error on its step (`fieldShowsError`: a field the user may
  not edit, a VCS field without a VCS block, the version prefix and formats, a coordinate when not
  explicit external) is listed at the top of that step (`StepRuleMessages`), so Create is never
  held without a visible reason. (changed during implementation: no `requestFor` parameter)
- `componentKeyError` keeps only the charset check; the profile rule on `name` is added after
  it, so a key shows one message at a time: "required" while blank, then the charset rule, then
  the profile rule.

### 4. Clone pre-selection

- First usable profile whose classification matches the source (`solution` and `external`
  equal; `explicit` equal or `ask`) and whose `name` rules pass on the source key.
- Otherwise the first usable profile whose classification matches.
- Otherwise none is pre-selected and the clone sets its classification directly, starting from
  the source's (Decision 10): it opens on General and sends no profile. The Profile gate
  (`profileMissing`) applies whenever profiles are offered and none is selected. (changed on
  review: the clone first opened on Profile and had to pick one, changing its classification)
- The explicit answer is seeded from the source's `distributionExplicit`.
- Picking another profile resets the key, as today.

### 5. Loading, empty and unusable

- The profiles join `CreateComponentPage`'s `ready` gate (Decision 7): while they load, the page
  shows its existing skeleton and the wizard is not mounted.
- Error: the page shows an inline error with Retry instead of the wizard. Retry refetches; on
  success the wizard mounts with the profiles. Clone behaves the same; a clone whose source fails
  to load shows that error first, as today.
- No `regular` profile is not an error: the wizard mounts with an empty list (Decision 10).
  (changed on review: the registry now starts without profiles)
- A profile the registry marks `usable: false` renders as a disabled radio with
  `unusableReason` below the description; arrow-key navigation skips it.
- Scratch pre-selects the first usable profile; none usable → nothing selected and the step's
  gate blocks Create.

### 6. Submit

- `solution` keeps today's editable-only overlay, now from the profile's classification, or from
  `manualFlags` when the classification is chosen directly (Decision 10).
- The request gains `profile: profile?.id` — with no registry profiles it is undefined and
  dropped from the JSON body.
- A 400 whose field is `profile` routes to the Profile step.
- The step a rejection routes to shows its message at the top (`StepServerError`); Review keeps
  its own banner. So a rule rejection on a field the step does not show (a hidden field, a
  coordinate of another type) is still visible.
- A 400 whose field is a rule path (`baseConfiguration.jira.projectKey`, …) is mapped through
  the path → field table (Decision 3) to its field and step. Without it, `stepOfField` would read
  the head `baseConfiguration` and send every such error to General. Both live in
  `routeProfileRejection`, outside `onSubmit`.
- A profile change, an explicit-answer change, or a manual classification change marks the
  wizard as touched for the unsaved-changes guard, as a profile-only change did before.

### 7. Today's pre-filled values

- `initialValues` keeps every source it reads today: component-defaults (build system, display
  name, Jira project key, version formats, escrow generation, VCS tag and branch, copyright when
  explicit and external), `SCRATCH_DEFAULTS` (full version format fallback), `FALLBACK_VCS_BRANCH`,
  and for a clone the source. The owner is still seeded from the current user and the version
  prefix still follows the key.
- Only its input changes: scratch's explicit/external come from the pre-selected registry profile
  (Decision 5) instead of `DEFAULT_SCRATCH_PROFILE`; with no usable profile they stay at
  `SCRATCH_DEFAULTS` (external, not explicit), today's values. So `CreateComponentPage` adds the
  profiles to its `ready` gate, and the wizard mounts with them, as it already waits for
  component-defaults.
- With the shipped profiles the first usable one is Regular external (`explicit: ask`, answer
  No), so a new component's initial values are byte-for-byte today's; a test pins that.
- Picking another profile changes only what picking does today: the flags and a cleared key.

### 8. Labels and build tasks

- Labels: `ChipsInput` in General → Classification, options from `useLabels()` (fetched only
  when editable), no free-text entries; `useFieldVisibility('component.labels')`: editable → the
  form's labels; readonly → shown disabled, a clone keeps the source's labels; hidden → not
  shown and none sent.
- Build tasks: an `Input` on Build, with `useFieldVisibility('build.buildTasks')`: editable →
  trimmed, omitted when blank; readonly → shown disabled, a clone keeps the source's value;
  hidden → not shown and stripped. `buildCreateRequest` takes both as
  `{ labels, buildTasks }` visibilities.
- Both added to `CreateFormValues`, `initialValues` (clone seeds from the source) and
  `buildCreateRequest`; when editable the form value wins over the source's copy.
- Review lists each under its step's group when the field is shown.

### 9. Registry container in e2e and local dev

- `E2ETestcontainersDriver` runs the registry with `dev-db-automigrate`, which carries no
  profiles. The four profiles live in `src/test/resources/e2e/crs-fixture/component-profiles.yml`,
  inside the fixture directory the driver and `infra/dev` compose already mount at
  `/opt/crs-fixture`; both load it with `SPRING_CONFIG_ADDITIONAL_LOCATION=optional:file:…`.
  One file for both, no dependency on the registry image's `dev` profile, and a registry version
  without profiles ignores the subtree. (changed during implementation: a JSON env value in two
  places was the plan)
- The route-mocked wizard e2e mocks `GET /component-profiles` with the same fixture the unit
  tests use (`mockComponentProfiles`).
- `crs.version` is bumped to the first registry release with profiles once it exists (open).

### 10. No profiles: the classification is chosen directly

- With an empty list, or for a clone whose source matches no usable profile
  (`isManualClassification`), the Profile step shows a notice saying which and three controls
  instead of tiles:
  External / Internal, "Has explicit distribution?" (the existing Yes/No control), and a Solution
  checkbox shown only for External + Yes. Leaving explicit external clears Solution.
- `manualFlags(external, explicit, solution)` in `createProfile.ts` gives the flags, with
  solution forced `false` unless external and explicit — the registry's own rule for a solution.
- No profile is selected, so the Profile gate does not apply, the request carries no `profile`,
  and the schema gets no rules: only today's checks run.
- A new component starts as `SCRATCH_DEFAULTS` (external, not explicit, not a solution), the
  values `initialValues` already gives without a profile. A clone starts with the source's
  solution, external and explicit flags and opens on General.
- Rejected alternative: falling back to the four built-in profiles without rules — it would bring
  back the hard-coded list this change removes, as a second source.

## Risks / Trade-offs

- **Two regex engines.** The registry checks with Java, the wizard with JavaScript. A Java-only
  construct is skipped in the browser and caught on create. Accepted: the registry's contract
  requires patterns valid in both.
- **The path list can drift.** The reader and the path → field table copy the registry's fixed
  path list. A path the registry adds later is skipped by the wizard until both learn it; the
  create still rejects a failing value. Accepted: the contract does not enumerate the
  paths, so the list is copied from the registry's `CreateRequestPaths`; today's profiles only
  rule on `name`.
- **Locked classification flags are not handled.** If field-config ever stops a user editing
  `component.solution`, `distributionExternal` or `distributionExplicit`, the wizard does not send
  that flag, the registry stores `false`, and a create with a profile needing it `true` is
  rejected with 400 `profile: …` on the Profile step. The wizard neither disables such a tile
  nor hides the explicit question. Accepted: the registry's baseline makes all three editable and
  no installation's field-config locks them; revisit if one does.
- **Hard dependency on the listing.** No registry answer, no create. Accepted: a create without
  the registry's profiles would be checked against nothing the user saw.
- **Two sources for "is this a solution key".** The editor still reads
  `solution-key-patterns`, the wizard reads the profile rules; an administrator changing one
  must change the other. Accepted until the editor moves to profile rules; recorded as
  TD-006.
- **The live rule check treats build tasks as editable.** `makeCreateSchema` builds the request
  without the page's build-tasks visibility, so a rule on `baseConfiguration.build.buildTasks`
  is checked against the form value even when field-config hides the field and the create strips
  it. Accepted: no profile rules on build tasks today, and the create's answer decides. Labels
  are unaffected: no rule path reads them.
  (found during implementation)
