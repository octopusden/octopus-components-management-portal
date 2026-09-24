## 1. Frontend (test-first; after the registry change is deployed or mocked in tests)

- [ ] 1.1 Types: `sourcePath`, `checkoutDirectory` on VCS entries; `warnings` on the detail response
- [ ] 1.2 Failing component tests for each requirement, then the VCS tab fields and descriptions
- [ ] 1.3 Override row editor: the two fields, Name read-only
- [ ] 1.4 Name read-only in both editors; stored Name sent unchanged
- [ ] 1.5 Server-error parser accepts `vcsEntries[<i>].<field>` and `fieldOverrides[<j>].vcsEntries[<i>].<field>`; route a prefixed error by the id of the row at index `<j>` of the list as sent; inline-error slot on VCS entry
      fields in both editors
- [ ] 1.6 Warning shown after save
- [ ] 1.7 `./gradlew qualityStatic` and the vitest suite green
