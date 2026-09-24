## 1. Frontend (test-first; after the registry change is deployed or mocked in tests)

- [x] 1.1 Types: `sourcePath`, `checkoutDirectory` on VCS entries; `warnings` on the detail response
- [x] 1.2 Failing component tests for each requirement, then the VCS tab fields and descriptions
- [x] 1.3 Override row editor: the two fields, Name read-only
- [ ] 1.4 Primary entry's Checkout Directory read-only (shown, not hidden) in both editors, with its description;
      `null` sent for it
- [ ] 1.5 Name read-only in both editors; stored Name sent unchanged
- [ ] 1.6 Server-error parser accepts `vcsEntries[<i>].<field>` and `fieldOverrides[<j>].vcsEntries[<i>].<field>`; route a prefixed error by the id of the row at index `<j>` of the list as sent; inline-error slot on VCS entry
      fields in both editors
- [ ] 1.7 Warning shown after save
- [ ] 1.8 `./gradlew qualityStatic` and the vitest suite green
