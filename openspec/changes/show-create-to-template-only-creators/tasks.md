> Frontend only: every task runs under npm/vitest in `frontend/`. No backend task.
>
> Stacks on `create-component-from-template`, which must merge first.
>
> Test-first: each behaviour task starts with a failing test.

## 1. The permission and the create check

- [ ] 1.1 Failing tests in `frontend/src/lib/auth.test.ts` for `canStartCreate(user)`:
  - [ ] 1.1.1 `CREATE_COMPONENTS` only → true
  - [ ] 1.1.2 `CREATE_FROM_TEMPLATE` only → true
  - [ ] 1.1.3 both → true
  - [ ] 1.1.4 neither (`ACCESS_COMPONENTS`, `ACCESS_AUDIT`) → false
  - [ ] 1.1.5 `null` / `undefined` user → false
- [ ] 1.2 Implement in `frontend/src/lib/auth.ts`:
  - [ ] 1.2.1 `PERMISSIONS.CREATE_FROM_TEMPLATE`
  - [ ] 1.2.2 `canStartCreate(user)` — either create permission
- [ ] 1.3 Confirm tests pass.

## 2. New Component on the component list

- [ ] 2.1 Failing tests in `frontend/src/pages/ComponentListPage.test.tsx`:
  - [ ] 2.1.1 shows "New Component" for a user with `CREATE_FROM_TEMPLATE` only
  - [ ] 2.1.2 does not pass `onCopy` for a user with `CREATE_FROM_TEMPLATE` only — no Copy
        trigger rendered
  - [ ] 2.1.3 existing: shown for `CREATE_COMPONENTS`, hidden for a viewer — still pass unchanged
- [ ] 2.2 Implement in `ComponentListPage.tsx`: the New Component button gated on
      `canStartCreate`; `onCopy` stays on `CREATE_COMPONENTS`.
- [ ] 2.3 Confirm tests pass.

## 3. New Component in the command palette

- [ ] 3.1 Failing tests in `frontend/src/components/CommandPalette.test.tsx`:
  - [ ] 3.1.1 offers "New Component" for a user with `CREATE_FROM_TEMPLATE` only, and choosing it
        navigates to `/components/new`
  - [ ] 3.1.2 existing: hidden without either permission — still passes unchanged
- [ ] 3.2 Implement in `CommandPalette.tsx`: the action gated on `canStartCreate`.
- [ ] 3.3 Confirm tests pass.

## 4. Clone stays with CREATE_COMPONENTS

- [ ] 4.1 Test in `frontend/src/pages/ComponentDetailPage.test.tsx` (Clone gate block): Clone is
      not rendered for a user with `CREATE_FROM_TEMPLATE` only. Expected green on first run —
      this pins the gate, no production change.
- [ ] 4.2 Confirm tests pass.

## 5. Review read-only without CREATE_COMPONENTS

- [ ] 5.1 Failing tests in `frontend/src/pages/CreateComponentPage.templates.test.tsx`, as a user
      with `CREATE_FROM_TEMPLATE` only:
  - [ ] 5.1.1 the Profile step shows regular tiles disabled with the registry's reason and no
        profile selected; a template tile can be picked
  - [ ] 5.1.2 on Review, an overridable field renders no input and no "changed from template"
        control
  - [ ] 5.1.3 on Review of a template with an overridable field, "Values come from the template
        and cannot be changed." is shown once
  - [ ] 5.1.4 on Review of a template with no overridable field, the note is absent
  - [ ] 5.1.5 the dry run and the create request carry no `overrides` (or an empty one — match
        what `templateRunBody` sends today)
  - [ ] 5.1.6 Create succeeds and shows the success panel
  - [ ] 5.1.7 as a user with `CREATE_COMPONENTS`, overridable fields stay editable and no note is
        shown — existing override tests pass unchanged
- [ ] 5.2 Implement in `TemplateWizard.tsx`: pass `readOnly` to `TemplateReview` when the user
      lacks `CREATE_COMPONENTS`, and render the note above it when the template has an
      overridable field. The note lives in the wizard, not in `TemplateReview`, so the
      administrators' Try it (also `readOnly`) shows none.
- [ ] 5.3 Confirm tests pass.

## 6. Docs

- [ ] 6.1 `docs/features/create-component.md`: who sees New Component (either permission), Copy
      and Clone (`CREATE_COMPONENTS`), and that overrides need `CREATE_COMPONENTS`.

## 7. Finalization

- [ ] 7.1 `npm run test:run`, `npm run typecheck`, `npm run lint` in `frontend/` — record counts.
- [ ] 7.2 Out-of-scope boundaries hold:
  - [ ] 7.2.1 no route guard added to `/components/new` (`App.tsx` unchanged)
  - [ ] 7.2.2 no Portal copy of the registry's unusable reason (grep for "templates only" in
        `frontend/src` finds tests only)
  - [ ] 7.2.3 `TemplatesPanel` unchanged
  - [ ] 7.2.4 no BFF, `v4.json` or `schema.d.ts` change
