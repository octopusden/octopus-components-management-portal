# Create component

The wizard at `/components/new` (scratch) and `/components/new?from={id}` (clone). Spec:
[`openspec/specs/create-component-wizard`](../../openspec/specs/) once archived; the key's character
rule is [`component-key-format`](../../openspec/specs/component-key-format/spec.md).

## Profile step

- Tiles are the registry's `regular` profiles and, for a new component, its templates
  (`GET /rest/api/4/component-profiles`), in its order, with its titles and descriptions. A template
  tile is marked "Template" and shows its version. Administrators change them in service-config and
  reload the registry; the Portal has no profile list of its own. A clone is offered no templates.
- A profile the registry marks unusable is disabled with the registry's reason.
- While the profiles load the page shows a skeleton; when they cannot be loaded it shows an error
  with Retry instead of the wizard. The wizard opens on a freshly fetched list and keeps it while
  open, so a later failed refetch does not close it.
- When the registry has no `regular` profile (none configured in service-config), the step says so
  and offers the template tiles, if any, beside External / Internal, "Has explicit distribution?"
  and Solution (explicit external only). The create then names no profile and no field rules apply
  — unless a profile has the chosen classification: its tile is then shown and selected, and the
  create uses it.
- Picking a template replaces the steps with Parameters and Review & create (see "From a
  template"); picking a regular profile again returns to the regular steps with what was typed.
- Scratch pre-selects the first usable regular profile; a template is never pre-selected. A clone
  pre-selects the first usable profile whose
  classification matches the source and whose key rule the source's key passes, else the first
  usable one whose classification matches; when no profile has the classification it sets it
  directly, starting from the source's, and names no profile; when only profiles the user may not
  use have it, it opens on the Profile step and cannot be created.
- The profile sets solution, external and explicit distribution; "Has explicit distribution?" is
  asked only when the profile's explicit value is `ask`.
- When the classification stops being explicit external, a copyright the user has not changed
  (the default, or a clone's copied one) is cleared.

## Checks and create

- The chosen profile's field rules are checked while typing, against the request the wizard would
  send, and shown under the matching field. A rule the browser cannot compile, or on a path the
  wizard does not know, is left to the registry.
- A rule failing on a field the step shows no error for is listed at the top of that step.
- Create sends the profile id. A rejection on `profile` opens the Profile step; a rule rejection on
  a create-request path (e.g. `baseConfiguration.jira.projectKey`) opens that field's step, which
  shows the message at its top.
- Create stays disabled while field settings load or when they fail to load; Review says why.
- The editor's Solution toggle does not use the profile rules yet
  ([TD-006](../tech-debt/TD-006-solution-key-patterns-second-source.md)).

- The rules only the Portal enforces (Jira project key and full version format required; VCS path,
  branch and tag unless the build system needs none; `ssh://` VCS URL on the ecosystem Bitbucket
  host; supported group-ID prefix; complete coordinate for an explicit external component) are one
  function over the create request (`lib/component/portalCreateRules.ts`), shared with template
  review.

## From a template

- **Parameters**: one input per parameter, chosen by type — text input, dropdown, chips (several
  values, the `labels` list), people picker. Defaults are pre-filled; a person default arrives as
  the current user. Required, number of values, maximum length, pattern, option and maximum
  selection are checked as the user types, and nothing is sent to the registry.
- **Next** runs one dry run (`POST /component-templates/{id}/components?dryRun=true`) with the
  values and overrides only — never the Jira task key, whose format the registry checks first. A
  parameter problem keeps the user on Parameters; otherwise Review opens.
- **Review & create** shows the rendered component grouped as on the regular Review, with every
  problem: the registry's and the Portal-only rules' on the rendered component. A problem names
  the parameters its field came from, each a link back; one on a field the template fixes is a
  template problem to report to an administrator. The registry reports its create rules one
  problem at a time, so a fix can reveal the next.
- Fields the template marks overridable can be edited, are checked while typing, and run a new dry
  run when the user leaves them. Everyone who may create may override until the registry restricts
  it.
- Changing a parameter discards the shown run; Review is reached only through Next.
- **Create** sends the same body with `dryRun=false`, the Jira task key (required) and the comment.
  A 422 keeps the user on Review with the returned problems; a 404 (the template was withdrawn by a
  reload) returns to the Profile step without that template.

## Fields added at create

- **Labels** (General → Classification): picked from the registry's labels list.
- **Build Tasks** (Build): blank is not sent; offered and sent only when `build.buildTasks` is
  editable for the user (the registry rejects build tasks the user may not edit).
- Labels follow `component.labels`: readonly shows them disabled and a clone keeps the source's;
  hidden removes the field and sends none.
- A clone starts with the source's labels, and with its build tasks when the user may edit them.
