## Why

The Distribution tab lets an editor declare per-range overrides for the
distribution marker paths (Maven, File URL, Packages here; Docker on its own
tab). It shows the ranges, but not the answer those ranges exist to produce:
*for version X, what will actually be published?*

Today the editor reads a list of ranges and intersects them in their head. That
is error-prone in exactly the cases that matter — adjacent ranges, a gap between
ranges, a version outside the supported set — and the cost of being wrong is a
release publishing the wrong artifact. This is the one acceptance criterion of
issue #146 that was deferred when the rest of per-range editing shipped.

## What Changes

- The Distribution tab gains a version box. It is a preview control, not part of
  the component's data: nothing about it is saved.
- With a version entered, each subsection shows which children the registry
  would resolve for that version and **where they came from** — a specific range
  override, or the component-level base list. The winning per-range row is
  marked.
- The registry decides. The Portal sends the version together with the unsaved
  override and supported-version drafts to a new CRS preview endpoint, and
  renders the verdict. It does not re-implement version ordering or resolution,
  so every version shape the registry accepts (`1.2-0003`, `2.1.0-RC1`,
  `1.0.0-SNAPSHOT`) previews the same way it resolves.
- Nothing about saving changes. The preview is read-only and does not
  participate in dirty tracking or the combined Save.

## Capabilities

### New Capabilities

- `distribution-per-range`: how the Distribution tab previews the effective
  distribution for a concrete version.

### Modified Capabilities

<!-- None. Per-range editing itself already shipped; this adds the read side. -->

## Impact

**Cross-repo, CRS merges first.** CRS gains
`POST /rest/api/4/components/{id}/distribution/preview` (CRS SYS-099). The
Portal re-vendors the v4 spec once that merges; until then the Portal PR's
`vendor-spec:check` fails by design.

Affected in the Portal:

- `components/editor/DistributionTab.tsx` — version box, attribution per
  subsection.
- `components/editor/DistributionPerRange.tsx` — marks the winning row.
- `pages/ComponentDetailPage.tsx` — passes the supported-versions draft to the
  Distribution tab.
- A new `hooks/useDistributionPreview.ts`, following `useVersionPreview.ts`.
- `docs/features/component-detail.md` — Distribution tab section.
