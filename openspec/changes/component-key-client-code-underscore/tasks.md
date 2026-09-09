> Frontend-only change (`frontend/`, npm/vitest). No backend (Gradle/Kotlin) group:
> the BFF proxies CRS's v4 API unchanged and no OpenAPI shape moves.
>
> Depends on CRS `feat/component-key-client-code-underscore` (SYS-095, ADR-020)
> reaching CRS `main` first — CRS is the enforcing side, this is its pre-submit mirror.
>
> Test-first: each behaviour task starts with a failing test.

## 1. The rule (shared predicate)

- [x] 1.1 Failing test: `componentKeyError` accepts `ab_cd-payments` when the Client Code is `AB_CD`
- [x] 1.2 Failing test: it rejects `ab_cd-payments` when the Client Code is empty
- [x] 1.3 Failing test: it accepts the bare prefix `ab_cd` with Client Code `AB_CD`
- [x] 1.4 Failing test: it rejects `payments-ab_cd` (the prefix must lead)
- [x] 1.5 Failing test: it rejects `AB_CD-payments` (uppercase key)
- [x] 1.6 Failing test: a Client Code with no `_` (`ABCD`) grants no underscore
- [x] 1.7 Failing test: the message names the `ab_cd` prefix when a Client Code exists;
      the generic charset message is used when it does not
- [x] 1.8 Extend `componentKeyError` in `frontend/src/lib/component/createFormModel.ts`
      with the client-code parameter and the relaxed rule

## 2. Create wizard

- [x] 2.1 Failing test: the wizard accepts `ab_cd-payments` with Client Code `AB_CD`
- [x] 2.2 Failing test: the wizard flags `ab_cd-payments` with no Client Code
- [x] 2.3 Failing test: clearing the Client Code re-flags a previously legal key
      (no interaction with the key field)
- [x] 2.4 Wire the Client Code into the schema's key rule + `trigger('name')` on
      Client Code change in `CreateComponentPage.tsx`

## 3. Rename (component editor, General tab)

> The editor's form is default-mode with a custom save handler, so an RHF field
> validator would never fire on change. The check is derived from watched values and
> rendered in the existing `errors.name` slot instead — which also makes the
> client-code re-validation free (no `trigger` needed on this surface).

- [x] 3.1 Failing test: renaming to `ab_cd-payments` is accepted when the component's
      Client Code is `AB_CD`
- [x] 3.2 Failing test: renaming to `ab_cd-payments` is rejected when the component has
      no Client Code
- [x] 3.3 Failing test: a component whose Client Code is populated but hidden by
      field-config still accepts the rename
- [x] 3.4 Add the check to the General tab's name field + re-validate on Client Code change

## 4. Docs

- [x] 4.1 `CONTEXT.md` — Component Key / Client Code / client-code prefix / Display Name
      / Rename (done as part of this change's design)
- [x] 4.2 `docs/features/component-detail.md` + create-wizard docs mention the rule and
      link CRS ADR-020
- [x] 4.3 No `AGENTS.md` change: the rule is documented inside the already-indexed
      `docs/features/component-detail.md`, and no new feature doc was added

## 5. Checks

- [x] 5.1 `npm run lint` + `npx vitest run` on the touched suites
- [x] 5.2 `./gradlew qualityStatic` (Portal) — no Kotlin touched, frontend gates are npm
- [x] 5.3 `/ponytail-review` pass over the diff before the PR

## 6. Archive (after merge)

- [ ] 6.1 Fold this delta into `openspec/specs/` and drop the change artifact, per
      `openspec/config.yaml`'s archive guidance and the living-document rule in `AGENTS.md`.
      Deliberately left for after merge, not before: the proposal and spec are what
      reviewers are reading on this PR, and the repo's precedent (`registered-build-parameters-display`)
      keeps a merged change directory until its archive pass.
- [ ] 6.2 While archiving, re-check that `docs/features/component-detail.md` still tells the
      same story as the folded spec — the two must not contradict each other.
