## Context

- The Profile step (`load-create-profiles-from-registry`) reads `GET /component-profiles`. Each
  entry has `kind` `regular` or `template`; `useComponentProfiles` drops every `template` entry.
- The registry's template API:
  - `GET /component-templates/{id}` — the template's parameters, classification and overridable
    paths. A `person` default of `current-user` arrives already resolved to the caller's login.
  - `POST /component-templates/{id}/components?dryRun=true|false`, body
    `{parameters: {NAME: string[]}, overrides: {path: string[]}, jiraTaskKey?, changeComment?}`:
    - dry run → 200 `TemplateRunResponse` whether valid or not;
    - create → 201 `ComponentDetailResponse`, or 422 `TemplateRunResponse` when any problem
      stands;
    - 400 for a malformed Jira task key or an override on a path that is not overridable, 403
      when the user may not use the template or override, 404 when the template is not live —
      each an `ErrorResponse {errorMessage}`.
  - `TemplateRunResponse`: `valid`, `parameterProblems[{parameter, check, message}]`, and — only
    when every parameter check passed — `component` (a create request), `sources {path: [NAME]}`,
    `overridden [path]`, `problems[{fields, parameters, templateProblem, message}]`.
  - `GET /admin/component-profiles` (`IMPORT_DATA`) — every entry, live or failed, with its
    problems, configuration text, and for a live template the same description as above; plus
    the last load's result and the configuration version.
- The Portal-only create rules live inline in `makeCreateSchema`'s `superRefine`
  (`createFormModel.ts`), written against the wizard's form values, not against a request.
- Today's Review renders from form values (`SummaryDiff`, `CreateMirrorField`).

## Worked example

Template `client-plugin`, parameters `CLIENT_CODE` (select), `PLUGIN_CODE` (text,
`^[A-Z][A-Z0-9]{2,15}$`), `PLUGIN_NAME` (text), `COMPONENT_OWNER` (person, default the user).
Overridable: `baseConfiguration.vcsEntries[0].vcsPath`, `baseConfiguration.jira.projectKey`.

1. The user picks the tile; the wizard loads the template and shows four inputs, owner pre-set.
2. They type `pay` into Plugin code → "3–16 uppercase letters or digits…" under the input, from
   the template's message. Next stays disabled. No request is sent.
3. They type `PAY`; every local check passes; Next runs the dry run.
4. The response is valid except one problem from today's create:
   `{fields: [name], parameters: [CLIENT_CODE, PLUGIN_CODE], templateProblem: false,
   message: "name: component abc-plugin-pay already exists"}`. Review shows it on Component key,
   naming Client code and Plugin code, each a link back to Parameters. Create is disabled.
5. The Portal-only rules run on `component`: the VCS path is an `ssh://` URL on the ecosystem
   host, so nothing is added.
6. They go back, change the code to `PAY2`, Next → a new dry run → no problems → Create enabled.
7. They edit the overridable VCS path to an `https://` URL. As they type, the Portal-only rule
   shows "VCS Path must be an ssh:// URL" under it; the field is marked "changed from template".
   Leaving the field runs a dry run with the override; the Portal rule still fails, now on an
   overridden field, so it names no parameter and is not a template problem.
8. They fix the URL, leave the field → dry run → no problems. They enter `CD-1234`, press Create →
   201 → the success panel links to the new component.

## Goals / Non-Goals

**Goals:**
- A template component can be created in the Portal in two steps, with every check the registry
  and the Portal apply to a regular create.
- No request to the registry while the user types.
- One implementation of the Portal-only rules for both paths.
- Administrators can see what is live, what failed and why, and try a template safely.

**Non-Goals:**
- Deciding who may use or override a template — the registry does; the Portal shows its answer.
- Editing templates, or showing a field-mapping table the registry does not expose.
- Changing the regular wizard's behaviour.

## Decisions

### 1. The template path lives in the existing wizard, with its own steps

- Picking a template tile switches the wizard's step list from `SCRATCH_STEPS` to
  `['profile', 'parameters', 'review']`; picking a regular tile switches back. The regular form's
  state is kept while a template is chosen, so switching back loses nothing.
- The template path has its own state (parameter values, overrides, the last run); it does not
  use the regular wizard's form or schema.
- Why: the Profile step, the dialog, the success panel and the "create another" action are
  shared; a separate route would duplicate them.

### 2. Local parameter checks mirror P2–P6 and P9

- `lib/component/templateParameters.ts` is a pure function from parameter definitions and values
  to `{NAME: message}`: required (P2), number of values (P3), maximum length (P4), pattern with
  the template's message (P5), option (P6), maximum selection (P9).
- Values are taken as the registry takes them: blanks dropped, a value given twice counts once,
  an empty parameter takes its default.
- P1 (unknown parameter), P7 (list value) and P8 (active employee) are not checked locally: the
  form cannot produce P1, and the pickers offer only current list values and employees. The dry
  run reports them if they still fail.
- A pattern the browser cannot compile is skipped; the dry run decides.

### 3. When the dry run runs

- On Next from Parameters, when the user leaves an edited overridable field, and on Try it.
- A dry run sends the parameter values and overrides only. The registry validates the Jira task
  key's format before anything else, so sending a half-typed key would fail every run with a 400.
- Changing a parameter discards the last run; Review is reached only through Next.
- Never on a keystroke. Each run replaces the shown result; a response that arrives after a newer
  run started is discarded.
- While a run is in flight, Create is disabled and Review shows that checks are running.

### 4. Portal-only rules as one function over the create request

- `lib/component/portalCreateRules.ts`:
  `portalCreateRules(request, {supportedGroups, gitBaseUrl, editable}) → [{path, message}]`, with
  `path` a create-request path (`baseConfiguration.vcsEntries[0].vcsPath`).
- The regular wizard calls it on the request it would send and maps each path to its form field
  with the existing `formFieldOfRule`, as it already does for profile rules. Messages and the
  fields they appear on stay exactly as today; the existing wizard tests are the guard.
- The wizard already requires the Jira project key and full version format at field level in its
  Zod object; it skips those two rules from the function so a blank field shows one message, not
  two.
- The wizard also passes the coordinate type the user chose: it sends no Docker image while the
  name is blank, so the request alone cannot tell "Docker, name missing" from "no coordinate".
- The wizard passes its own explicit-external flag too: a request omits the distribution flags
  field-config locks, but the component is still created with them, so its required fields stay
  required. Template review reads the flags from the rendered request. (added on review)
- Template review calls it on the dry run's `component` with every field editable — the template,
  not field-config, decides what is set.
- Why one function: the rule set and its messages must be the same on both paths, and a request
  path is what the dry run's `sources` are keyed by.

### 5. How a problem is attributed

- A registry problem carries its own `fields`, `parameters` and `templateProblem`.
- A Portal problem on path `p` takes `sources[p]` as its parameters. It is a template problem when
  `sources[p]` is empty and `p` is not in `overridden`.
- A field-prefixed message (`name: …`) is shown on that field; others at the top of Review.
- Every parameter named is a link that returns to Parameters with that input focused.
- A template problem says to report the template to an administrator, and names the template id
  and version.

### 6. Editing overridable fields

- Each overridable path gets the input its field kind takes (the kinds in the registry's
  configuration reference): free text → text input; CRS value → dropdown of that list; person →
  people picker; people list → people list picker; labels → chips; a produced artifact's mode →
  the ownership-mode dropdown, its artifacts → artifact chips. An unknown path gets a text input.
- A produced artifact shows as one summary line, unless one of its fields is overridable or has a
  problem: then its group ID, mode and artifacts each get a row with the raw value.
- A picker has no typing to wait out: the edit and its dry run go together, with the new value.
  (added on review)
- An override is sent as `string[]`, as the registry takes it. Clearing an edit removes the
  override, and the field shows the template's value again.
- While typing, the field is checked by `portalCreateRules` and the profile-rule checker on the
  request with the edit applied, so the user sees a Portal rule failure before leaving the field.
  The template's field rules come from its entry in the profile listing; the template description
  carries none.

### 7. Create and its failures

- Create sends the same body with `dryRun=false`, plus the Jira task key and comment.
- The Jira task key is required by the Portal, with the regular wizard's validation and message.
- 201 → the existing success panel. 422 → the body replaces the shown run, the user stays on Review;
  when it carries parameter problems (the registry stopped before rendering), the wizard returns to
  Parameters with them, as after a dry run.
- 404, from a create or from any dry run → the template was removed or failed on a reload; the
  wizard returns to the Profile step
  with that message and stops offering that template. It keeps the listing it opened with rather
  than refetching it, which would reset a form in progress.
- 403 and 400 → the message at the top of Review; nothing else changes.

### 8. Administrators' Templates tab

- `components/admin/TemplatesPanel.tsx`, a tab of Admin settings, reading
  `GET /admin/component-profiles` each time the tab opens.
- The list: id, kind, status, and title and version for a live entry; failed entries expand to their problems and their
  configuration text — the registry returns it for every entry, live or failed. Above it:
  the last load's status and problems, the configuration version, and how templates change.
- Details of a live template: parameters with settings, classification, overridable paths, the
  configuration text in the existing `CodeBlock` with copy.
- Try it reuses the parameter form and the review component in a read-only mode: no Jira task
  key, no Create, overridable fields not editable.

## Out of Scope

- A structured field-mapping table — the admin read carries the mapping only inside the
  configuration text; parsing YAML in the browser for it is not worth a new dependency while Try
  it shows each field's source parameters.
- Hiding overrides from D&S — the registry has no role mapping yet; until then everyone who may
  create may override, and a 403 from the registry is shown if that changes.

## Risks / Trade-offs

- **One create failure per run** — the registry stops at today's create's first failure, so a
  component with several such problems takes several fix-and-retry rounds. Accepted: the
  registry records it as tech debt; the Portal says that more problems may follow.
- **Moving the Portal-only rules** — the regular wizard's validation is rewired. Mitigated by
  keeping messages and fields identical and running the full existing wizard suite unchanged.
- **Template removed between runs** — a reload may withdraw a template mid-flow; handled by the
  404 path in Decision 7.
- **Review grouping from a request** — Review renders from the rendered create request, not from
  form values, so the grouping is rebuilt for request paths; a path the grouping does not know is
  listed under "Other fields" rather than dropped.
