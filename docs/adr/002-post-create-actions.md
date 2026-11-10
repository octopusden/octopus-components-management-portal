# Portal ADR-002: The Portal runs the setup steps after a component is created

## Status

Proposed.

## Context

- Creating a component in the Portal registers it in CRS, and nothing else. The setup that
  follows is done by hand, by someone with rights in each system:
  - the Git repository the component's VCS path names, with its first content;
  - the TeamCity build chain (Compile, RC, checklist and Release configurations);
  - further steps later.
- Services for these steps exist or are proposed, each owning one system:
  - `octopus-teamcity-automation-service` creates a build chain
    (`POST /rest/api/1/build-chains`). It reads the component from CRS and shapes the chain from
    it; it also needs values CRS does not hold: the parent project id, the minor version to
    start from, and options (checklist, forced RC, Compile branch spec, a Deploy stage). It
    refuses to create a chain whose project already exists (409), with no override.
  - A repository onboarding service, proposed separately, creates a component's repository
    from its key (`POST /components/{componentId}/repository`) through `octopus-vcs-facade`. It
    reads the component from CRS and chooses the repository's first content itself.
- Templates make creation self-service. A template-only creator (`CREATE_FROM_TEMPLATE`)
  registers a standard component without knowing its details, and usually has no rights in
  TeamCity or the VCS. They gain the most from automated setup, and cannot do the manual
  setup themselves.
- The values a step needs are often the same for every component of a template: every
  component of one template gets its chain under the same kind of parent project, with the same
  options.
- A first approach put those values on the CRS template, as free-form `annotations` that CRS
  parses, stores and returns without reading them. It is not taken; see Alternatives, A.

## Decision

### 1. CRS does not know the steps

- CRS stays the system of record for the component, and only for it. No CRS configuration key,
  API field or code knows that a setup step exists.
- Template definitions stay in CRS, unchanged.

### 2. Register first, then each step by component key

- The Portal creates the component through the existing create or template create. A step runs
  only after CRS has committed, and a step failure never undoes the component.
- A step is asked for by the component key. The step's service reads the component from CRS
  itself, so it works from what CRS stored and nobody sends a value twice.
- The Portal sends, beside the key, only what a service cannot read from CRS: request options
  such as the TeamCity parent project (Decision 5).

### 3. The Portal only routes; each step's service decides its own access

- The Portal reaches each step service as it reaches CRS: a Spring Cloud Gateway route in its
  service-config (`spring.cloud.gateway.server.webflux.routes`), which forwards the browser's
  request unchanged. No Portal code builds or sends the call.
- The Portal's default `TokenRelay` filter applies to every route, so the call carries the
  user's token; a service without access checks ignores it.
- The Portal holds no credentials for any step service and makes no access decision. ADR-001 is
  unchanged: the Portal does not authorize.
- Each step service:
  - uses its own account towards its system (TeamCity, the VCS). The Portal and the browser
    never hold those credentials;
  - decides for itself whether to check the caller. The Portal relays the user's token either
    way, so a service can start checking it later without a Portal change;
  - never creates a target twice: an existing one is reported, by the repository service as
    done, by the build chain service as a 409. What a retry may do differs per step
    (Decision 4).
- `octopus-teamcity-automation-service` checks no caller, for now (an accepted risk; see
  Consequences). Anyone who can reach it can create a build chain, with its TeamCity account.
- A service that does check (e.g. the repository onboarding service) does so as CRS does: a
  Keycloak resource server checking a permission of its own, mapped from roles in its
  `octopus-security.roles`. Who may run that step is then a Keycloak role assignment, not a
  Portal setting.
- Each route forwards only the endpoints the step uses, under a fixed path of its own, rewritten
  to the service's paths, so it cannot clash with `/rest/**`, which stays CRS's (e.g.
  `POST /services/teamcity-automation/build-chains` → `POST /rest/api/1/build-chains`). The path
  is fixed in the SPA's code for that kind of step; the route's target URL is per environment.
- The paths join the JSON-401 paths in `SecurityConfig`, so only signed-in Portal users reach a
  route.

```yaml
# components-management-portal-cloud-<env>.yml. The list replaces the default one,
# so the existing CRS route stays in it.
spring:
  cloud:
    gateway:
      server:
        webflux:
          routes:
            - id: components-registry-service
              # … unchanged …
            - id: teamcity-automation-build-chains
              uri: http://teamcity-automation-service.example.svc:8080
              predicates:
                - Path=/services/teamcity-automation/build-chains
                - Method=POST
              filters:
                - SetPath=/rest/api/1/build-chains
```

### 4. The browser runs the sequence; the Portal keeps no run state

- After Create, the SPA calls each chosen step in order, one at a time, and shows each result:
  done, failed with the service's message, or not run.
- The first failure stops the rest, since a later step usually needs an earlier one (a build
  chain checks out the repository).
- Retry runs the failed step and the ones after it. The Portal never deletes anything. What a
  retry can do depends on the step:
  - **Repository: safe to repeat** at any time, including long after. A repository that already
    holds the requested content is done.
  - **Build chain: not safe to repeat.** A refused request (`VALIDATION`,
    `UNSUPPORTED_COMPONENT`) created nothing and can be retried once fixed. Otherwise a lost
    response, a partial failure (`PARTIALLY_CREATED`) or an existing project (`ALREADY_EXISTS`)
    leaves a project that makes every retry answer 409. The Portal shows the project id, or what
    the error says was created, and says that an operator must check the project first:
    - left by this attempt (created just now, no builds, nothing depends on it): delete it in
      TeamCity, then Retry;
    - anything else, such as an established chain: do not delete it. The component's owner
      decides whether it is the chain to keep (the step is then done) or how to move or archive
      it first.
- The Portal backend keeps no run state, and needs no database or job queue for it. Closing
  the page leaves the remaining steps not run (Decision 7).
- Each kind of step is code in the SPA (`teamcity-build-chain` first, `repository` next):
  its request, its inputs and their checks, whether it applies to a component (e.g. a build
  chain only for build systems the service supports), and how the service's answers map to a
  result. There is no generic "call this URL" step.

### 5. Request options come from the Portal's configuration, per profile

- `portal.create-actions` in the Portal's service-config, served to the SPA with the rest of
  `/portal/config`:
  - `<kind>.enabled`: whether a kind of step is offered at all. Off by default, so an
    installation without the step's service sees no change. It is the SPA's only signal that the
    step's route exists, so the two are set together (Decision 3);
  - `profiles`: per CRS profile id (a template or a regular profile, as
    `GET /rest/api/4/component-profiles` lists it), the steps offered and their options.

```yaml
portal:
  create-actions:
    teamcity-build-chain: { enabled: true }
    repository: { enabled: true }
    profiles:
      client-plugin:
        - kind: repository
        - kind: teamcity-build-chain
          values:
            parentProjectId: "Clients_{{ component.clientCode }}"
            branchSpec: "+:refs/heads/*"
          ask:
            minorVersion: { label: Minor version, default: "1.0" }
      solution:
        - kind: repository
        - kind: teamcity-build-chain
          values:
            createDeployStage: true
      bundle:
        - kind: repository
        - kind: teamcity-build-chain   # createDeployStage left to the service's default, false
```

- The profile is often the only place a choice is known. CRS keeps no link from a component to
  the profile it was created with, and two profiles can give the same classification: above,
  both `solution` and `bundle` are solutions, but only `solution` gets a Deploy stage.

- A value is fixed text, or text with `{{ component.<path> }}` read from the component CRS
  returned after the create, with the `lower` and `upper` filters: the subset CRS templates
  already use, read from the created component rather than the template's parameters, so the
  same entry works for a regular profile.
- An option under `ask` is shown to the creator, with its default. An option the entry neither
  sets nor asks is asked with no default when the step requires it (`parentProjectId`,
  `minorVersion`), and otherwise left to the service's default (`createDeployStage`,
  `branchSpec`).
- A profile with no entry is offered every enabled step that applies, with its required options
  asked.
- An entry for an id CRS does not list, or for an unknown kind, is logged at startup and shown
  with the template on Admin settings → Templates. It is never offered.
- A change takes a Portal restart, as other `portal.*` settings do today.
- The open-source repository holds the mechanism and generic examples only; an installation's
  profiles, parent projects and routes live in its service-config.

### 6. In the wizard

- Review & create lists the steps offered for the profile, with a checkbox each (on by default)
  and their asked options. A step that does not apply to the rendered component is shown
  disabled with the reason.
- Asked options are checked in the browser; the service checks them again.
- After Create, the wizard shows each step's progress and result, with a link to what it made
  (the repository, the TeamCity project). On a failure it offers Retry, with the build chain
  guidance of Decision 4 when the project may already exist.

### 7. Later: setup state on the component page

- A component can exist without its repository or chain, when a step failed and was not retried.
- Showing that on the component page, with a way to run the missing steps, needs each service to
  answer "does this component's target exist". It is a follow-up, not part of the first change.

## Alternatives considered

**A. Step values as `annotations` on the CRS template.** Rejected.
- CRS would parse, store and serve data it never reads; every consumer's settings would land in
  the registry's configuration and API.
- A change to a step's values would be a template change and a CRS reload.
- It only covers templates, and it leaves the service endpoints and credentials elsewhere, so a
  step would be configured in two places anyway.

**B. Move templates to the Portal's configuration.** Rejected.
- CRS renders, checks and dry-runs templates, and serves them to API clients, not only the
  Portal. They are registry data.

**C. The Portal backend calls the services with a Portal technical account.** Rejected.
- The Portal would hold every service's credentials and decide itself who may run a step,
  against ADR-001.
- It would need its own authorization rule (who may run a step on which component), which no
  other service checks.
- For `octopus-teamcity-automation-service` it would protect nothing: the service checks no
  caller.

**C2. `octopus-teamcity-automation-service` checks a Keycloak permission now**, as proposed for
`octopus-vcs-facade` (e.g. `CREATE_BUILD_CHAINS`). Not now.
- It is new security work in that service before the Portal can use it, and the service is
  already reachable without it (in the cluster, and through the shared API gateway).
- It can be added later without a Portal change, since the Portal already relays the user's
  token (Decision 3).

**D. CRS runs the steps after a create.** Rejected.
- The step services read the component from CRS; CRS calling them is a cycle.
- CRS would own calls to other systems and their failures, and the user would not see which
  step failed.

**E. An onboarding service that runs every step.** Rejected.
- The Portal is where a user creates a component, and the wrapper would only forward calls.
- It becomes worth having only if API or automation clients need the same sequence after their
  own creates.

**F. Each service derives all its options from CRS.** Not now.
- The repository service does: it picks the content from CRS fields. A build chain's parent
  project, branch spec and Deploy stage are CI choices, not facts about the component, and CRS
  has no field for them; the Deploy stage depends on the profile, which CRS does not keep.
- If `octopus-teamcity-automation-service` gains its own per-component rules, the Portal's
  entries shrink to what the creator is asked.

**G. Generic, configuration-only HTTP steps.** Rejected.
- Request bodies, error handling and results would become code written in YAML, with no tests.

## Consequences

### Positive

- CRS needs no change, and stays the only source of the component's data.
- The Portal holds no credentials for any step service and makes no access decision; ADR-001
  holds.
- Running steps adds no backend code or state to the Portal: a route is configuration, and the
  sequence runs in the SPA.
- An installation without the step services sees no change: every step is off by default.
- Adding a kind of step is a Portal code change; offering it for a profile, or changing its
  options, is a Portal service-config change, with no CRS reload.
- A failed repository step is recovered by running it again; nothing is rolled back.
- Choices that depend on the profile, such as a solution's Deploy stage, are made where the
  profile is known, by configuration rather than by guessing from repository files.
- A step service can start checking callers later without a Portal change, since the user's
  token is already relayed.

### Negative

- **Accepted risk: the build chain step has no access check.**
  - Any signed-in Portal user, of any role, can create a build chain for any component, with any
    options, through the Portal's route. So can anything that reaches the service in the cluster
    or through the shared API gateway, as today.
  - Limited by: the route forwards only the create endpoint; the service only creates, never
    changes or deletes, and refuses a chain that already exists; it acts only under the parent
    projects its TeamCity account may write to.
  - Revisit when the service is exposed more widely, or when its account gets rights beyond
    creating chains (Alternative C2).
- A build chain create that times out, fails part-way or meets an existing project needs an
  operator before it can be retried (Decision 4). Making chain creation safe to repeat is a
  change to `octopus-teamcity-automation-service`, left to separate work.
- A chain created outside the Portal (CLI, metarunner) gets a Deploy stage only when its caller
  passes the flag; the profile-to-flag mapping lives only in the Portal's configuration.
- The Portal cannot use `octopus-teamcity-automation-service` until it reads the TeamCity
  connection and the CRS URL from its own configuration, not from each request. Until then the
  browser would have to send TeamCity credentials, which this decision rules out.
- Each step needs two settings kept together in the Portal's service-config: its route, in each
  environment's file, and its `enabled` flag. A flag without its route fails every run with 404.
  The route list replaces the default list, so it must also repeat the CRS route.
- A template's id ties two files together: the template in CRS's configuration, its steps in the
  Portal's. A renamed or removed template leaves an entry that is reported and does nothing.
- The SPA holds the sequence and its partial-failure handling. Closing the page leaves the
  remaining steps not run, and a component can exist without its repository or chain until the
  component page shows it (Decision 7).
- A component created through the CRS API, not the Portal, gets no steps.
- A step service that checks callers needs its own role mapping, and role assignments in
  Keycloak.

## Open questions

- For a step service that checks callers (the repository service): which roles get its
  permission, in particular whether template-only creators do.
- Whether a template-only creator may untick a step.
- Whether step runs are recorded anywhere beyond each service's logs, e.g. CRS's service-event
  journal.

## See also

- CRS `openspec/changes/add-component-templates`, `add-template-only-creators`.
- CRS [ADR-016 — Admin configuration as code](https://github.com/octopusden/octopus-components-registry-service/blob/main/docs/registry/adr/016-admin-config-as-code.md)
  (where profiles and templates are configured).
- Portal [ADR-001](001-spring-cloud-gateway-bff.md), [`docs/features/create-component.md`](../features/create-component.md).
