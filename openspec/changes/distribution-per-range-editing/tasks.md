> Blocked on one decision. These tasks build option 1 from design.md —
> dot-numeric versions only. If the answer is the registry-side endpoint
> (option 3), groups 1 and 2 are replaced by a CRS change that merges first,
> and groups 3 to 5 largely survive. Do not start group 1 before that call.

## 1. Range containment predicate

- [ ] 1.1 Failing tests in `lib/versionRange.test.ts` for `rangeContainsVersion`:
      inclusive and exclusive bounds, open upper bound, `ALL_VERSIONS`, a version
      on each boundary, and a blank or unparseable range returning a distinct
      "cannot evaluate" outcome rather than true or false
- [ ] 1.2 Implement `rangeContainsVersion` in `lib/versionRange.ts` on top of
      `parseSimpleSegment`, returning the tri-state result — the two call sites
      reduce it oppositely (design.md), so it must not collapse to a boolean

## 2. Resolution module

- [ ] 2.1 Failing tests in `components/editor/distributionResolution.test.ts`
      covering every scenario in the spec: covering override wins, paths resolve
      independently, no-match falls back to base, gap falls back to base, empty
      override resolves to nothing-published, version outside supported set
      resolves to no-configuration, component without coverage restriction
      resolves normally, unparseable override range never wins and is reported,
      overlapping same-path overrides report a conflict, and — the opposite
      reduction — a blank or unparseable entry in the supported-version data
      counts as covering so the preview still resolves
- [ ] 2.2 Implement `resolveDistributionForVersion` returning a tagged result per
      marker path — `base` / `override` (with the winning row) / `nothing` /
      `conflict` / `unevaluable` — plus a component-level `unsupported` outcome
- [ ] 2.3 Comment naming the registry function this mirrors, per design.md

## 3. Preview control on the tab

- [ ] 3.1 Failing tests in `DistributionTab.test.tsx`: entering a version leaves
      Save disabled and issues no request; the control is usable without edit
      rights while add/edit/delete stay disabled; an invalid version reports
      itself and shows no result; a qualified version (`1.2-0003`, `2.1.0-RC1`)
      is declined as not evaluable rather than reported malformed; blank and
      whitespace-only input show neither result nor error; clearing the control
      restores the unfiltered view; navigating to another component and back
      leaves the control empty
- [ ] 3.2 Add the version input to `DistributionTab.tsx`, wired to the shared
      override draft rather than the saved component, and reset it when the
      component id changes
- [ ] 3.2a Extend `DistributionTabProps` with supported-version state and pass
      it from the `ComponentDetailPage` call site, sourced from the existing
      `useSupportedVersionsSection` draft (sibling hook at the same call site —
      no new fetch); today the tab receives only `section`, `canEdit` and
      `supportedGroups`
- [ ] 3.3 Failing test for the unsupported-version case: the tab states there is
      no configuration at that version and no subsection renders children
- [ ] 3.4 Render the component-level outcomes (unsupported, invalid input)

## 4. Per-path presentation

- [ ] 4.1 Failing tests in `DistributionPerRange.test.tsx`: the winning row is
      marked and others are not; a winner in the interior of a coalesced
      multi-member group marks that group; marking clears with the preview; a
      conflict renders as a conflict rather than a winner
- [ ] 4.2 Mark the winning row and render conflict / unevaluable states in
      `DistributionPerRange.tsx`
- [ ] 4.3 Failing test that each subsection attributes its children to either a
      range or the component level, including the empty-override case
- [ ] 4.4 Render source attribution per subsection in `DistributionTab.tsx`

## 5. Close out

- [ ] 5.1 `npm run lint`, `npm run typecheck`, `npm run test:coverage`, and
      `./gradlew qualityStatic`
- [ ] 5.2 Update `docs/features/component-detail.md` — Distribution tab section
- [ ] 5.3 Archive the change: fold the delta into `openspec/specs/` and confirm
      it does not contradict `docs/features/component-detail.md`
- [ ] 5.4 Close issue #146 — its remaining acceptance criterion is this change
