## Context

The registry resolves a component at a concrete version like this: if the
component restricts its supported versions and the version is outside them,
nothing resolves and the read returns not-found; otherwise, per marker
attribute, the override whose range contains the version replaces the base
children outright, and without one the base children apply (CRS ADR-018,
`version-model-spec.md` §3, MIG-036, MIG-042).

Version ordering in the registry handles qualified shapes (`1.2-0003`,
`2.1.0-RC1`, `1.0.0-SNAPSHOT`) that the Portal's dot-numeric range helpers do
not. A client-side mirror would either decline those versions — a large share of
real components — or duplicate the registry's ordering, where a subtly different
second copy does the most damage.

## Goals / Non-Goals

**Goals:**

- The registry is the only implementation of resolution; the Portal renders its
  verdict.
- The preview reflects the unsaved drafts the user is looking at.
- Explicit, visible failure whenever no answer can be justified.

**Non-Goals:**

- Scalar-override or ownership resolution. Only the `distribution.*` marker
  paths.
- Marking winning rows on the Docker tab. The Distribution tab's preview reports
  the Docker verdict in one line; marking rows there can follow if asked for.
  Generic artifacts (`distribution.generic`) have no Portal editor yet, so their
  verdict is one line naming the range, without children.

## Decisions

**A stateless CRS endpoint resolves a candidate state.**
`POST /rest/api/4/components/{idOrName}/distribution/preview` with
`{ version, fieldOverrides?, supportedVersions? }`. `fieldOverrides` is the
full `FieldOverrideUpsertRequest[]` the combined Save would send, and replaces
the saved set — a deleted draft row is simply absent. `supportedVersions` is
`{ all, ranges }`. Either one omitted means "use what is saved". The response
is a verdict, not children, with one entry per `distribution.*` family (Docker
included) and `paths: []` when unsupported:

```
{ version, supported,
  paths: [{ attribute, source: BASE | OVERRIDE | CONFLICT,
            matchedRanges: [..], unevaluableRanges: [..] }] }
```

The Portal already holds every child list it would display — base lists in the
section state, override children in the draft — so it pairs the verdict with
them locally. Returning children would add a mapping layer for data the client
already has.

**The preview reads the drafts, not the server.** Per-range edits and supported
versions both ride the combined Save. Previewing saved state while the user
looks at unsaved rows would be misleading, so both drafts are sent.

**Unsupported is a verdict, not a 404.** The real read returns 404 outside the
supported set; the preview returns `supported: false` so "this component has no
configuration at that version" is distinguishable from "no such component".

**Overlap is reported, not resolved.** The registry's positional pick among
same-attribute overrides is well-defined only because saved ranges are
disjoint. A draft has not been through that validation, so where several
candidate overrides on one path contain the version the endpoint answers
`CONFLICT` with every matching range instead of picking one.

**Unparseable ranges follow the registry per path.** An override range that does
not parse never matches and is listed in `unevaluableRanges`, so the tab can warn
that the path's answer may be incomplete. A supported-version range that does
not parse counts as covering — the registry's gate is conservative in that
direction, preferring to serve a configuration over a false not-found.

**The winning row is identified by echoed range text.** CRS echoes each matched
range exactly as sent, so the Portal finds the draft row by attribute and
`versionRange` string. The per-range list renders contiguous same-value
overrides as one row, so the row containing that member is the one marked.

**Debounced, cached, read-only.** The typed version is debounced (350 ms);
draft edits are discrete actions and re-request at once. React-query caches by
the request content, with no retries. The only 400 is an unparseable version,
shown as invalid input; candidate data never fails the request. No request is
sent until both drafts have loaded, so a missing draft is never read as "no
overrides" or "unrestricted"; a draft that failed to load is omitted and the
registry uses the saved state.

## Risks / Trade-offs

- **A request per settled version or draft edit.** Bounded by the debounce and
  cache; the
  endpoint touches one component and no external service.
- **The preview is only as current as the drafts sent.** Both drafts are sent on
  every request, so there is nothing to go stale between them.
