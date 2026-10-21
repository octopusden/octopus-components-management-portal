> Frontend only: every task runs under npm/vitest in `frontend/`. No backend task.
>
> Stacks on `create-component-from-template`, which must merge first.
>
> Test-first: each behaviour task starts with a failing test.

## 1. The permission and the create check

- [x] 1.1 Failing tests in `frontend/src/lib/auth.test.ts` for `canStartCreate(user)`:
  - [x] 1.1.1 `CREATE_COMPONENTS` only → true
  - [x] 1.1.2 `CREATE_FROM_TEMPLATE` only → true
  - [x] 1.1.3 both → true
  - [x] 1.1.4 neither (`ACCESS_COMPONENTS`, `ACCESS_AUDIT`) → false
  - [x] 1.1.5 `null` / `undefined` user → false
- [x] 1.2 Implement in `frontend/src/lib/auth.ts`:
  - [x] 1.2.1 `PERMISSIONS.CREATE_FROM_TEMPLATE`
  - [x] 1.2.2 `canStartCreate(user)` — either create permission
- [x] 1.3 Confirm tests pass. Red 5/24 before, `auth.test.ts` 24/24 after.

## 2. New Component on the component list

- [x] 2.1 Failing tests in `frontend/src/pages/ComponentListPage.test.tsx`:
  - [x] 2.1.1 shows "New Component" for a user with `CREATE_FROM_TEMPLATE` only
  - [x] 2.1.2 does not pass `onCopy` for a user with `CREATE_FROM_TEMPLATE` only — no Copy
        trigger rendered. Green on first run: it pins the existing gate.
  - [x] 2.1.3 existing: shown for `CREATE_COMPONENTS`, hidden for a viewer — still pass unchanged
- [x] 2.2 Implement in `ComponentListPage.tsx`: the New Component button gated on
      `canStartCreate` (`canStartNew`); `onCopy` stays on `CREATE_COMPONENTS` (`canCopy`).
- [x] 2.3 Confirm tests pass. List and palette suites 59/59.

## 3. New Component in the command palette

- [x] 3.1 Failing tests in `frontend/src/components/CommandPalette.test.tsx`:
  - [x] 3.1.1 offers "New Component" for a user with `CREATE_FROM_TEMPLATE` only, and choosing it
        navigates to `/components/new`
  - [x] 3.1.2 existing: hidden without either permission — still passes unchanged
- [x] 3.2 Implement in `CommandPalette.tsx`: the action gated on `canStartCreate`.
- [x] 3.3 Confirm tests pass (with 2.3).

## 4. Clone stays with CREATE_COMPONENTS

- [x] 4.1 Test in `frontend/src/pages/ComponentDetailPage.test.tsx` (Clone gate block): Clone is
      not rendered for a user with `CREATE_FROM_TEMPLATE` only. Green on first run, as expected;
      no production change.
- [x] 4.2 Confirm tests pass. Clone block 4/4.

## 5. Review read-only without CREATE_COMPONENTS

- [x] 5.0 The page test mocked the current user as `undefined`, which would now read as "may not
      override". It now defaults to a named `CREATE_COMPONENTS` user, switchable per test; the 29
      existing tests passed unchanged with it before any new test. (added on review)
- [x] 5.1 Failing tests in `frontend/src/pages/CreateComponentPage.templates.test.tsx`, as a user
      with `CREATE_FROM_TEMPLATE` only:
  - [x] 5.1.1 the Profile step shows regular tiles disabled with the registry's reason and no
        profile selected; a template tile can be picked. Green on first run: `create-component-from-template` already does this.
  - [x] 5.1.2 on Review, an overridable field renders no input, only its value
  - [x] 5.1.3 on Review of a template with an overridable field, "Values come from the template
        and cannot be changed." is shown once
  - [x] 5.1.4 on Review of a template with no overridable field, the note is absent
  - [x] 5.1.5 the dry run and the create request carry `overrides: {}` (what `templateRunBody`
        sends with no override)
  - [x] 5.1.6 Create succeeds and shows the success panel
  - [x] 5.1.7 as a user with `CREATE_COMPONENTS`, no note is shown; the existing override tests
        pass unchanged
- [x] 5.2 Implement: `TemplateWizard` takes `canOverride`, passes `readOnly={!canOverride}` to
      `TemplateReview`, and renders the note above it when the template has an overridable field.
      `CreateComponentPage` computes `canOverride` from the user it already reads. The note lives
      in the wizard, not in `TemplateReview`, so the administrators' Try it shows none.
- [x] 5.3 Confirm tests pass. Red on 5.1.2 and 5.1.3 before; page suite 35/35 after.

## 6. Docs

- [x] 6.1 `docs/features/create-component.md`: who sees New Component (either permission), Copy
      and Clone (`CREATE_COMPONENTS`), no route guard, and that overrides need
      `CREATE_COMPONENTS`.

## 7. Finalization

- [x] 7.1 In `frontend/`, Node 24: `vitest run` 194 files, 3067 tests, 0 failures;
      `npm run typecheck` clean; `npm run lint` clean.
- [x] 7.2 Out-of-scope boundaries hold (`git diff --stat`, grep):
  - [x] 7.2.1 no route guard added to `/components/new` (`App.tsx` unchanged)
  - [x] 7.2.2 no Portal copy of the registry's unusable reason — "templates only" appears only in
        `CreateComponentPage.templates.test.tsx`
  - [x] 7.2.3 `TemplatesPanel` unchanged
  - [x] 7.2.4 no BFF, `v4.json` or `schema.d.ts` change
