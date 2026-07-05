# Design Brief: Jira Section Redesign (Component Editor + Create Form)

Companion to `jira-section-redesign-prep.md` (full analysis). This brief is self-contained input
for a design session. Date: 2026-07-02.

## 1. Product context

The Components Management Portal is an internal admin tool over a components registry. Each
component has an editor with tabs (General / Build / VCS / Jira / Distribution / …) and a
"New Component" create dialog. The **Jira tab** configures how component versions map to Jira:
which Jira project tracks them, and a set of version-format templates.

**Problem:** today the tab is a flat wall of ten look-alike text inputs ("… Version Format" × 6).
Users cannot tell which fields matter, how the formats relate, or what the resulting versions
look like in Jira. See the baseline screenshot (2026-07-02 session).

**Goal:** make the section understandable at a glance — a clear hierarchy, progressive
disclosure for derived formats, and a live illustration of how a version string is computed.

## 2. Design system constraints

- Stack: React 19, shadcn/ui (Radix primitives + Tailwind 4 + CVA). Light theme is the shipped
  default; a dark palette exists but is dormant.
- Tokens (single source `frontend/src/index.css`): neutral zinc-ish palette,
  `--color-primary: hsl(240 6% 10%)`, `--color-muted-foreground: hsl(240 4% 46%)`,
  `--color-border: hsl(240 6% 90%)`, `--radius: 0.5rem`; semantic badge tokens
  green/blue/yellow/red (e.g. `#dcfce7`/`#166534`).
- Existing components to reuse: `Input`, `Switch`, `Badge`, `Tooltip` (via `FieldInfo` ⓘ icons),
  `FieldLabelText` (label + optional config override), `EnumSelect`, `status-banner`,
  `inline-error`, `CodeBlock`, dialog, toast.
- Editor-wide patterns that MUST survive:
  - **Sticky SaveBar + Review dialog**: all tabs feed one combined Save with a diff review.
  - **Per-range overrides**: 9 Jira fields carry a "+ Add override" inline affordance
    (`FieldOverrideInline`) showing chips like `(,1.2.471) → $major.$minor.$service-$fix`.
    The redesign must keep this affordance on every overridable field.
  - Field labels/tooltips come from a config registry; do not hardcode copy in layouts.

## 3. Information architecture (target)

Three groups, in order:

1. **Jira project** ("Where releases and issues of this component are tracked.") — Project Key (primary field, required, top emphasis). Server enforces
   uniqueness of (Project Key, Version Prefix) — design a clear inline 409-conflict error state.
2. **Version formats** — the core group, with the live computation illustration (see §4).
   Fields: Jira Version Prefix + Full Version Format in Jira (adjacent pair);
   **Line / Major Version Format (leading) with Minor Version Format derived next to it on the
   same row**; **Release Version Format with Build Version Format derived on the same row**;
   Hotfix Version Format (conditional).
3. **Flags** — Technical (admin-only editable), Skip Commit Check at Issue Assignment at
   Release (new toggle). ("Releases in default branch" is being hidden via deployment config —
   design should tolerate its absence.)

## 4. The version ladder (key illustration)

A component version string (e.g. a git tag `1.2.3`) is decomposed into numeric parts
(`$major.$minor.$service.$fix.$build`) and re-rendered through each format template. If
**Version Prefix** is set, every result is additionally wrapped by **Version Format**
(canonically `$versionPrefix-$baseVersionFormat`).

Live preview, recomputed from current (unsaved) field values against a sample version:

```
version 1.2.3
├─ Release Version in Jira  pgw-1.2.3   → Jira "Fix Version/s"
│                             (Technical ON → "SubComponent Fix Version/s")
├─ RC Version               pgw-1.2.3_RC → Jira, until the release replaces it in Fix Version/s
├─ Minor Version            pgw-1.2     = line format → used for planning in Jira
├─ Line Version             1.2         (no prefix; leading) → CRN report — by default
│                                         all versions belonging to this line are included
├─ Build Version            1.2.3       = release format, no prefix → CI builds
└─ Hotfix Version           1.2.3-4     → hotfix build (no prefix)
                            pgw-1.2.3-4 → Jira Fix Version (standard wrap, like Release)
```

The prefix wraps **Jira-facing versions only**; Line and Build render without prefix. The Hotfix
format has TWO usages — the hotfix build version (no prefix) and the Jira Fix Version (wrapped) —
show both in the ladder (only when hotfixes are enabled).

Notes for design:
- The sample version should be editable or picked from the component's known versions.
- **Hotfix rows use their OWN sample version** (domain-owner, 2026-07-02): hotfix versions carry
  an extra trailing segment vs standard ones (e.g. standard `1.2.3`, hotfix `1.2.3-187`), so a
  single sample cannot demo both — the preview shows a second editable "hotfix version" input
  (visible only when hotfixes are enabled) and computes both hotfix rows from it.
- Each ladder row links back to the field that produced it (hover/focus association).
- Rows for collapsed (mirrored) formats show a subtle "= release format" / "= minor format" tag.
- Some template variables are server-computed; preview may mark those as approximate.

## 5. Field behaviors

| Field | Behavior |
|---|---|
| Project Key | Required, primary. Text input, per-range override affordance. |
| Jira Version Prefix | Optional. Distinguishes components sharing one Jira project. Applies to Jira versions only (Release/Minor/Hotfix). |
| Full Version Format in Jira | Wrapper template (`$versionPrefix-$baseVersionFormat`) for Jira versions. Keep adjacent to Jira Version Prefix. |
| Line / Major Version Format | **Leading field of the pair** — always visible, editable. The maintenance line ("real major"); drives the CRN report line. |
| Minor Version Format | **By default a copy of Line**: read-only mirror, tag "same as line" + button "Set separate minor format". When overridden: editable + "Remove separate format" (reverts to mirroring). Never collapse if per-range overrides exist on it. (Planning version in Jira.) Save materializes the leading value into both stored fields while not overridden — server fallback direction is the reverse, so the copy is written, not derived. |
| Release Version Format | Always visible, editable. The Jira Fix Version template. |
| Build Version Format | **Collapsed when unset**: read-only, mirrors Release value, tag "same as release" + button "Set separate build format". When set: editable + action "Remove separate format" (reverts to mirroring). Never collapse if per-range overrides exist on it. (This pair rides the real server-side fallback — no materialization.) |
| Hotfix Version Format | Visible only when hotfixes are enabled (any VCS root has a hotfix branch); **hidden whenever hotfixes are disabled**, even if a stored value exists. |
| Technical | Toggle, **editable only for admins** (permission-gated); read-only illustrative state for everyone else. When ON, the ladder shows "SubComponent Fix Version/s" as the tracking field and a note that technical components are excluded from customer-facing release notes. |
| Skip Commit Check at Issue Assignment at Release | New toggle (see §6), backed by its own boolean field. Editable by ANY component editor. Always false (disabled + hint) for Whiskey components. |

Read-only / admin-gated states need a distinct but calm visual treatment (lock glyph + tooltip
explaining who can edit), consistent across Technical, External Registry, and any
config-hidden/readonly field.

## 5a. UI copy — tooltips/descriptions (derived from the RM 2.0 FAQ, v81)

Authoritative texts for `fieldDescriptions.ts` / FieldInfo tooltips. Cleaned of internal tokens;
"pgw" is a neutral example prefix.

| Field | Tooltip / description |
|---|---|
| Project Key | The Jira project where RM 2.0 tracks this component's versions and issues; auto-assigned versions land in the issue's Fix Version/s field. An UNRELEASED version matching the component's minor (planning) version format must exist in this project — otherwise issues cannot be reopened. |
| Jira Version Prefix | Distinguishes components sharing one Jira project. Applied to Jira-facing versions via the Full Version Format (e.g. planning version 1.2 → pgw-1.2). Issues are auto-assigned to a release when their Fix Version/s contains the matching prefixed version. |
| Full Version Format in Jira | Wrapper template composing the prefix with a base version for everything registered in Jira — canonically `$versionPrefix-$baseVersionFormat` (the separator is part of the template and per-component). |
| Line Version Format (Major) | The release line ("real major"), e.g. 1.2 from 1.2.3-101. The CRN report by default covers all versions of the current line, from the line start up to the reported release. Minor is derived from this unless set separately. No prefix is applied. |
| Minor Version Format | The planning (minor) version tracked in Jira. A previous RC is carried into the next release only when minor versions match; for components with commit checks disabled, issues are assigned by this version in Fix Version/s. |
| Release Version Format | The released version — the Jira Fix Version template. During RC the value carries the `_RC` suffix; at release, the `_RC` value in Fix Version/s is replaced with the release version (the RC value is preserved in "RC Version/s"). |
| Build Version Format | Version stamped on CI builds. Mirrors the release format unless set separately. No prefix is applied. |
| Hotfix Version Format | Two usages: the hotfix build version (no prefix) and the hotfix Fix Version in Jira (wrapped like a release version). Available when a VCS root defines a hotfix branch. |
| Technical | Versions of a technical component are tracked in the Jira field "SubComponent Fix Version/s" and excluded from customer-facing release notes. When a technical component is later included in a main component, the main component's version is also written to the issue's Fix Version/s. |
| Skip Commit Check at Issue Assignment at Release | Disables commit-based issue-to-version assignment: commits are not checked at RC/Release registration. **Primary use case: several components sharing one repository** — commit-based assignment cannot tell which component a commit belongs to and would attach every component's version to the issue. Also applies when the component has no repository at all, or its repository does not hold the main code. Instead an issue is assigned when it is resolved as Done and its Fix Version/s contains the matching minor (planning) version. Replaces the legacy `externalRegistry = NOT_AVAILABLE` DSL setting — users never type the sentinel in the new UI. |

Decided (2026-07-02): the ladder includes an **RC Version** row (`pgw-1.2.3_RC`, wrapped like a
Jira version) between Release and Minor — users deal with `_RC` values directly; computed as
release + `_RC`.

## 6. Skip Commit Check toggle (new)

- Lives in the Flags group of the Jira section.
- Semantics: when ON, release automation skips commit checks; issues are attached to a release
  candidate by builds only (and by the minor version in Fix Version/s). **Primary use case:
  components sharing one repository**; also components with no repository, or whose repository
  does not hold the main code. Stored as its own boolean field (`skipCommitCheck`);
  legacy systems keep seeing the `NOT_AVAILABLE` sentinel via a read bridge — in the new UI the
  user never types it (that is the point of the toggle).
- **Whiskey rule: for buildSystem = WHISKEY the flag is always false** — the toggle renders
  disabled with a hint "Not applicable for Whiskey components" (server validates too). The flag
  and a real registry value are therefore mutually exclusive; no conflict states exist.
- Editable by ANY component editor (External Registry itself stays admin-only).

Related: the **External Registry** field on the VCS tab becomes a **dropdown** (installation-
configured options; the sentinel value is NOT listed — it is expressed only via this toggle),
visible only when the build system is Whiskey, editable only by admins.

## 7. Create form

Same rules where applicable. Jira block in the create dialog: Project Key (required),
Version Prefix, Line (leading) + Release, with collapsible Minor/Build mirrors using the same
pattern (seeded from installation defaults; Line materializes into both stored fields), and the live ladder preview. **Not present**:
Technical, Hotfix Version Format, External Registry, Version Format.

## 8. States to cover in mockups

1. Regular user (nothing admin-gated editable), typical component — happy path.
2. Admin, Whiskey component with a real registry value, toggling Skip Commit Check → confirm.
3. Hotfixes enabled (hotfix format editable) vs disabled-with-value (read-only hint).
4. Technical ON — ladder switches the tracking-field caption.
5. Minor/Build mirror fields: collapsed (mirroring Line/Release), expanded (custom), and collapsed-blocked-by-overrides.
6. Per-range override chips present on Project Key and Release Version Format.
7. 409 conflict on (Project Key, Version Prefix).
8. Create dialog: scratch with defaults; copy-mode with prefilled formats.

## 9. Out of scope

- Any change to per-range override editing UX itself (keep `FieldOverrideInline` as is).
- Dark theme (tokens exist; do not design against it yet).
- Other tabs, except the External Registry dropdown treatment on the VCS tab.
