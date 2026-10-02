> Depends on CRS SYS-099 (`POST /rest/api/4/components/{id}/distribution/preview`).
> CRS merges first; the Portal re-vendors the v4 spec after.

## 1. API surface

- [ ] 1.1 Vendor the CRS spec carrying SYS-099 (`CRS_SPEC_REF=<branch> npm run vendor-spec`)
- [ ] 1.2 Failing tests in `hooks/useDistributionPreview.test.ts`: posts the
      version with the override and supported-version drafts; blank or
      whitespace version issues no request; maps a 400 to an invalid-input state
- [ ] 1.3 Implement `useDistributionPreview` following `useVersionPreview.ts`

## 2. Preview control and attribution

- [ ] 2.1 Failing tests in `DistributionTab.test.tsx` for every spec scenario of
      the control, attribution, Docker line and error states, mocking only
      `api.post`
- [ ] 2.2 Add the version box (debounced) and per-subsection attribution to
      `DistributionTab.tsx`
- [ ] 2.3 Pass the supported-versions draft from `ComponentDetailPage.tsx`

## 3. Winning row

- [ ] 3.1 Failing tests in `DistributionPerRange.test.tsx`: the winning row is
      marked, including an interior member of a coalesced group; conflict marks
      nothing; clearing clears
- [ ] 3.2 Mark the winning row in `DistributionPerRange.tsx`

## 4. Close out

- [ ] 4.1 `npm run lint`, `npm run typecheck`, `npm run test:coverage`
- [ ] 4.2 `./gradlew qualityStatic`
- [ ] 4.3 Update `docs/features/component-detail.md` — Distribution tab section
