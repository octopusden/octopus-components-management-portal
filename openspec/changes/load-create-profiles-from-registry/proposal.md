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
- When the profiles cannot be loaded, or none is returned, the wizard shows an error with a
  retry and offers no way to create.
- Scratch pre-selects the first usable profile. A clone pre-selects the first usable profile
  whose classification matches the source and whose rules the source's key passes.

**Classification from the profile**
- The profile's classification sets solution, external and explicit distribution.
- "Has explicit distribution?" is asked only when the profile's explicit value is `ask`.

**The profile's field rules as fast checks**
- While the user types, every field rule of the chosen profile is checked against the matching
  wizard field, as a whole-value match, and the rule's message is shown under that field.
- A rule on a field the wizard does not have, or whose pattern the browser cannot compile, is
  skipped; the registry's answer on create decides.
- The key's character check (`component-key-format`) runs first and is unchanged.
- The Portal's own solution-key check on create is removed. The `solution-key-patterns` setting
  stays: the component editor still uses it to offer the Solution toggle.

**Create names the profile**
- Create sends the chosen profile's id with today's create request.
- A rejection that names `profile` is shown on the Profile step; a rule rejection is shown under
  the field it names, as other field errors are today.

**Labels and build tasks**
- General gains a Labels field (chips, picked from the registry's labels list only).
- Build gains a Build tasks field.
- Both appear on Review and are sent with the create; left empty, the request is as today.
- Each follows its field-config visibility, like the other wizard fields.

### A note on the registry dependency

- The registry change that adds the profile listing and the `profile` field must merge and be
  released first. A registry version with profiles does not start without them.
- This change re-vendors the registry's v4 contract and bumps `crs.version` to that release; the
  end-to-end and local-dev registry containers get a profile set so they keep starting.

## Affected areas

- `frontend/src/pages/CreateComponentPage.tsx` — Profile step, clone pre-selection, submit,
  error routing, the two new fields.
- `frontend/src/lib/component/createFormModel.ts` — the built-in profile list, the flags
  function and the solution-key part of the key check are replaced by profile-driven logic.
- New: a profiles hook over `GET /rest/api/4/component-profiles`, and a pure field-rule checker.
- `frontend/src/lib/api/v4.json` + `schema.d.ts` — re-vendored from the registry.
- `gradle.properties` (`crs.version`), the e2e Testcontainers driver and `infra/dev` compose —
  give the registry container a profile set.
- **Behavior change for users:** the start page shows whatever the registry is configured with;
  the key rule messages are the registry's, not the Portal's.
- No BFF code change: `/rest/**` is proxied as today.

## Out of scope

- **Template tiles and the template flow** — a separate change; this one shows `regular`
  profiles only.
- **Delivery & Support restriction** — the registry decides which profiles a user may use; the
  Portal only shows its answer.
- **The component editor** — renames and the Solution toggle keep today's behavior, still driven
  by `portal.component.solution-key-patterns`; the registry does not check renames against
  profile rules either.
- **The other Portal-only create rules** (Jira key and version format, VCS path, branch and tag,
  `ssh://` host, group-ID prefix, complete coordinate) — stay in the Portal, unchanged.
- **Removing `portal.component.solution-key-patterns`** — still needed by the editor.

## Rollout note

- Deploy order: service-config profiles → registry with profiles → this Portal version.
- A Portal from this change against a registry without the profile listing shows the "profiles
  could not be loaded" error and cannot create components; do not deploy it ahead of the
  registry.
