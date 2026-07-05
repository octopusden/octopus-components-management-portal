# План реализации — Create Component wizard

> Утверждённый план реализации по брифу `create-component-wizard-brief.md`
> (+ `…-iteration-2-changes.md`). Канон визуала — approved Review.html
> (`docs/design/mockups/create-component-wizard-approved.html`, байт-в-байт =
> Claude Design «Create Component Wizard - Review»).

## Рамка

- **2 PR-а.** PR 1 = перекладка UI редактора (чистая презентация). PR 2 = сам
  wizard (новая фича + правки билдера на greenfield-данных).
- **База:** ветка `feature/create-component-wizard` в worktree, fast-forward'нута
  на `origin/develop @70134fb`. Канон: бриф + iteration-2 + carry-over.
- **Конвенции:** TDD (failing-тест первым, по слою/хуку/компоненту), Sonnet
  review-субагент после каждого impl-коммита, opus=имплементация /
  sonnet=ревью, пуш/коммит — только по команде, вся работа в worktree.

## Зафиксированные решения

- Wizard делаем **refactor-in-place** из существующего `CreateComponentDialog`.
- **Ownership: один Group ID на строку (UI).** Серверное представление
  устоялось — **не трогаем**. Существующие comma-записи **грандфазерим**
  (показываем как есть, без перезаписи → нет phantom-dirty).
- Настоящая per-group `artifactIds[]` модель билдера — **в PR 2** (greenfield
  create).
- **CRS-сплит comma → отдельные записи** — отдельная сессия (задача в памяти:
  `project_crs_artifact_group_split_followup`).
- Inline cross-component conflict-check — **отложен** (backend-gated); в PR 2
  только save-time 409 fallback.

---

## PR 1 — Editor UI reorganization

Презентация, без изменения контрактов / владения состоянием. Коммиты
(каждый: failing-тест → impl → Sonnet review):

1. **Renames + one-per-row контрол** — `ArtifactOwnershipEditor` +
   `generalSlice` diff-label. «Artifact IDs»→**Produced Artifacts**,
   «Owns»→**artifactId matching mode**, «Artifacts»→**Specific artifacts**;
   «Add artifact coordinates»→**«Add one more groupId»**; новые записи — один
   Group ID. Comma-записи отображаются как есть.
2. **Переезд Produced Artifacts** General → **Build** tab (только рендер; state
   остаётся в General RHF `artifactIds`).
   - **Acceptance (finding P1/P2):** после переезда ошибки/diff/ownership для
     `artifactIds` должны **атрибутироваться Build**, а не General — inline-error
     рендерится в Build-секции, review-diff числится в Build-группе, save-time
     400/409 по Produced Artifacts ведёт на шаг/таб **Build** (D2), хотя RHF
     form-объект остаётся общим. Тест: серверная ошибка по `artifactIds` →
     маршрут/подсветка = Build, не General.
3. **Переезд Explicit/External** Distribution → **General/Classification**
   (только рендер; state остаётся в `useDistributionSection`).
4. **Docker** — **отдельный left-nav пункт/секция в группе Distribution
   редактора**, вынесенный из общего Distribution-таба (finding P2 / carry-over
   C5, iteration:154) — не просто блок внутри старого таба. Coordinate
   (Maven/Package) остаются в Distribution.
5. **System-бедж D7** — read-only бедж уважает field-config `hidden`.

**Явно НЕ трогаем в PR 1:** сериализацию/write-shape ownership, серверный
контракт, владение состоянием, `buildCreateRequest`.

---

## PR 2 — Create wizard

Атомарно (ревьюится последовательностью TDD-коммитов). Фазы:

- **a. Билдер + form-model:** `buildCreateRequest` → per-group `artifactIds[]`
  (убрать `groups.join(',')`); **Docker вне explicit-гейта** (Maven/Package
  остаются gated); shared one-per-row контрол из PR 1. Zod + тесты первыми.
- **b. Каркас wizard:** роут `/components/new` — **регистрировать ПЕРЕД
  динамическим `/components/:id`** (finding P1); RR7 ранжирует static > dynamic —
  static-роут **побеждает** при наличии (сам `:id` технически матчит `new`, если
  static-роута нет), фиксируем **явным порядком + regression-тестом** (`App.routes`): `/components/new` → wizard, НЕ
  detail c `id="new"`. Далее `CreateComponentPage`, stepper
  (invalid на любом шаге, клик-навигация), sticky footer
  (`Back`/`Next`/`Create`), unsaved-guard (`useBlocker`), scratch vs clone
  (`?from={id}`) + Clone Included/Excluded баннер. Точки входа
  (список/palette/Clone) → роут; модалку ретайрим.
- **c. Шаги** General/Build/VCS/Jira/Distribution из общих RHF+zod (VCS —
  постоянный шаг, условно содержимое).
- **d. Profile-gate** (scratch, первый шаг): 4 профиля + «Has explicit
  distribution?»; profile-dependent Component-Key regex (`solutionKey.ts`); в
  Clone профиль выводится из источника (editable → reset ключа + пересчёт
  флагов).
- **e. Review & create:** Summary-only дифф (зелёные `+`), required-guard
  поверх `validateJiraKey`, optional comment, серверные ошибки → баннер +
  маркеры в stepper + клик-к-полю (Produced-Artifacts конфликт → шаг Build).

---

## Carry-over acceptance tests (D1–D7 — чтобы не повторить макетные баги)

Явные тесты/чеклист (finding P2), привязка к PR:

- **D1 — `addArtifact()` создаёт строку с `mode:'ALL'`, не `''`** (пустого mode
  нет; «Add one more» гейтится заполненным Group ID, не выбором mode). → PR 2/a
  (create-форма) + PR 1/1 (editor-контрол).
- **D2 — save-time conflict по Produced Artifacts → шаг/таб `build`** («Go to
  Build», не General). → PR 1/2 (editor) + PR 2/e (wizard error-routing).
- **D3 — Summary: Produced-artifact строки в Build-группу**, не General. → PR 2/e.
- **D5 — General subtitle** без «…and the artifacts this component produces»
  (артефакты теперь в Build). → PR 2/c (create General) + PR 1 (editor General,
  если есть аналогичный subtitle).
- **D6 — VCS tooltip/нота**: «VCS fields are not required for these build
  systems; the step shows a note» (шаг постоянный), без «WHISKEY/PROVIDED skip
  the VCS step». → PR 2/c (VCS step) + PR 1 (editor VCS, если есть).
- **D4/D7** уже в PR 1 (editor mapping-card на Build; System-бедж respects
  `hidden`).

---

## Отложено / вне рамок

- Inline (groupId, artifactId) conflict-check — follow-up (нужен CRS-эндпоинт);
  в PR 2 save-time 409.
- CRS canonicalize one-group-per-record — отдельная сессия (в памяти).
- Mobile stepper — снято (carry-over C2).
