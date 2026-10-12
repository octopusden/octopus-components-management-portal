## Why

- The first step of Create component offers four profiles built into the Portal (Regular
  external, Regular internal, Solution, DMP Bundle). Adding, renaming or reordering one needs a
  Portal release.
- The Solution and DMP Bundle key rules live in the Portal's own setting
  (`portal.component.solution-key-patterns`), so the Portal and the registry can disagree about
  which key a profile accepts.
- The registry now owns the profile list and each profile's field rules, and checks a create
  that names its profile. The Portal has to show that list, check the same rules while the user
  types, and name the profile on create.
- Labels and build tasks can only be set after a component exists, in the editor, though the
  create request already accepts both.

## What Changes

**Profiles from the registry**
- The Profile step shows one tile per profile the registry returns, in the registry's order,
  with its title and description. The built-in list is removed.
- A profile the registry marks as not usable for the current user is shown disabled, with the
  registry's reason, and cannot be picked.
- Only profiles of kind `regular` are shown; other kinds are not offered yet.
- While the profiles load, the wizard waits, as it already waits for the component defaults.
  When they cannot be loaded, it shows an error with a retry instead of the steps, and nothing
  can be created. It opens on a listing fetched for this opening, never a cached one, and keeps
  it while open.
- When the registry has no `regular` profile (it starts with none when service-config carries no
  profiles), the Profile step says so and offers the classification directly: External or
  Internal, "Has explicit distribution?", and Solution for an explicit external component. No
  profile is sent and no field rules apply — the create is checked as today.
- Scratch pre-selects the first usable profile. A clone pre-selects the first usable profile
  whose classification matches the source and whose rules the source's key passes; failing that,
  the first usable one whose classification matches; when no usable profile's classification
  matches, the clone sets its classification directly, as when the registry has no profiles, starting from the
  source's, and sends no profile.

**Classification from the profile**
- The profile's classification sets solution, external and explicit distribution.
- "Has explicit distribution?" is asked only when the profile's explicit value is `ask`.

**Today's pre-filled values are kept**
- The wizard still pre-fills exactly what it does today, from the same sources: the registry's
  component defaults (build system, display name, Jira project key and version formats, escrow
  generation, VCS tag and branch, copyright for an explicit external component), the Portal's
  fallbacks (full version format, VCS branch), the current user as owner, and the version prefix
  following the key. A clone still copies the source.
- The only change: the explicit and external flags those defaults depend on come from the
  pre-selected registry profile instead of the built-in one. With the shipped profiles the first
  one is Regular external, so a new component starts exactly as today.

**The profile's field rules as fast checks**
- While the user types, every field rule of the chosen profile is checked, as a whole-value
  match, against the value the create request would carry for that path (so a field the request
  leaves out counts as empty, as in the registry; hidden build tasks are the one exception, see
  the design's Risks), and the rule's message is shown under the wizard field for that path, or
  at the top of the step when that field shows no error there.
- A rule on a path the wizard does not know, or whose pattern the browser cannot compile, is
  skipped; the registry's answer on create decides.
- A changed rule takes effect the next time the wizard opens after the registry reloads its
  configuration, with no Portal change.
- The key's character check (`component-key-format`) runs first and is unchanged.
- The wizard's own solution-key check is removed: the hard-coded "a Solution key contains
  `-solution`, a regular key contains neither" rule fed by `portal.component.solution-key-patterns`.
  The profile rules replace it.
- The setting itself stays, for one other reader: the component editor shows its Solution toggle
  only for a key containing one of those patterns. The wizard stops reading it.

**Create names the profile**
- Create sends the chosen profile's id with today's create request.
- A rejection that names `profile` is shown on the Profile step. A rule rejection names the full
  create-request path (`baseConfiguration.jira.projectKey: …`); it is shown under the wizard field
  for that path, on its step.

**Labels and build tasks**
- General → Classification gains a Labels field (chips, picked from the registry's labels list
  only).
- Build gains a Build tasks field.
- Both appear on Review and are sent with the create; left empty, the request is as today.
- Both follow their field-config visibility (`component.labels`, `build.buildTasks`): editable,
  shown disabled when readonly (a clone keeps the source's value), absent and not sent when
  hidden.

### A note on the registry dependency

- The registry change that adds the profile listing and the `profile` field must merge and be
  released first. Without profiles in service-config that registry starts with none, and the
  Portal falls back to choosing the classification directly.
- This change re-vendors the registry's v4 contract — from the registry change's branch until it
  merges, then from `main` — and bumps `crs.version` to the first release carrying it. The
  end-to-end and local-dev registry containers get the shipped profile set, so the profile path
  is the one they exercise.

## Affected areas

- `frontend/src/pages/CreateComponentPage.tsx` — Profile step, clone pre-selection, submit,
  error routing, the two new fields.
- `frontend/src/lib/component/createFormModel.ts` — the built-in profile list, the flags
  function and the solution-key part of the key check are removed; the schema checks the
  profile's rules and `initialValues` takes the pre-selected profile.
- New: `hooks/useComponentProfiles.ts` (the listing), `lib/component/createProfile.ts`
  (classification, pre-selection, the no-profiles flags) and `lib/component/profileRules.ts`
  (the field-rule checker and the rule-error parser).
- `lib/component/buildCreateRequest.ts` (labels, build tasks), `hooks/useFieldConfig.ts`
  (`useFieldVisibility`), `lib/types.ts` (`profile` on the create request).
- `frontend/src/lib/api/v4.json` + `schema.d.ts` — re-vendored from the registry.
- `gradle.properties` (`crs.version`, once the registry is released), the e2e Testcontainers
  driver, `infra/dev` compose and the profiles fixture — give the registry container a profile
  set; the route-mocked wizard e2e mocks the listing.
- Docs: `docs/features/create-component.md`, TD-006, `AGENTS.md`, `README.md`.
- **Behavior change for users:** the start page shows whatever the registry is configured with;
  the key rule messages are the registry's, not the Portal's.
- No BFF code change: `/rest/**` is proxied as today.

## Out of scope

- **Template tiles and the template flow** — a separate change; this one shows `regular`
  profiles only.
- **Delivery & Support restriction** — the registry decides which profiles a user may use; the
  Portal only shows its answer.
- **The component editor** — nothing in the editor changes:
  - a rename is checked as today (the key's character rule only); no profile rule applies,
    because a component does not remember the profile it was created with, and the registry does
    not check renames against profile rules either;
  - the Solution toggle is still offered only for a key containing one of
    `portal.component.solution-key-patterns`, and setting it is checked by the registry as today.
- **The other Portal-only create rules** (Jira key and version format, VCS path, branch and tag,
  `ssh://` host, group-ID prefix, complete coordinate) — stay in the Portal, unchanged.
- **Removing `portal.component.solution-key-patterns`** — still needed by the editor.

## Rollout note

- Deploy order: registry with profiles → this Portal version. The service-config profiles may come
  before or after; until they are reloaded the Portal offers the classification step.
- A Portal from this change against a registry without the profile listing shows the "profiles
  could not be loaded" error and cannot create components; do not deploy it ahead of the
  registry.
