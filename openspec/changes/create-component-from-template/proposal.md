## Why

- Registering a standard component — the same shape for every client, only a few values
  differ — goes through the full eight-step wizard today. The person doing it has to know which
  value goes into which of dozens of fields, and gets them wrong.
- The registry now keeps component templates next to the profiles: each template says which
  fields it fixes, which values it asks for, and which fields may be changed afterwards. It
  renders the component, checks it without saving (a dry run), and creates it.
- The Portal offers none of this: the profile listing already carries template entries, but the
  wizard drops every entry that is not a `regular` profile. Administrators have no way to see
  which templates are live, which failed to load and why, or what a template produces.

## What Changes

**Template tiles on the Profile step**
- Templates the registry lists appear as tiles beside the regular profiles, in the registry's
  order, with title, description, version and a "Template" marker.
- A template the registry marks as not usable is shown disabled with its reason, like a profile.
- Picking a template replaces the wizard's steps with two: **Parameters** → **Review & create**.
  Picking a regular profile again returns to today's steps.
- Templates are offered for a new component only; a clone keeps today's regular flow.

**Parameters**
- One input per parameter, in the template's order, chosen by type: text input for `text`, a
  dropdown for a single `select` or `crs-list`, chips for several values (multi `select`, the
  `labels` list), and the existing people picker for `person`.
- Defaults are pre-filled; a `person` default the registry resolved to the current user shows
  that user. Required parameters are marked; optional ones say so.
- Checked in the browser as the user types, from the definitions alone: required, number of
  values, maximum length, pattern with the template's message, option, maximum selection. Typing
  sends nothing to the registry.
- Next is disabled while a check fails. Next runs **one** dry run and opens Review with its
  result.

**Review & create**
- Shows every field of the rendered component, grouped as in today's Review.
- Shows every problem: the registry's (parameter problems, field rules, today's create rules) and
  the rules only the Portal enforces today, run on the rendered component. Each problem names the
  parameters its field came from and links back to them; a problem on a field the template fixes
  is shown as a template problem to report to an administrator.
- Fields the template marks overridable are editable, marked "changed from template" once
  edited, checked as the user types with the same rules, and re-checked by a new dry run when the
  user leaves the field — not on every keystroke.
- Asks for the Jira task key (required, as in the regular wizard) and a comment.
- Create is disabled while any problem stands. Create sends the same request with
  `dryRun=false`; a rejection keeps the user on Review with the problems shown.
- The registry reports only the first failure of today's create rules per run, so after a fix the
  dry run runs again and may show the next one.

**Templates tab for administrators**
- Admin settings gains a **Templates** tab, under the same `IMPORT_DATA` gate as the page.
- Lists every profile and template with kind, version and status (live or failed), each failed
  entry's problems, the result of the last configuration load, and the configuration version.
- Says where templates live and how they change: a reviewed change to service-config, then a
  reload.
- A template's details: its parameters with their settings, its classification, its overridable
  fields, and its configuration text with a copy button.
- **Try it**: the same parameter form, a dry run, and the same Review rendering without a Create
  button. Nothing is created. The field-to-parameter mapping is shown from the dry run's sources.

**One set of Portal-only create rules**
- The rules only the Portal enforces today (Jira project key and full version format required; VCS
  path, branch and tag unless the build system needs no VCS; `ssh://` VCS URL on the ecosystem
  Bitbucket host; supported group-ID prefix; complete distribution coordinate for an explicit
  external component) move out of the wizard's form schema into one function over the create
  request. The regular wizard and template review both call it, so they cannot drift.
- The regular wizard's behaviour and messages do not change.

### A note on the registry dependency

- The registry change adding templates (`add-component-templates`) must merge and be released
  first. Until then this change vendors the registry's v4 contract from that change's branch.
- This change stacks on `load-create-profiles-from-registry`, which reads the profile listing and
  must merge first.
- The registry's admin read exposes a template's field mapping only inside its configuration
  text, not as structured data. The details view therefore shows the configuration text and takes
  the field-to-parameter mapping from Try it, instead of a separate mapping table.

## Affected areas

- `frontend/src/pages/CreateComponentPage.tsx` — template tiles, the two-step template path.
- New: `hooks/useComponentTemplate.ts` (one template's parameters), `hooks/useTemplateRun.ts`
  (dry run and create), `lib/component/templateParameters.ts` (the local parameter checks),
  `lib/component/portalCreateRules.ts` (the Portal-only rules over a create request),
  `components/template/` (parameter form, template review), `components/admin/TemplatesPanel.tsx`.
- `lib/component/createFormModel.ts` — `makeCreateSchema` calls `portalCreateRules` instead of
  holding the rules inline.
- `hooks/useComponentProfiles.ts` — keeps template entries for the Profile step.
- `pages/AdminSettingsPage.tsx` — the Templates tab.
- `frontend/src/lib/api/v4.json` + `schema.d.ts` — re-vendored from the registry.
- `gradle.properties` (`crs.version`), the e2e Testcontainers driver and `infra/dev` profiles
  fixture — a starter template, once the registry is released.
- Docs: `docs/features/create-component.md`, new `docs/features/admin-templates.md`, `AGENTS.md`.
- No BFF code change: `/rest/**` is proxied as today.

## Out of scope

- **Delivery & Support restrictions** — D&S may create only from templates and may not override.
  The registry decides both; the Portal shows its answer (`usable` on the tile, a 403 on an
  override). Until the role mapping exists every user who may create may also override.
- **Editing templates in the Portal** — templates are reviewed configuration in service-config.
- **Linking a component to the template it came from** — the registry keeps no such link.
- **Templates for a clone** — a clone copies an existing component; a template builds a new one.
- **Moving the Portal-only rules into the registry** — they stay in the Portal; the registry
  does not apply them to API creates, as today.
- **A structured field-mapping table** — the registry does not expose one; see the note above.

## Rollout note

- Deploy order: registry with templates → this Portal version. Without templates in service-config
  the Profile step shows regular profiles only, as before.
- A Portal from this change against a registry without the template endpoints still works for
  regular profiles; picking a template tile cannot happen, because that registry lists none.
