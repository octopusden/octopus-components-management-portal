# General Tab Improvements Plan

Status: implemented.

## Goals

1. Move the Solution switch out of the General tab.
2. Highlight components with `solution = true` in the component header.
3. Expose Solution as a dedicated Overview topic only for component keys that match service-config patterns.
4. Move Labels to the component header as editable badges with a popover editor.
5. Move Doc Links to a dedicated Documentation topic in the Build & Release group.
6. Make Artifact Ownership denser without changing behavior.

## Backend

- `portal.component.solution-key-patterns` is read from service-config through `PortalComponentProperties`.
- `GET /portal/config` returns `{ "solutionKeyPatterns": [...] }`.
- The endpoint trims configured values and drops blanks. An empty list means no component offers the Solution switch.
- `PortalConfigControllerTest` covers non-empty and empty pattern lists.

## Frontend

- `usePortalConfig()` reads `/portal/config` with plain `fetch`, matching the existing `/portal/info` and `/portal/links` hooks.
- `isSolutionCandidate(key, patterns)` uses simple substring matching, mirroring the backend contract.
- `SolutionTab` renders as a conditional Overview topic when the current form key matches the configured patterns and `component.solution` is not hidden by field-config.
- `DocumentationTab` owns the doc-links editor while sharing the page-level React Hook Form state.
- `HeaderLabelsEditor` renders labels in the header, respects field-config visibility, and surfaces `labels` server errors inline.
- `buildUpdateRequest` omits `solution` when field-config marks it hidden or readonly.
- The page-level 400 handler routes `docs` errors to Documentation and maps `labels` errors to the header editor.

## Documentation

- `docs/features/component-detail.md` documents the new Solution and Documentation topics.
- Labels are documented as a header editor rather than a General-tab field.
- Doc links are documented as a child collection edited from Documentation but saved through the same page-level PATCH.

## Verification

- Frontend unit coverage covers `SolutionTab`, `DocumentationTab`, `HeaderLabelsEditor`, `buildUpdateRequest`, `solutionKey`, `usePortalConfig`, and the relevant `ComponentDetailPage` routing behavior.
- Backend unit coverage covers `/portal/config` response shaping.
