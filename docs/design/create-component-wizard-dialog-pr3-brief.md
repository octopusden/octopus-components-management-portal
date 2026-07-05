# PR 3 — Create/Clone wizard как большой диалог + вертикальный stepper

> Бриф для новой сессии. Follow-up к уже смёрженному wizard'у (#162 editor-reorg + #163
> wizard). **Presentation-only** изменение: тот же wizard показать как **большой модал
> над списком компонентов** с **вертикальным stepper'ом слева** + несколько UX-полишей.
> **Логику не переписываем**, из HTML **не** работаем — только существующий React-код.
>
> Источник: handoff от Claude Design (снимок — `docs/design/mockups/handoff-dialog/`;
> живой артефакт: см. [share-link] в памяти `project_create_component_wizard_brief.md`).
> Handoff сверен с `origin/develop` — файлы/символы/презентация подтверждены.

## 0. Что уже есть на develop (переиспользовать, НЕ переписывать)

Проверено на `origin/develop`:
- **`frontend/src/pages/CreateComponentPage.tsx`** — роут `/components/new` (scratch) и
  `?from={id}` (clone), обёрнут в `<Layout>`. Внутри `CreateComponentWizard(...)`:
  react-hook-form + `zodResolver(makeCreateSchema(...))`, `useFieldArray` (ownership),
  step-render функции (`renderProfileStep`…`renderReviewStep`), `stepBody`-map,
  `goToStep/goBack`, `current`, `invalidSteps`, server-error routing,
  `UnsavedChangesGuard`, submit → `useCreateComponent()` + `buildCreateRequest(...)`.
- Символы: `StepId = profile|general|build|vcs|jira|distribution|review`, `STEP_LABELS`,
  `SCRATCH_STEPS`/`CLONE_STEPS` (оба перечисляют все 7; clone держит editable Profile),
  `stepOfField(path)`. **`visitedSteps` в коде НЕТ** — добавить (см. §3.4).
- **`lib/component/createFormModel.ts`** — `ComponentProfile`, `PROFILE_META` (4 профиля,
  sanitized copy), `flagsForProfile`, `profileFromSource`, `componentKeyError`,
  `BASE_KEY_REGEX`, `makeCreateSchema(...)`, `initialValues`, `SCRATCH_DEFAULTS`,
  `seedVersionFormats`. `ownership` — уже массив `{groupId,mode,tokens}[]`, дефолт
  `[{groupId:'',mode:'ALL',tokens:[]}]`.
- **`lib/component/buildCreateRequest.ts`** — `buildCreateRequest`, `vcsBlockApplies`,
  `VCS_HIDDEN_BUILD_SYSTEMS`, `SSH_VCS_URL_REGEX`, `FALLBACK_VCS_BRANCH`.
- Текущая презентация (это и меняем): `<Layout>` → `<form className="mx-auto max-w-4xl
  pb-24">`; **горизонтальный** stepper (`<nav aria-label="Wizard steps" flex flex-wrap
  gap-2>`); `fixed inset-x-0 bottom-0` footer.

## 1. Цель (что меняем)

Только **внешняя оболочка** + **stepper** + несколько UX-деталей. Всё внутри
`CreateComponentWizard` — как есть.

### 1.1. Оболочка → большой диалог над списком
- **Option A (рекомендованная, минимальный диф):** сохранить роут `/components/new` и
  `CreateComponentPage`; заменить `<Layout>{…}</Layout>` на Radix `Dialog` (always `open`),
  `onOpenChange(false)` → `navigate('/components')`. Реюз `ui/dialog.tsx`.
- `DialogContent` расширить **только на call-site** (className), не трогая глобальный
  `sm:max-w-lg`: `w-[96vw] max-w-[1560px] h-[96vh] p-0 overflow-hidden flex flex-col
  gap-0`, `rounded-[14px]`.
- Внутренняя раскладка карточки (flex-column):
  1. **Header bar** — заголовок (`Create component` / `Clone {name}`), в clone —
     `Clone` badge, справа Cancel/✕. Без app-breadcrumb внутри.
  2. **Body row** (`flex-1 min-h-0 flex`) — вертикальный stepper-rail слева +
     скроллируемый контент справа (`overflow-y-auto`, внутр. `max-w-2xl`). Clone
     Included/Excluded баннер — наверх контент-колонки.
  3. **Sticky footer** внутри карточки (не `fixed`) — Back · `Step N of M` · Next/Create
     (спиннер при `createMutation.isPending`).

> **⚠️ Решить при реализации — «список за диалогом».** `/components/new` — отдельный
> роут; список сам по себе под ним НЕ смонтирован. Чтобы список реально был виден за
> затемнением, нужно рендерить wizard как **overlay/pathless-роут поверх `/components`**
> (или согласиться на нейтральный затемнённый фон). Не полагаться на формулировку
> handoff «список рендерится позади» без этого. (Option B — модалка из списка без роута —
> даёт список за диалогом бесплатно, но теряет URL/deep-link clone; выбрана Option A.)

### 1.2. Вертикальный stepper (левый rail)
Заменить горизонтальный `<nav flex flex-wrap>` на вертикальный rail (`w-64 shrink-0
border-r bg-card p-4 flex flex-col gap-1`). Данные те же (`steps.map`, `current`,
`invalidSteps`, `goToStep`, `STEP_LABELS`). Каждый пункт: кружок (номер / ✓ done /
`AlertCircle` invalid) + title + one-line subtitle. Все 7 шагов видны.
- Добавить **`STEP_SUBTITLES: Record<StepId,string>`** рядом с `STEP_LABELS`:
  Profile «What are you creating?», General «Identity & ownership», Build «Build system
  & artifacts», VCS «Repository & branch», Jira «Project & versions», Distribution
  «Docker & coordinate», Review «Summary & save».

## 2. UX-полиши (в том же PR)

### 2.1. Profile-карточки (§ handoff 3.3)
Сейчас — плоские full-width карточки, без radio и selected-состояния. Сделать:
- **2-колоночная сетка**, каждая карточка — **radio-dot** (заполнен при выборе) +
  **selected-highlight** (`border-ring` + `bg-muted`), плотнее паддинги. Copy из
  `PROFILE_META` — как есть.
- Под сеткой: **«Has explicit distribution?» Yes/No** сегмент — **только** для двух
  Regular-профилей (`asksExplicit`), привязан к `explicitAnswer` → `flagsForProfile`.
- Read-only **recap**: «This component will be: **External/Internal** · **Explicit/Not
  explicit**» (чипы) из `flagsForProfile(profile, explicitAnswer)`.

### 2.2. Fix eager-валидации (§ handoff 3.4 — важно)
Сейчас General/VCS/Jira/Review красные **сразу при загрузке** (видно на скрине).
Помечать шаг **invalid** только после того как он **visited** или после попытки
**Create** — не раньше. Ввести `visitedSteps` (отмечать на `goToStep`/Next); показывать
invalid = `invalidSteps ∩ (visited ∪ attempted)`; текущий шаг не invalid, пока не
ушли/не сабмитнули. Это же питает зелёный ✓ «done» в rail'е.

### 2.3. Clone-деталь: amber «re-enter»
На уникальных полях (**Component Key**, **VCS Path** при `vcsApplies`, **Jira Project
Key**, **Distribution coordinate**) — маленький amber «re-enter» pill + amber-border
инпута, чтобы пользователь видел что вводить заново. Included/Excluded баннер — muted-нота
наверху контента.

## 3. НЕ менять (уже корректно на develop)
Порядок и гейтинг шагов; profile-модель и `flagsForProfile`; key-rules (`componentKeyError`);
zod-схема; **Produced Artifacts как per-Group-ID массив** (`ownership[]`, `useFieldArray`,
дефолт `ALL`); version formats (Line→Minor, Release→Build; без hotfix/full) + preview;
Distribution: **Docker always / Maven-Package gated** на explicit+external; Review summary
+ Jira key + 409-routing (`classifyConflictBody` + `stepOfField`); `UnsavedChangesGuard`,
submit, toast, навигация на успех.

## 4. Файлы (Option A)
- `pages/CreateComponentPage.tsx` — `<Layout>`→Dialog shell; stepper→вертикальный rail;
  footer внутрь карточки; `STEP_SUBTITLES`; `visitedSteps`; profile-карточки grid+radio+recap;
  eager-validation fix; clone amber re-enter.
- `components/ui/dialog.tsx` — реюз; расширить `DialogContent` только на call-site.
- Модель/билдер/step-render функции/shared-контролы — **без изменений**.

## 5. Открытое решение для владельца
- **Подтвердить разворот презентации page → dialog.** Ранее осознанно выбирали
  отдельную страницу-роут; теперь диалог. Option A сохраняет роут (URL/deep-link/clone
  целы) → это по сути косметика (96vw×96vh ≈ почти полноэкранно), но это разворот —
  подтвердить намеренность.

## 6. Как работать (правила репо)
- Ветка от свежего `origin/develop` (fetch первым делом), worktree **рядом** с репо
  (`../octopus-components-management-portal-wt/<name>`), не основной checkout.
- **TDD:** failing test first, по слою/компоненту; после каждого impl-коммита — Sonnet
  review-subagent. Ключ задачи для CRS/portal не нужен; пуш — по явной просьбе.
- Запрещённые токены (имя организации/вендора, аббревиатура подразделения разработки,
  продуктовые/классификационные имена, внутренние wiki-ссылки) — нигде (CI content-validation).
- `package-lock.json`/node — через Gradle Node, не системный.
- E2E не в PR-CI — при правках editor-copy-component/route обновить `frontend/e2e` и
  прогнать на стенде.
