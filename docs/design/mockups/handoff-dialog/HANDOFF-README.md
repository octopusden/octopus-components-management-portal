# Handoff: present the Create / Clone Component wizard as a **large dialog** with a **vertical stepper**

## TL;DR for the implementer
The multi-step Create/Clone wizard **already exists on `develop`** as a **full-page route** with a
**horizontal** stepper (`pages/CreateComponentPage.tsx`, model in `lib/component/createFormModel.ts`).
This task is a **presentation change only**: show the same wizard as a **large modal dialog over the
components list**, with a **vertical left-rail stepper**. **Reuse all existing logic** (form model, zod
schema, step render functions, validation, submit, guards) — do **not** rewrite the wizard and do
**not** work from the exported HTML.

## About the design files
The bundled HTML is a **design reference** (a prototype) showing the target look & behavior — not code
to copy. Implement against the **existing React source** below. A prior attempt built from the exported
HTML and regressed; use this README + the real files.

Included design references:
- `Create Component Wizard — Dialog variant.html` — **the target**: large dialog, vertical stepper.
- `Create Component Wizard.html` — page render (reference only).
- `Create Component Wizard - Redesign.dc.html` — full prototype source (logic + layout), for behavior details.

## Fidelity
**High-fidelity** for structure, grouping, copy, and interactions. Reproduce with the app's own shadcn/ui
primitives + Tailwind tokens; do not lift the prototype's inline hex/px.

---

## What already exists on develop (reuse — do not rebuild)

**`pages/CreateComponentPage.tsx`**
- `CreateComponentPage()` — route component at **`/components/new`** (scratch) and
  **`/components/new?from={id}`** (clone). Wrapped in `<Layout>`. Handles source fetch
  (`useComponent`), `useComponentDefaults`, loading skeleton, then renders `CreateComponentWizard`.
- `CreateComponentWizard({ source, isClone, defaults })` — the actual wizard: react-hook-form
  (`useForm` + `zodResolver(makeCreateSchema(...))`), `useFieldArray` for ownership, all step render
  functions (`renderProfileStep` … `renderReviewStep`), `stepBody` map, `goToStep/goBack`, `current`,
  `invalidSteps`, server-error routing, `UnsavedChangesGuard`, submit via `useCreateComponent()` +
  `buildCreateRequest(values, source, editable)`.
- `CreateComponentButton()` — currently `navigate('/components/new')`.
- Steps: `StepId = 'profile'|'general'|'build'|'vcs'|'jira'|'distribution'|'review'`; `STEP_LABELS`;
  `SCRATCH_STEPS` / `CLONE_STEPS` (both list all 7 — clone keeps Profile, pre-derived & editable);
  `stepOfField(path)` maps validation errors → owning step.

**`lib/component/createFormModel.ts`** (all present, reuse verbatim)
- `ComponentProfile`, `PROFILE_META` (4 profiles, sanitized copy), `flagsForProfile`, `profileFromSource`,
  `componentKeyError`, `BASE_KEY_REGEX`.
- `makeCreateSchema(editable, supportedGroups, gitBaseUrl, profile, solutionPatterns)` — the zod schema
  (per-row ownership validation, gated explicit+external block, profile-dependent key rule, VCS rule).
- `initialValues(source, defaults)`, `SCRATCH_DEFAULTS`, `EMPTY_COORDINATE`, `seedVersionFormats`,
  `versionFormatsFromDefaults`, `ComponentDefaults`.
- `ownership` is already an **array** `{ groupId, mode, tokens }[]` (default `[{groupId:'',mode:'ALL',tokens:[]}]`).

**`lib/component/buildCreateRequest.ts`** — `CreateFormValues`, `buildCreateRequest`, `vcsBlockApplies`,
`VCS_HIDDEN_BUILD_SYSTEMS`, `DEPRECATED_BUILD_SYSTEMS`, `SSH_VCS_URL_REGEX`, `FALLBACK_VCS_BRANCH`.

**Shared controls already used** — `ui/dialog`, `ui/button`, `ui/input`, `ui/label`, `ui/badge`,
`ui/PeopleInput`, `ui/PeopleListInput`, `ui/ModeRadioGroup`, `ui/ArtifactTokensInput`, `ui/inline-error`,
`ui/status-banner`, `ui/skeleton-block`, `ui/FieldLabelText`, `ui/FieldInfo`, `editor/UnsavedChangesGuard`,
`lib/artifactOwnership` (`OWNERSHIP_MODES`), `lib/editor/jiraKey`
(`validateJiraKey`/`normalizeJiraKey`/`normalizeChangeComment`), `lib/conflict` (`classifyConflictBody`),
`lib/serverErrors` (`parseServerFieldErrors`), version preview in the Jira step.

### Current presentation (what changes)
- **Shell:** `<Layout>` route → `<form className="mx-auto max-w-4xl pb-24">`.
- **Header:** `h1` title (`Create component` / `Clone {name}`) + a ghost **Cancel** → `navigate('/components')`.
- **Clone banner:** Included / Excluded (re-enter) note.
- **Stepper:** **horizontal** — `<nav aria-label="Wizard steps" className="mb-8 flex flex-wrap gap-2">`
  with a button per step (number/`AlertCircle`, `STEP_LABELS`, active + invalid styling, `goToStep`).
- **Step body:** `<div className="max-w-2xl">{stepBody[current]()}</div>`.
- **Footer:** fixed bottom bar (`fixed inset-x-0 bottom-0 …`) with Back / Next|Create.

---

## Target change 1 — present as a large dialog (over the list)

Keep everything in `CreateComponentWizard` intact; change only the **outer shell** and the **entry point**.

**Option A (recommended, smallest diff): render the route inside a Dialog.**
- Keep the `/components/new` route and `CreateComponentPage` (URL-addressable, deep-linkable clone).
- Replace the page's `<Layout>{…}</Layout>` frame with a Radix `Dialog` (always `open`) whose
  `onOpenChange(false)` navigates back to `/components` (the list renders behind the dimmed overlay
  because the dialog is mounted over it). Reuse `ui/dialog.tsx`.
- The wizard's outer `<form className="mx-auto max-w-4xl pb-24">` becomes the dialog **card body**
  (flex column, full height); drop `mx-auto max-w-4xl pb-24` and the `fixed` footer — the footer becomes
  a normal sticky footer inside the card (see layout below).

**Option B: modal from the list without a route.**
- `CreateComponentButton` toggles local `open` state and renders `<CreateComponentDialog open .../>`
  instead of navigating; clone opens with a `sourceId`. Only choose this if you don't want the
  `/components/new` URL. (The existing route + `CommandPalette`/`ComponentDetailPage` "Create Similar"
  call sites make Option A less churny.)

**Dialog sizing (target look):** near-fullscreen with margins so the backdrop shows — the prototype uses
`width: min(1560px, 96vw); height: 96vh;` centered, `rounded-[14px]`, elevation shadow. Override
`DialogContent` to drop `sm:max-w-lg` and use roughly:
```
className="w-[96vw] max-w-[1560px] h-[96vh] p-0 overflow-hidden flex flex-col gap-0"
```

**Dialog internal layout (flex column card):**
1. **Header bar** — title (`Create component` / `Clone {name}`), optional subtitle, a **Clone** `Badge`
   in clone mode, and the Cancel/close (✕) on the right. (No app breadcrumb inside the dialog.)
2. **Body row** (`flex-1 min-h-0 flex`) — **vertical stepper rail** (left) + **scrollable step content**
   (right, `overflow-y-auto`, inner `max-w-2xl`). Move the existing Clone Included/Excluded banner to the
   top of the content column.
3. **Sticky footer** (inside the card, not `fixed`) — Back · `Step N of M` · Next / Create (spinner while
   `createMutation.isPending`).

## Target change 2 — vertical stepper (left rail)

Replace the horizontal `<nav … flex flex-wrap gap-2>` with a **vertical rail**. Same data
(`steps.map`, `current`, `invalidSteps`, `goToStep`, `STEP_LABELS`) — only layout changes:
```tsx
<nav aria-label="Wizard steps"
     className="w-64 shrink-0 border-r bg-card p-4 flex flex-col gap-1 overflow-y-auto">
  {steps.map((step, i) => {
    const active = step === current
    const invalid = invalidSteps.has(step)
    const done = !active && !invalid && visitedSteps.has(step) // add a visited set if not present
    return (
      <button key={step} type="button" onClick={() => goToStep(step)}
        aria-current={active ? 'step' : undefined}
        className={cn(
          'flex items-start gap-3 rounded-md px-3 py-2 text-left text-sm',
          active ? 'bg-muted font-medium' : 'hover:bg-muted',
          invalid && !active && 'text-destructive',
        )}>
        <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs',
          active ? 'border-primary bg-primary text-primary-foreground'
          : invalid ? 'border-destructive/50 text-destructive'
          : done ? 'border-emerald-600/40 bg-emerald-50 text-emerald-700'
          : 'border-border text-muted-foreground')}>
          {invalid ? <AlertCircle className="h-3.5 w-3.5" />
           : done ? <Check className="h-3.5 w-3.5" /> : i + 1}
        </span>
        <span className="flex flex-col">
          <span>{STEP_LABELS[step]}</span>
          <span className="text-xs text-muted-foreground">{STEP_SUBTITLES[step]}</span>
        </span>
      </button>
    )
  })}
</nav>
```
- Add a `STEP_SUBTITLES: Record<StepId,string>` next to `STEP_LABELS` (one-line hints):
  Profile "What are you creating?", General "Identity & ownership", Build "Build system & artifacts",
  VCS "Repository & branch", Jira "Project & versions", Distribution "Docker & coordinate",
  Review "Summary & save".
- **Vertical is the chosen orientation** (the large dialog has room for the full 7-step path with
  subtitles). Do not ship the horizontal bar.
- Optional: a `visitedSteps` set (mark on `goToStep`/Next) to show green ✓ on completed steps — the
  current code only tracks `invalidSteps`; a visited set makes the rail read like the prototype.

## Do not change (already correct on develop)
- Step order and gating: Profile → General → Build → VCS(always shown; fields conditional via
  `vcsBlockApplies`) → Jira → Distribution → Review; clone keeps an editable Profile.
- Profile model & derived flags (`flagsForProfile`), key rules (`componentKeyError`), zod schema.
- Produced Artifacts as **per-Group-ID array** (`ownership[]`, `useFieldArray`), modes `OWNERSHIP_MODES`
  (ALL / ALL_EXCEPT_CLAIMED / EXPLICIT), default `ALL`.
- Version formats (Line→Minor, Release→Build via `seedVersionFormats`) + live preview; no hotfix/full.
- Distribution: Docker always; Maven/Package coordinate gated on explicit+external.
- Review summary + Jira task key (`validateJiraKey`) + commit message; server 409 routing
  (`classifyConflictBody` + `stepOfField` → invalid step + banner).
- `UnsavedChangesGuard`, submit, toast, navigation on success.

---

## Interactions & behavior (unchanged, for reference)
- Stepper click-to-jump; Back/Next sequential; steps show current/invalid (and visited, if you add it).
- Cross-step validation marks any offending step invalid and shows a "Go to {step}" affordance.
- Async checks: Component Owner (directory) and Group ID / (Group,artifact) conflicts.
- Cancel with a dirty form → confirm discard (via `UnsavedChangesGuard`); backdrop click = close.
- Success → toast + navigate to the created component.

## State (unchanged)
react-hook-form values = `CreateFormValues`; local `profile`, `explicitAnswer`, `current`,
`invalidSteps` (+ optional `visitedSteps`), `submitted`. Submit → `buildCreateRequest` →
`useCreateComponent().mutateAsync`.

## Design tokens
Use the app's Tailwind/shadcn tokens (`background`/`card`/`muted`/`foreground`/`muted-foreground`/
`border`/`input`/`ring`/`primary`/`destructive`), `rounded-md`/`rounded-lg`, dialog card
`rounded-[14px]`. Status badge colors: green `#dcfce7`/`#166534`, blue `#dbeafe`/`#1e40af`, yellow
`#fef9c3`/`#854d0e` (re-enter/approx), red `#fee2e2`/`#991b1b`. Monospace for keys/coordinates/formats.
Both light & dark supported in the prototype; respect the app's current theme setup (light-only today).

## Assets
None — inline SVG icons only; use the app's `lucide-react` (`Check`, `ChevronLeft/Right`, `Plus`, `X`,
`AlertCircle` are already imported).

## Files to touch
- `pages/CreateComponentPage.tsx` — swap `<Layout>` frame for the `Dialog` shell; convert the stepper
  `<nav>` to the vertical rail; move footer inside the card; add `STEP_SUBTITLES` (+ optional `visitedSteps`).
- `components/ui/dialog.tsx` — reuse; only widen `DialogContent` via className at the call site.
- Optionally `CreateComponentButton` / call sites (`ComponentListPage`, `ComponentDetailPage`,
  `CommandPalette`) if you pick Option B (modal-without-route).
- No changes needed to `createFormModel.ts` / `buildCreateRequest.ts` / step render functions / shared controls.

## Visual deltas vs the current build (from the shipped screenshot)
The current `/components/new` matches the design in **content** but not in **presentation**. Fix these:

1. **Shell:** currently a full page under the app nav → make it a **large dialog** (`96vw × 96vh`,
   `max-w-[1560px]`, `rounded-[14px]`) over the **dimmed components list**. Remove the in-page
   `Create component` / `Cancel` header row; that title + Cancel(✕) live in the **dialog header bar**.
2. **Stepper:** currently a **horizontal chip row** (`Profile · General · Build · …`) → **vertical
   left rail** (see "Target change 2"): circle (number / ✓ / alert) + step title + one-line subtitle,
   current highlighted, connector look. All 7 steps visible.
3. **Profile tiles:** currently plain full-width stacked tiles with **no radio indicator, no selected
   state, single column** → match the prototype: **2-column grid**, each card has a **radio dot**
   (filled when selected) and a **selected highlight** (`border-ring` + `bg-muted`), tighter padding.
   Keep `PROFILE_META` copy. Below the grid add:
   - **"Has explicit distribution?" Yes/No** segmented control for the two **Regular** profiles only
     (`asksExplicit`), wired to `explicitAnswer` → `flagsForProfile`.
   - a read-only **recap**: "This component will be: **External/Internal** · **Explicit/Not explicit**"
     (chips) reflecting `flagsForProfile(profile, explicitAnswer)`.
4. **Eager validation:** the screenshot shows General/VCS/Jira/Review already **red** on first load.
   Only mark a step **invalid** once it's been **visited** or after a **Create attempt** — not before.
   (Add a `visitedSteps` set; compute `invalidSteps` ∩ (visited ∪ attempted). Current step never shows
   as invalid until the user leaves/submits.) This also feeds the green ✓ "done" state in the rail.

## Clone flow — deltas (also via this handoff)
Clone (`/components/new?from={id}`) uses the **same** wizard; align these specifics to the design:
- **Title:** `Clone {source.name}` + a **Clone `Badge`** in the dialog header.
- **Profile:** the Profile step stays, but it's **pre-derived** from the source (`profileFromSource`)
  and **editable** (changing it resets the Component Key + recomputes flags). It's **not a gate** in
  clone (a profile is always pre-selected) — so the user can jump straight ahead. Render the profile
  tiles + recap the same way as scratch.
- **Included / Excluded banner** at the top of the content column (already in code) — keep it, styled as
  a muted note.
- **Re-enter (amber) flags** on the unique-per-component fields: **Component Key**, **VCS Path**
  (when `vcsApplies`), **Jira Project Key**, **Distribution coordinate** — small amber "re-enter" pill
  + amber input border, exactly as in the prototype, so the user sees what must be new.


- `Create Component Wizard — Dialog variant.html` — target dialog + vertical stepper.
- `Create Component Wizard.html` — page reference.
- `Create Component Wizard - Redesign.dc.html` — prototype source (behavior spec).
