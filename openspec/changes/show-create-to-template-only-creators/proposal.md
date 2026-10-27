## Why

- The registry gains a second create permission, `CREATE_FROM_TEMPLATE`: its holders create
  components only from a template, and change nothing the template fills in. They will not hold
  `CREATE_COMPONENTS`.
- The Portal shows its create entries — **New Component** on the component list and in the
  command palette — only to `CREATE_COMPONENTS` holders. A template-only creator never reaches the
  Profile step, so the permission is useless to them in the Portal.
- On Review, overridable fields are editable for anyone who reaches the step. A template-only
  creator who edits one gets a 403 from the registry only after the dry run.

## What Changes

**New Component for either create permission**
- The **New Component** button on the component list and the **New Component** action in the
  command palette show for a user holding `CREATE_COMPONENTS` **or** `CREATE_FROM_TEMPLATE`.
- The Profile step is unchanged: the registry marks regular profiles not usable for a
  template-only creator, with its reason; the Portal shows that reason on the disabled tile, as it
  does for any unusable profile. Templates stay selectable.

**Copy stays with `CREATE_COMPONENTS`**
- **Copy** on a component list row and **Clone** on the component page still require
  `CREATE_COMPONENTS`. A copy opens the regular wizard, which a template-only creator may not use.

**Review: overridable fields read-only without `CREATE_COMPONENTS`**
- A user without `CREATE_COMPONENTS` sees every field on Review read-only, overridable or not, and
  so sends no overrides.
- When the template has overridable fields, Review says once, above the fields: "Values come from
  the template and cannot be changed." — so read-only fields do not look like a fault.
- Jira task key, comment and Create work as for any user.

**Deliberately unchanged**
- `/components/new` keeps no route guard. A user who opens it by URL without either permission
  sees every tile disabled with the registry's reason and cannot create; a template-only creator
  who opens a copy link sees the clone with every profile disabled. The registry refuses both
  anyway.
- The reason on a disabled tile is the registry's text, shown as is; the Portal holds no copy of
  it.

### A note on the registry dependency

- The registry change adding `CREATE_FROM_TEMPLATE` (`add-template-only-creators`) defines the
  permission and the reason text. This change only reads the permission name from `/auth/me`, so
  it may merge before or after the registry change; nothing changes until a user holds the
  permission.
- This change stacks on `create-component-from-template`, which adds template tiles and the
  template Review; that change must merge first.

## Affected areas

- `frontend/src/lib/auth.ts` — the `CREATE_FROM_TEMPLATE` permission name, and one check for
  "may start a create" (either create permission).
- `frontend/src/pages/ComponentListPage.tsx`, `frontend/src/components/CommandPalette.tsx` — the
  New Component gate.
- `frontend/src/components/template/TemplateWizard.tsx` — Review read-only and the note for a
  user without `CREATE_COMPONENTS`; `CreateComponentPage.tsx` tells it whether the user may
  override.
- Copy and Clone gates (`ComponentListPage.tsx`, `ComponentDetailPage.tsx`) — unchanged, newly
  covered by tests for a template-only creator.
- Docs: `docs/features/create-component.md` (who sees New Component, Copy, overrides).
- No BFF change, no contract change, no re-vendoring.
- **Behavior change, only once a user holds `CREATE_FROM_TEMPLATE` without `CREATE_COMPONENTS`:**
  they see New Component, and see Review read-only. Nothing changes for any other user.

## Out of scope

- **Keycloak** — the realm role, AD group mappings and default role are realm configuration,
  released after this change.
- **A route guard on `/components/new`** — the registry already refuses a create the user may not
  make; the disabled tiles explain why.
- **A registry with no regular profile** — the Profile step then offers manual classification,
  and a template-only creator can fill the regular wizard only to get 403 on Create. The
  registry refuses that create anyway, and it needs a registry configured without regular
  profiles.
- **Hiding regular profile tiles** — the registry decides who may use a profile and says why; the
  Portal shows its answer, as for any unusable profile.
- **Editing components** — who may edit is the registry's `canEdit`, unchanged.
- **The administrators' Try it** — it is read-only for everyone already.
- **An e2e user holding only `CREATE_FROM_TEMPLATE`** — the e2e realm has no such user; unit and
  page tests cover each gate.

## Rollout note

- Safe to deploy everywhere at once: until the realm grants `CREATE_FROM_TEMPLATE`, every user
  sees what they see today.
- Must be deployed before the realm change gives the new role; otherwise those users see no way
  to create in the Portal.
