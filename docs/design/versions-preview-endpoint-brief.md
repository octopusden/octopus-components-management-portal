# Brief — live version-preview render endpoint (CRS + Portal, one session)

**Goal.** Make the Jira-tab **Version Preview** live and version-accurate for Whiskey by
rendering from the **unsaved** editor config (base formats **+ per-range overrides**) on the
server, instead of the current saved-config `detailed-version` call.

**Tracking:** CRS issue **#402** (octopusden/octopus-components-registry-service#402).
**Already shipped (context):** portal PR **#156** (Whiskey preview via saved-config `detailed-version`).
**Supersedes note:** memory `project_whiskey_version_preview_server_render`.

Start the session in the **CRS repo** cwd: `/Users/pgorbachev/projects/octopus/octopus-components-registry-service` (active branch `v3`).

---

## 0. Sequencing (why order matters even in one session)

The two repos have a hard gate:

- Portal types CRS via a **vendored OpenAPI spec**; CI `vendor-spec:check` pins `CRS_SPEC_REF=v3`
  (the moving branch). The portal switch can't go green / merge until the new endpoint is in the
  **v3 spec** — i.e. **CRS PR merged to v3 first**.
- E2E of the portal side needs a CRS image carrying the endpoint on the stand.

So within one session: build + locally test **both**, but land **CRS → v3 first**, then regen the
portal vendor-spec against merged v3 and open the portal PR. The portal PR merges after CRS.

Do all work in **manual worktrees** (repo rule): CRS worktrees live in the sibling
`octopus-components-registry-service-wt/`; portal worktrees in `_wt/`.

---

## PHASE 1 — CRS endpoint (TDD, branch off `origin/v3`)

```
git -C /Users/pgorbachev/projects/octopus/octopus-components-registry-service fetch origin v3
git worktree add -b feat/versions-preview-endpoint \
  ../octopus-components-registry-service-wt/versions-preview-endpoint origin/v3
```

### What exists to reuse (verified this session)

- Renderer: `org.octopusden.releng.versions` — `JiraComponentVersionFormatter`, `VersionNames(serviceBranch, service, minor)`, `NumericVersionFactory`, `VersionRangeFactory`, `ComponentVersion`.
- Existing endpoint doing exactly this for **saved** config:
  `ComponentControllerV2.getComponentRegistryVersion` →
  `GET rest/api/2/components/{component}/versions/{version}/detailed-version` →
  `detailedComponentVersionMapper.convert(componentRegistryResolver.getJiraComponentVersion(component, version))`.
- Mapper: `JiraComponentVersionToDetailedComponentVersionMapper.kt` (`Mapper<JiraComponentVersion, DetailedComponentVersion>`).
- Response DTOs (in `components-registry-service-core`, **reuse as-is**):
  - `DetailedComponentVersion { component, minorVersion, lineVersion, buildVersion, rcVersion, releaseVersion, hotfixVersion? }`
  - `ComponentRegistryVersion { type, version, jiraVersion }`
- Format DTO: `ComponentVersionFormatDTO { majorVersionFormat, releaseVersionFormat, buildVersionFormat, lineVersionFormat, hotfixVersionFormat? }`.
- `VersionNamesDTO { serviceBranch, service, minor }`, served at `GET rest/api/2/common/version-names`; built in `ConfigResolverConfig` / `JiraParametersResolverConfig`. **This is CRS-instance-global config — the server already has it.**
- Range types: `JiraComponentVersionRange` / `JiraComponentVersionRangeFactory` (how a version selects a format per range — this is the resolver's per-version resolution).

### Endpoint contract (Variant A — server resolves the range)

`POST /rest/api/4/versions/preview` — new controller `@RequestMapping("rest/api/4/versions")` (e.g. `VersionsControllerV4`).

Request (no persistence, no component lookup):
```jsonc
{
  "version": "1.0.50",                 // input version → drives range selection
  "technical": false,
  "base": {                            // effective BASE formats (ComponentVersionFormat-shaped)
    "lineVersionFormat": "$major.$minor",
    "minorVersionFormat": null,        // null/absent = mirrors line
    "releaseVersionFormat": "$major.$minor.$service-$fix",
    "buildVersionFormat": null,        // null/absent = mirrors release
    "hotfixVersionFormat": "$major.$minor.$service-$fix-$build",
    "versionPrefix": "pgw",
    "versionFormat": "$versionPrefix-$baseVersionFormat"
  },
  "overrides": [                       // per-range format overrides (only differing fields)
    { "versionRange": "(,1.0.107)", "releaseVersionFormat": "$major.$minor.$service" }
  ]
}
```
Response: **reuse `DetailedComponentVersion`** (so the portal mapping is unchanged).

### Server logic

1. Build the per-range set from `base` + `overrides` (mirror `JiraComponentVersionRange` construction the resolver uses).
2. **Resolve the range** the input `version` falls into (base when none matches) → effective `ComponentVersionFormat`.
3. Drive `JiraComponentVersionFormatter` (server's own `VersionNames`) to render → map to `DetailedComponentVersion`.

### ⚠️ Investigation points (validate before coding — don't assume the issue draft is exact)

- **How to construct a `JiraComponentVersion` (or drive the formatter) from ad-hoc formats + a version WITHOUT a persisted component.** Trace `componentRegistryResolver.getJiraComponentVersion` + `getResolvedComponentDefinition` and the formatter's inputs; factor a reusable render path.
- **Does anything need `buildSystem`?** Whiskey's zero-padding (`03`, `0007`) / library computation — is it driven by the format templates + `VersionNames` + `NumericVersionFactory`, or by a separate build-system flag? If purely by formats/versionNames, **omit `buildSystem` from the payload**. Confirm by rendering a Whiskey fixture and diffing against `detailed-version`.
- **`versionNames`**: confirm it's instance-global (server-owned) → **not in the payload**. If per-something, add it.
- Minor/build "mirror" semantics (null ⇒ mirrors line/release) — match how the resolver/materialization treats empty formats (portal already sends `''`/null this way).

### Tests + spec (repo gotchas — from memory)

- Integration/`@Tag("integration")` tests run via **`./gradlew dbTest`** (plain `test` **excludes** them and silently runs zero).
- New endpoint → **regenerate OpenAPI**: `generateOpenApiDocs`, gated by `OpenApiV4SpecTest`. Update the committed v4 spec.
- Tests to add: unit render (Whiskey fixture → matches `detailed-version` for same effective config+version), override-range selection (version inside `(,1.0.107)` uses override, outside uses base), invalid/unparseable version → clean 4xx.
- **TDD**: failing test first (repo rule), per layer.

Open CRS PR → `v3`. Review (Sonnet), iterate to clean, **merge to v3**.

---

## PHASE 2 — Portal switch (branch off `origin/develop`, after CRS is in v3)

```
git -C /Users/pgorbachev/projects/octopus/octopus-components-management-portal fetch origin develop
git worktree add -b feat/jira-preview-live-render _wt/jira-preview-live origin/develop
```
(node_modules per repo rule: generate via Gradle Node, `./gradlew npmCi` — do NOT symlink for a real run.)

### Steps

1. **Rebase on `origin/develop`**, then `npm run vendor-spec` to pull the updated v3 spec (now carrying `POST /rest/api/4/versions/preview`); commit the vendored spec. (This is why CRS must be in v3 first — else `vendor-spec:check` stays red.)
2. New hook `useVersionPreview(payload, enabled)` — `api.post('/versions/preview', payload)` (v4 namespace → the `api` wrapper, not `apiAbsolute`). Returns `DetailedComponentVersion`.
3. In `JiraVersionPreview.tsx` **`JiraVersionPreviewServer`** (the Whiskey path): assemble the payload from the section draft (`useJiraSection` state) **+ the overrides draft** (`useOverridesDraft().effectiveOverrides` filtered to jira.* attributes) + input version; debounce; call `useVersionPreview` instead of `useDetailedVersion`.
   - `JiraTab` already has section state, `effectiveOverrides`, `effectiveBuildSystem`, `component`. Thread what's needed into the preview props.
   - Map overrides → the endpoint's `overrides[]` (versionRange + per-range jira format fields).
4. **Remove** the "reflects saved configuration" caption — it's live now. Keep the input version (drives override selection); keep the notice fallback on 4xx.
5. Keep `useDetailedVersion` only if still used elsewhere; otherwise delete it + its test.
6. Decide scope: keep the **client** ladder for non-Whiskey (fast, no network — already live/accurate there), use the endpoint for **Whiskey** only. (Migrating everyone to the server endpoint is a possible later simplification, not required.)

### Tests

- Hook test: URL `/rest/api/4/versions/preview`, POST body shape, enabled gating, trim (see the #156 Copilot fix pattern).
- Preview whiskey-mode: payload assembled from section+overrides; renders mapped rows; caption gone; version drives override.
- `tsc`, ESLint, full vitest green. E2E only on the TC stand (needs the CRS image with the endpoint).

Open portal PR → `develop`. Review, iterate to clean, merge (auto-merge/squash once green).

---

## Acceptance (both merged)

- [ ] Whiskey preview updates **live** as formats/overrides are edited (no save needed).
- [ ] Choosing an input version inside an override range renders that range's format; outside → base.
- [ ] Whiskey output (padding / library / custom vars) matches real behaviour.
- [ ] Client ladder for non-Whiskey unchanged.
- [ ] Both specs/tests green; caption dropped.

## Gotchas checklist (memory)

- CRS integration tests via `dbTest`; OpenAPI via `generateOpenApiDocs` + `OpenApiV4SpecTest`.
- Portal `vendor-spec:check` pins `CRS_SPEC_REF=v3` → CRS must be in v3 before portal CI passes; always rebase on `origin/develop` first.
- CRS/portal need **no task key** for branches/commits; no internal task keys in PR titles/commit subjects; no forbidden product/customer tokens.
- Work in manual worktrees; Sonnet review after each implementation commit; iterate to clean (no P1/P2) before merge.
- Commit co-author + PR footer per session rules.
