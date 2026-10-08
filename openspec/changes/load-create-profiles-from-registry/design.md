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

### 1. One query, fetched fresh per wizard

- `useComponentProfiles()` in `frontend/src/hooks/`, TanStack Query over
  `GET /rest/api/4/component-profiles`, typed from the re-vendored `schema.d.ts`.
- `staleTime: 0` with refetch on mount, so a profile change applied by a reload shows up the
  next time the wizard opens.
- Entries whose `kind` is not `regular` are filtered out in the hook; the page never sees them.

### 2. The profile is the registry's object, not a Portal enum

- `ComponentProfile` becomes the registry's profile shape; the page holds the selected `id`.
- `PROFILE_META`, the string-union type and the hard-coded `flagsForProfile` switch are removed.
- `flagsForProfile(profile, explicitAnswer)` is rewritten over `classification`: `solution` and
  `external` taken as given; `explicit` is `true`/`false` as given, or the user's answer when
  `ask`. `asksExplicit` is `classification.explicit === 'ask'`.

### 3. Field rules: checked against the request the wizard would send

- `lib/component/profileRules.ts`: `profileRuleErrors(rules, request) → Map<path, message>`, pure.
- The value checked is read from the request `buildCreateRequest` builds for the current form
  values, with the page's editability — not from the raw form. So a stripped field, a coordinate
  of another type, or a version format left on "same as" all read as `""`, exactly as the
  registry sees them.
- The reader covers the registry's path list (Context); a rule on any other path is skipped.
- A second table maps each path to the wizard field that shows its message: `name`,
  `displayName`, `clientCode`, `ownership.0.groupId`, `buildTasks`, `vcsUrl`, `vcsBranch`,
  `vcsTag`, `jiraProjectKey`, `versionPrefix`, the version-format fields, and
  `coordinate.groupPattern` / `artifactPattern` / `imageName` / `flavor` / `packageName`.
- Whole-value match: the pattern is compiled as `^(?:<pattern>)$`, matching Java's `matches()`.
- A pattern `new RegExp` cannot compile is skipped. Compiled patterns are cached per rule list.
- An absent value is matched as `""`, so the pattern decides whether it may stay empty, as in
  the registry.
- `makeCreateSchema` takes the selected profile's rules instead of the profile enum and
  `solutionPatterns`, and builds the request itself with `buildCreateRequest(values, source,
  editable)` — the escrow arguments it leaves at their defaults touch no rule path. Its
  `superRefine` adds one issue per failing rule on the mapped field, so the stepper marks the
  right step without new routing. (changed during implementation: no `requestFor` parameter)
- `componentKeyError` keeps only the charset check; the profile rule on `name` is added after
  it, so a key shows one message at a time, charset first.

### 4. Clone pre-selection

- First usable profile whose classification matches the source (`solution` and `external`
  equal; `explicit` equal or `ask`) and whose `name` rules pass on the source key.
- Otherwise the first usable profile whose classification matches.
- Otherwise none is pre-selected: the clone opens on the Profile step instead of General, and
  the Profile gate that today applies to scratch only (`!isClone && profile === null`) applies to
  a clone too.
- The explicit answer is seeded from the source's `distributionExplicit`.
- Picking another profile resets the key, as today.

### 5. Loading, empty and unusable

- The profiles join `CreateComponentPage`'s `ready` gate (Decision 7): while they load, the page
  shows its existing skeleton and the wizard is not mounted.
- Error, or no `regular` profile: the page shows an inline error with Retry instead of the
  wizard, as it does today when a clone's source fails to load. Retry refetches; on success the
  wizard mounts with the profiles. Clone behaves the same — it needs a profile to send.
- The wizard therefore always mounts with a non-empty profile list.
- A profile the registry marks `usable: false` renders as a disabled radio with
  `unusableReason` below the description; arrow-key navigation skips it.
- Scratch pre-selects the first usable profile; none usable → nothing selected and the step's
  gate blocks Create.

### 6. Submit

- The request gains `profile: <selected id>`; `solution` keeps today's editable-only overlay,
  now from the profile's classification.
- A 400 whose field is `profile` routes to the Profile step with its message.
- A 400 whose field is a rule path (`baseConfiguration.jira.projectKey`, …) is mapped through
  the path → field table (Decision 3) to its field and step. Without it, `stepOfField` would read
  the head `baseConfiguration` and send every such error to General.

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

- Labels: `ChipsInput` in General → Classification, options from `useLabels()`, no free-text
  entries; gated on field-config `component.labels`.
- Build tasks: an `Input` on Build, gated on `build.buildTasks`; trimmed, omitted when blank.
- Both added to `CreateFormValues`, `initialValues` (clone seeds from the source) and
  `buildCreateRequest`; the form value wins over the source's copy.
- Review lists both under their steps' groups.

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
- `crs.version` is bumped to the first registry release with profiles in the same commit.

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
  must change the other. Accepted until the editor moves to profile rules; recorded as tech
  debt.
