## Context

See proposal.md — Why.

The registry resolves a component at a concrete version like this: keep the
overrides whose version range contains the version; among those, for a given
marker attribute take the first one found, otherwise fall back to the base
children. Separately, if the component declares supported versions and the
requested version is outside them, the registry resolves nothing at all and the
read returns not-found.

Two details of that behaviour drive the decisions below. First, the choice among
same-attribute overrides is positional (`firstOrNull`) and therefore only
well-defined because override ranges on one attribute are supposed to be
disjoint. Second, an unparseable range is treated as non-matching on the resolve
path, but as matching on the coverage gate — the registry is deliberately
conservative there, preferring to serve a configuration over a false not-found.

On the Portal side the ingredients exist but the key predicate does not:
`lib/versionRange.ts` can parse, compare, merge and classify overlap between
ranges, but has no "does this range contain this version". The component payload
already carries supported versions, so the coverage gate is answerable
client-side.

## Goals / Non-Goals

**Goals:**

- One resolution function, exercised directly by tests, that the UI merely
  renders — so the semantics can be verified without mounting a component.
- Explicit, visible failure whenever the Portal cannot justify an answer.

**Non-Goals:**

- Asking the registry to resolve the preview. A round trip per keystroke for a
  read the client can already compute is not worth the coupling, and the
  endpoint answers for the saved component, not for the unsaved override draft
  the user is editing.
- Reproducing scalar-override or ownership resolution. This change is limited to
  the four distribution marker paths.

## Decisions

**Resolution lives in a standalone module, not in a hook or component.** The
rules are the whole substance of this change and every interesting case is a
pure data case: gap, boundary, empty override, unsupported version. A function
taking (overrides, base children, supported versions, version) and returning a
tagged result makes those cases directly testable, and keeps the component free
of branching.

**The preview reads the draft, not the server.** Per-range edits queue into the
shared override draft and ride the combined Save. Previewing the saved state
while the user looks at unsaved rows would be actively misleading, so the
preview resolves over the same draft the list renders.

This extends to supported versions, which have their own unsaved draft on a
sibling tab. Both drafts land in the same combined Save, so resolving against
the saved coverage would make the preview's answer change at Save time for no
visible reason. The preview reads the coverage draft.

**Containment is tri-state, and the two call sites reduce it oppositely.** The
predicate answers yes / no / cannot-evaluate. On the override path,
cannot-evaluate means the override does not apply, and the tab says so. On the
coverage path, cannot-evaluate means the range *does* cover, silently. This is
not an inconsistency to tidy up: it mirrors the registry, which is conservative
about refusing to serve a configuration and strict about applying an override.
Collapsing both to a single boolean is the likely implementation mistake here,
and it would make the preview claim "no configuration at this version" for
versions the registry resolves normally.

**The winning row is identified by group, not by override.** The per-range list
renders coalesced groups — contiguous same-value overrides collapse into one
row spanning several member ids. Resolution works on individual overrides, so
the winning override must be mapped back to the group that contains it before
anything can be marked. The interesting case is a winner in the interior of a
multi-member group.

**On overlapping same-attribute overrides the Portal reports a conflict rather
than mirroring `firstOrNull`.** This is a deliberate divergence. The registry's
positional pick is well-defined only under the disjointness invariant; where the
invariant is broken the "right" answer is undefined, and echoing an arbitrary
choice would present a guess as fact. The Portal already refuses to *write*
overlapping ranges on an attribute, so refusing to *interpret* them is
consistent. The conflict message is the useful output here — it points at data
that needs fixing.

**Unparseable ranges follow the registry per-path, not globally.** An override
whose range will not parse never wins the preview, matching the resolve path.
But the tab says so rather than staying silent: an unevaluable range means the
preview for that path is not trustworthy, which the user must know.

## Risks / Trade-offs

**Duplicated semantics can drift.** This is the real cost of the change: the
resolution rules now exist in two repositories, and a change to the registry's
resolver will not fail anything here. Containment, in descending order of value:

1. The behaviour this mirrors is pinned by numbered requirements on the registry
   side; this spec cites them, so a deliberate change there has a written
   counterpart to update here.
2. The resolution module carries a single comment naming the registry function
   it mirrors, so a reader finds the other copy.
3. The preview is advisory and labelled as such. It never gates a write, so
   drift degrades a hint rather than corrupting data.

This is mitigation, not elimination. If the preview later grows load-bearing
uses, the honest fix is a registry endpoint that resolves a hypothetical
override set, and this module retires.

**Client-side version parsing is much narrower than the registry's, and this is
the open question in this design.** `parseSimpleSegment` reduces every bound
through a dot-numeric test, `^\d+(\.\d+)*$`. Anything carrying a qualifier fails
it: `1.2-0003`, `3.0.0-0`, `2.1.0-RC1`, `1.0.0-SNAPSHOT`. Those are ordinary
shapes in this registry, not exotic ones, and the same limit applies to a range
whose bounds are qualified.

An earlier draft of this document claimed the affected set was small. It is not.
Built as specified, the preview would decline a large share of real components —
and a preview that answers "cannot evaluate" for the versions a team actually
ships is not worth the code. Three ways out, and the choice belongs to the
reviewer rather than to this document:

1. **Ship dot-numeric only, and say so on the control.** Cheapest, honest,
   useless for qualified-version components.
2. **Widen the client parser** to order qualified versions the way the registry
   does. This doubles down on the duplication the section above already names as
   the main risk, and version ordering is precisely where a subtly different
   second implementation does damage.
3. **Ask the registry to resolve it.** A stateless endpoint taking a version and
   a candidate override set would remove the duplicated semantics rather than
   extending them, and would handle every version shape by construction. It is
   the retirement path this design already describes for the mirror; this
   finding is an argument for taking it now instead of later.

Option 3 needs a CRS change and would make this a cross-repo piece of work, with
CRS merging first. Until the call is made, the requirements below describe
option 1, and `tasks.md` builds it.
