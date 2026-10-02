> Depends on CRS SYS-099 (`POST /rest/api/4/components/{idOrName}/distribution/preview`).
> CRS merges first; the Portal re-vendors the v4 spec from `main` after.

## 1. API surface

- [x] 1.1 Vendor the CRS spec carrying SYS-099 from the CRS branch
      (`CRS_SPEC_REF=<branch> npm run vendor-spec`); re-vendor from `main` after
      CRS merges
- [x] 1.2 Failing tests in `hooks/useDistributionPreview.test.ts`: posts the
      version with the override and supported-version drafts; blank or
      whitespace version issues no request; maps a 400 to an invalid-input state
- [x] 1.3 Implement `useDistributionPreview` following `useVersionPreview.ts`

## 2. Preview control and attribution

- [x] 2.1 Failing tests in `DistributionTab.test.tsx` for every spec scenario of
      the control, attribution, Docker line and error states, mocking only
      `api.post`
- [x] 2.2 Add the version box (debounced) and per-subsection attribution to
      `DistributionTab.tsx`
- [x] 2.3 Failing page test in `ComponentDetailPage` tests: entering a version
      keeps Save disabled and sends no write; the preview works for a user
      without `canEdit`; the supported-versions draft reaches the request
- [x] 2.4 Pass the supported-versions draft from `ComponentDetailPage.tsx`

## 3. Winning row

- [x] 3.1 Failing tests in `DistributionPerRange.test.tsx`: the winning row is
      marked, including an interior member of a coalesced group; conflict marks
      nothing; clearing clears
- [x] 3.2 Mark the winning row in `DistributionPerRange.tsx`

## 4. Close out

- [ ] 4.1 `npm run lint`, `npm run typecheck`, the touched vitest suites, `npm run test:coverage`
- [ ] 4.2 `./gradlew qualityStatic`
- [ ] 4.3 Update `docs/features/component-detail.md` — Distribution tab section
