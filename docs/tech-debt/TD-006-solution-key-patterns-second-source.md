# TD-006: The editor's Solution toggle reads its own solution-key setting

## Status

**Open.** Accepted when the Create wizard moved to the registry's profiles.

## Context

- The Create wizard takes its profiles, and each profile's key rule, from the registry
  (`GET /rest/api/4/component-profiles`). The Solution and DMP Bundle profiles require their word in
  the key; the regular profiles keep `solution` and `dmp-bundle` out of it.
- The component editor still offers its Solution toggle only for a key containing one of
  `portal.component.solution-key-patterns` (`isSolutionCandidate`, `ComponentDetailPage`).
- So "what is a solution key" has two sources. An administrator who changes the profile rules in
  service-config has to change the Portal setting to match, or the editor and the wizard disagree.
- The registry does not check renames or Solution-flag changes against profile rules either, so
  the editor has no registry rule to read yet.

## Work

1. Once the registry applies solution naming to renames and Solution-flag changes, have the editor
   read the rule from the registry instead of the Portal setting.
2. Remove `portal.component.solution-key-patterns` (`PortalComponentProperties`, `/portal/config`,
   `isSolutionCandidate`) when nothing reads it.

## Acceptance criteria

1. The editor's Solution toggle and the wizard's key rule come from the same registry configuration.
2. `portal.component.solution-key-patterns` is gone from the Portal and its configuration.
