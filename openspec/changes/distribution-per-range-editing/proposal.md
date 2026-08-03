## Why

The Distribution tab lets an editor declare per-range overrides for the four
marker paths (Maven, Docker, File URL, Packages). It shows the ranges, but not
the answer those ranges exist to produce: *for version X, what will actually be
published?*

Today the editor reads a list of ranges and intersects them in their head. That
is error-prone in exactly the cases that matter — adjacent ranges, a gap between
ranges, a version outside the supported set — and the cost of being wrong is a
release publishing the wrong artifact. This is the one acceptance criterion of
issue #146 that was deferred when the rest of per-range editing shipped.

## What Changes

- The Distribution tab gains a version box. It is a preview control, not part of
  the component's data: nothing about it is saved.
- With a concrete version entered, each of the four subsections shows which
  children the registry would resolve for that version, and **where they came
  from** — a specific range override, or the component-level base list.
- The preview reproduces the registry's resolution rules for the cases that are
  easy to get wrong: a version covered by no override falls back to base; a
  version outside the component's supported set resolves to nothing at all
  rather than to base; an unparseable override range never matches.
- **It does not reproduce them for every version the registry accepts, and that
  is the open question.** Client-side ordering only handles dot-numeric
  versions, so `1.2-0003`, `3.0.0-0` and `2.1.0-RC1` — ordinary shapes here —
  are declined rather than resolved. Whether that is an acceptable contract, or
  whether resolution belongs on the registry side instead, is the decision this
  proposal is waiting on; see design.md.
- Nothing about saving changes. The preview is read-only and does not
  participate in dirty tracking or the combined Save.

## Capabilities

### New Capabilities

- `distribution-per-range`: how the Distribution tab presents per-range
  overrides for the four marker paths, and how it previews the effective
  result for a concrete version.

### Modified Capabilities

<!-- None. Per-range editing itself already shipped; this adds the read side. -->

## Impact

**Portal only if the narrow contract is accepted; cross-repo if it is not.** As
written the preview reads data the API already returns and applies rules the
registry already implements, so no CRS change is required and nothing has to
merge first. If instead resolution moves to a registry endpoint — the option
design.md recommends considering, because it removes rather than extends the
duplication — this becomes a CRS change that merges first, with the Portal work
following.

Either way the main risk is the same one: as specified, the Portal holds a
second implementation of resolution semantics that the registry owns. The two
can drift silently, and the preview would then confidently show the wrong
answer — worse than showing none. design.md names the requirements it mirrors
so the drift has something to be checked against.

Affected:

- `components/editor/DistributionTab.tsx` — hosts the version box, passes the
  resolved result to each subsection.
- `components/editor/DistributionPerRange.tsx` — marks which row (if any) wins
  for the previewed version.
- `components/editor/perRangeGrouping.ts` — the list renders coalesced groups,
  so a winning override has to be mapped back to the group displaying it.
- `pages/ComponentDetailPage.tsx` — passes supported-version state down to the
  Distribution tab, which does not receive it today.
- A new resolution helper alongside `lib/versionRange.ts`; the existing range
  primitives (`parseSimpleSegment`, `compareVersionRanges`) are the building
  blocks, but "does this range contain this version" does not exist yet.
- `docs/features/component-detail.md` — Distribution tab section.
