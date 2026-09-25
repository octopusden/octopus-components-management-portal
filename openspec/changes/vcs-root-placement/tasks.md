## 1. Frontend, revision 2 parts that stand (implemented)

- [x] 1.1 Types: `sourcePath`, `checkoutDirectory` on VCS entries; `warnings` on the detail response
- [x] 1.2 VCS tab and override row editor: Source Path and Checkout Directory fields with
      descriptions; Name read-only, stored Name sent unchanged
- [x] 1.3 Server-error parser accepts `vcsEntries[<i>].<field>` and
      `fieldOverrides[<j>].vcsEntries[<i>].<field>`; a prefixed error is routed by the id of the row
      at index `<j>` of the list as sent; inline-error slot on VCS entry fields in both editors
- [x] 1.4 Warning shown after save

## 2. Revision 3 (test-first; after the registry change is deployed or mocked in tests)

- [x] 2.1 Checkout Directory editable on every entry in both editors; remove the read-only first
      entry, `PRIMARY_CHECKOUT_DIRECTORY_HINT` and the forced empty value (`useVcsSection.ts:93-94`,
      `OverrideRowEditor.tsx:415`); descriptions updated
- [ ] 2.2 Types: `buildWorkingDirectory` on the base configuration request/response and the VCS
      marker payload; re-vendor `v4.json` from the registry branch
- [x] 2.3 Build Working Directory field on the VCS tab and in the VCS override row editor, with its
      description; blank sends `''` on the base row (`null` would leave the stored value) and
      `null` on a VCS override row
- [ ] 2.4 Server-error parser and routing for `buildWorkingDirectory` and
      `fieldOverrides[<j>].buildWorkingDirectory`
- [ ] 2.5 `./gradlew qualityStatic` and the vitest suite green
