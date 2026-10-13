# Create component

The wizard at `/components/new` (scratch) and `/components/new?from={id}` (clone). Spec:
[`openspec/specs/create-component-wizard`](../../openspec/specs/) once archived; the key's character
rule is [`component-key-format`](../../openspec/specs/component-key-format/spec.md).

## Profile step

- Tiles are the registry's `regular` profiles (`GET /rest/api/4/component-profiles`), in its order,
  with its titles and descriptions. Administrators change them in service-config and reload the
  registry; the Portal has no profile list of its own.
- A profile the registry marks unusable is disabled with the registry's reason.
- While the profiles load the page shows a skeleton; when they cannot be loaded it shows an error
  with Retry instead of the wizard. The wizard opens on a freshly fetched list and keeps it while
  open, so a later failed refetch does not close it.
- When the registry has no `regular` profile (none configured in service-config), the step says so
  and offers External / Internal, "Has explicit distribution?" and Solution (explicit external
  only). The create then names no profile and no field rules apply.
- Scratch pre-selects the first usable profile. A clone pre-selects the first usable profile whose
  classification matches the source and whose key rule the source's key passes, else the first
  usable one whose classification matches; when no profile has the classification it sets it
  directly, starting from the source's, and names no profile; when only profiles the user may not
  use have it, it opens on the Profile step and cannot be created.
- The profile sets solution, external and explicit distribution; "Has explicit distribution?" is
  asked only when the profile's explicit value is `ask`.

## Checks and create

- The chosen profile's field rules are checked while typing, against the request the wizard would
  send, and shown under the matching field. A rule the browser cannot compile, or on a path the
  wizard does not know, is left to the registry.
- A rule failing on a field the step shows no error for is listed at the top of that step.
- Create sends the profile id. A rejection on `profile` opens the Profile step; a rule rejection on
  a create-request path (e.g. `baseConfiguration.jira.projectKey`) opens that field's step, which
  shows the message at its top.
- The editor's Solution toggle does not use the profile rules yet
  ([TD-006](../tech-debt/TD-006-solution-key-patterns-second-source.md)).

## Fields added at create

- **Labels** (General → Classification): picked from the registry's labels list.
- **Build Tasks** (Build): blank is not sent; offered and sent only when `build.buildTasks` is
  editable for the user (the registry rejects build tasks the user may not edit).
- Labels follow `component.labels`: readonly shows them disabled and a clone keeps the source's;
  hidden removes the field and sends none.
- A clone starts with the source's labels and build tasks.
