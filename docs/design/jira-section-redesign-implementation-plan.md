# План реализации: редизайн Jira-секции + сопутствующие фичи

Статус: **на ревью**, 2026-07-02. Основания: `jira-section-redesign-prep.md` (анализ + решения
Q1–Q14), `jira-section-redesign-brief.md` (дизайн + UI-копирайт §5a), утверждённый интерактивный
макет (design-проект, `templates/jira-section-redesign/JiraSectionRedesign.dc.html`).

## Scope

Редактор (Jira-таб + External Registry на VCS-табе) и Create-форма. Новые фичи: field-config
`editable`-ось, clear-семантика PATCH, поле `skipCommitCheck`. **Non-goals:** per-range override
UX, тёмная тема, Q10-фикс форматтера releng-lib (отдельный follow-up после выверки), rename-хвосты
(service-config key — идёт своим треком).

## PR-раскладка и порядок

Три CRS PR независимы друг от друга (можно параллельно); портальные — после соответствующих
CRS-мержей (vendored spec). Каждый PR: TDD (failing test → код), Sonnet-review до чистого
прохода, squash-merge.

### CRS-A — clear-семантика `"" = clear` (S)

- Единое серверное правило для ВСЕХ строковых скаляров аспектов v4 PATCH (jira, build, escrow,
  `vcsExternalRegistry`): `null`/absent = no-op (как сейчас), `""` = очистить, непустое =
  установить (`?.let { entity.x = it.ifBlank { null } }`). Безопасно: `""` сегодня никто не шлёт.
- ⚠️ Парный портальный долг (finding ревью #1): Build/Escrow-хуки сейчас шлют `null` при очистке
  (`useBuildSection.ts:102`, `useEscrowSection.ts:112`) и рисуют `clearedScalarNoop`-warning —
  после CRS-A warning станет ложью. Портальный переход всех aspect-скаляров на `""`-clear +
  снятие `clearedScalarNoop`-аннотаций и обновление тестов — включён в P-1 (см. ниже).
- OpenAPI: описания полей + regen; audit пишет old→null.
- Тесты: unit по каждому полю + dbTest round-trip (set → clear → read), включая
  «пустая строка не ломает вычисление форматов» (fallback срабатывает после clear).
- Риск: клиенты, случайно шлющие `""` — grep по потребителям v4 (портал шлёт `null`; других
  editor-клиентов нет).
- **Реализация (02.07, коммит f6efc3ff, ветка feat/v4-empty-string-clears): DONE, test+dbTest
  зелёные, OpenAPI regen.** Отклонение от плана (обоснованное): `build.buildSystem` и
  `escrow.generation` ИСКЛЮЧЕНЫ из clear-правила — это валидируемые enum'ы, blank там = 400
  (set-only). `jira.projectKey` включён (uniqueness игнорирует blank, resolve graceful).
  ⇒ Долг P-1: для этих ДВУХ enum-полей портал продолжает слать `null` при очистке (не `""`),
  их `clearedScalarNoop`-варнинг остаётся.

### CRS-B — field-config `editable: all|adminOnly|none` + `options` (M)

- `FieldEntry`: + `editable` (enum, default `all`), + `options: List<String>`.
- `ConfigSyncService`: сериализация + enum-валидация (по образцу `VISIBILITIES`); `options`
  попадает в блоб → фронтовый `useFieldOptions` уже умеет их приоритетом.
- **Wire-контракт (решение ревью #3): endpoint отдаёт сырой блоб (user-agnostic, кэшируемый),
  эффективную редактируемость вычисляет каждая сторона сама**: портал — из entry + permissions
  текущего пользователя; CRS — в write-enforcement из permissions запрашивающего. CRS ничего
  per-user не сериализует.
- Write-гейты `ComponentManagementServiceImpl` (решение ревью #1/#4 + критический разбор):
  для `adminOnly` без `EDIT_ANY_COMPONENT` и для `editable: none` — **явный 403/422, но
  строго change-based**: отвергается только попытка ИЗМЕНИТЬ значение (incoming ≠ current после
  нормализации `"" ≡ null`); эхо неизменённого значения легально. Причина: combined Save шлёт
  весь слайс целиком — presence-based reject ронял бы каждое сохранение обычного пользователя.
  Silent strip остаётся только у `visibility: hidden` (невидимое поле).
- **`visibility: readonly` унифицируется с `editable: none`**: получает тот же change-based
  422 (сегодня readonly сервером не энфорсится вообще — write-strip есть только у hidden;
  двойники с разным поведением недопустимы). Живой стенд (`releasesInDefaultBranch: readonly`)
  не страдает благодаря change-based правилу.
- **Create-правило (finding ревью-3 #1)**: у POST нет «current» для change-сравнения → видимые
  нередактируемые поля (adminOnly без permission, `none`/readonly) — **отвергаются 403/422, если
  переданы** (non-null); отсутствие = ок, применяются серверные дефолты. `hidden` на create
  сохраняет существующее поведение (client-side strip + server-side strip).
- `visibility` не трогаем; `readonly` остаётся синонимом `editable: none` (не выпиливаем).
- **Baseline-дефолты в `application.yml` CRS (решение 02.07): `jira.technical: {editable:
  adminOnly}` и запись External Registry `{editable: adminOnly}`** — правило универсально для
  всех инсталляций, service-config его не задаёт (сверить ключ: write-гейт использует
  `component.vcsExternalRegistry`, display-путь — `vcs.externalRegistry`).
- Тесты: `AdminConfigPropertiesBindingTest`, `ConfigSyncServiceTest`, `FieldConfigServiceTest`,
  `FieldConfigEnforcementIntegrationTest` (+ dbTest), `StrictContractTest`.

### CRS-C — `skipCommitCheck` boolean + мосты (M)

- Колонка `skip_commit_check boolean not null default false` (V1 baseline — CRS не в проде,
  подтверждено 02.07) + CHECK-консистентность.
- v4: create/PATCH/read + audit + OpenAPI regen. PATCH boolean: null = no-op.
- Мосты (паттерн rename-PR #392):
  - import: DSL `externalRegistry="NOT_AVAILABLE"` → `skipCommitCheck=true`, реестр не пишем;
  - legacy-read v1–v3: `skipCommitCheck=true` → `VCSSettings.externalRegistry="NOT_AVAILABLE"`
    (флаг побеждает реестр);
  - as-code renderer: флаг → DSL-литерал `NOT_AVAILABLE` (DSL-контракт не меняется).
- Валидация Q13: `buildSystem=WHISKEY` (эффективный BASE) ⇒ `skipCommitCheck=false`;
  переход buildSystem→WHISKEY при флаге=true в combined PATCH — 422. Import: WHISKEY +
  NOT_AVAILABLE в DSL — warning (предварительно прогнать grep по продовому DSL: есть ли
  противоречия; если есть — сообщить domain owner до включения).
- Гейт: **compat-прогон бит-в-бит** (legacy-выдача) — обязательный merge-критерий.

### service-config (infra, задача + апрув — [[feedback_infra_repos_need_task_and_approval]])

После CRS-B — только installation-specific: `vcs.externalRegistry: {options: [<имена реестров
стенда>]}` и `component.releasesInDefaultBranch: {visibility: hidden}`. Правило adminOnly для
technical/externalRegistry живёт в baseline `application.yml` CRS (см. CRS-B), здесь не дублируется.
Имена реестров — только в service-config, не в коде.

### P-0 — HTML-прототип-эталон (S, можно до CRS)

Кодификация утверждённого макета на реальных токенах: канон-исправления (Q12/Q13/Q14 — тумблер
без confirm, Whiskey-disable, hotfix две строки), states-панель и hover-связка из экспорта.
Публикация Artifact'ом для приёмки. Не в репо (эталон для сверки, не прод-код).
**Scope P-0 (уточнение по ревью): эталон только для Jira-секции (P-2a/P-2b).** Состояния P-3
(empty-options, «not in configured list») и Create-form preview (P-4) прототипом не покрыты —
они принимаются по брифу/спеке; при необходимости прототип дополняется на этих этапах.

Статус: DONE 2026-07-02, ревью-чисто (2 раунда). Artifact:
https://claude.ai/code/artifact/c7d75840-d8fa-4517-a0c9-3f70d5cb8806

### P-1 — портал: фундамент (M; после CRS-A/B merge + vendor)

- `PERMISSIONS`: + `EDIT_ANY_COMPONENT` в `frontend/src/lib/auth.ts` (сегодня константы нет —
  finding ревью #3).
- `useFieldConfig`: effective editability = f(entry, user) (`useCurrentUser` + `hasPermission`).
- **Payload-gating (finding ревью-2 #1): слайсы/request-builders ОБЯЗАНЫ исключать из PATCH поля
  с effective editability = false** (сейчас слайс шлёт всю секцию целиком: `useJiraSection.ts:95`
  всегда включает `technical`, `useVcsSection.ts:152` — `vcsExternalRegistry`). Клиентское
  омиссирование — первичный механизм корректности; серверный change-based 422 — defense-in-depth.
  Общий хелпер в P-1, применение в P-2a (jira) и P-3 (vcs).
- Переход ВСЕХ aspect-скаляр-очисток на `""` (finding #1): `useJiraSection`/`useBuildSection`/
  `useEscrowSection`/`useVcsSection` шлют `""` вместо `null` при очистке; `diffUtil` снимает
  `clearedScalarNoop`; ReviewChangesDialog перестаёт писать «(clearing not supported)»; тесты.
  Инварианты безопасности (зафиксировать тестами): (а) пустой state = серверный null (сидирование
  из detail-ответа), поэтому безусловная отправка `""` нетронутых пустых полей — no-op;
  (б) конкурентные записи ловит optimistic-lock `version` combined PATCH (409) — `""` не может
  молча затереть чужую запись.
- **Границы `""`-миграции (finding ревью-2 #2): только аспект-скаляры + `vcsExternalRegistry`.**
  Top-level компонентные скаляры (`jiraDisplayName`, `jiraHotfixVersionFormat`) уже очищаются
  через `null` по своему существующему контракту («clears persist», `useJiraSection.ts:64,90`) —
  их НЕ трогаем, на `""` не переводим.
- Чистая либа preview: парсинг sample-версии (числовые сегменты, missing→0; отдельный
  hotfix-sample для hotfix-строк — другая арность) + экспансия
  `$major/$minor/$service/$fix/$build` + Jira-обёртка (prefix только Jira-facing; hotfix dual);
  `≈`-признак для `$fix/$build`; unit-тесты против рабочих примеров из prep §1.5.
- `isHotfixEnabled(component)` из `vcsEntries[].hotfixBranch`.
- `fieldDescriptions.ts`: тексты из брифа §5a (лейблы «Jira Version Prefix» / «Full Version
  Format in Jira» — смена fallback-лейблов).

### P-2a — Jira-таб: layout + state (M; зависит от P-1 И CRS-C + vendored spec — finding #2)

- Новая структура: Jira project / Version formats (пары Line+Minor, Release+Build; материализация
  Line→Minor в оба поля при Save, пока minor не переопределён; кнопки Set/Remove separate —
  Remove шлёт `""` (CRS-A); не сворачивать при range-overrides) / Flags (Technical admin-gated,
  Skip Commit Check + Whiskey-disable, толерантность к скрытому releasesInDefaultBranch).
- Hotfix conditional (Q8: скрыт при выключенных хотфиксах всегда).
- 409 inline-ошибка (Project Key + Prefix).
- `useJiraSection`: + `skipCommitCheck` (свой слайс-ключ), материализация, отправка `""` для
  clear; JiraTab начинает уважать field-config visibility/editable для всех полей.
- Тесты: JiraTab.test (пере-снятие всей матрицы состояний), sectionHooks, combinedSave.

### P-2b — Ladder-preview (S/M; после P-2a)

- Панель справа (sticky): строки Release / RC (`release + "_RC"`, Jira-обёртка) / Minor / Line /
  Build / Hotfix (dual: build-значение без префикса + Jira-значение; **hotfix-строки считаются от
  ОТДЕЛЬНОГО hotfix-sample** — у hotfix-версий другая арность, напр. `1.2.3` vs `1.2.3-187`),
  `≈`-бейджи, hover-связка
  поле↔строка в обе стороны (механика из экспортированного макета).
- Preview-тесты на каждую строку, включая RC и hotfix-dual (ответ ревью #3: RC — при покрытии
  тестами).

### P-3 — VCS-таб: External Registry (S)

Дропдаун (options из field-config); без сконфигурированных options — **readonly + подсказка
«список не сконфигурирован»** (решение ревью #2). Текущее значение компонента, отсутствующее в
options (данные старше списка), дропдаун обязан показать выбранным с пометкой «not in configured
list» — не терять и не подменять. Visible только при WHISKEY (эффективный
BASE build system), editable adminOnly, фикс placeholder/описания, очистка через `""`.

### P-4 — Create-форма (M)

Пары как в редакторе (Line ведущий + mirrored Minor, Release + mirrored Build), материализация
при создании, hotfix-поле убрать, компактный ladder-preview (вариант размещения — по прототипу
P-0), лейблы/дескрипшены общие. Технические поля не добавляются (Q5, Q6a).
Create-side гейтинг по editability (парно к серверному правилу CRS-B): расширить существующий
visibility-механизм (`VISIBILITY_GATED_CREATE_FIELDS` / `editable(field)`) — нередактируемые
для текущего пользователя поля исключаются из формы, схемы и payload, **включая copy-mode**
(значения источника по adminOnly-полям не копируются не-админом — иначе весь POST отвергнется).

### P-5 — E2E + стенд (M)

`crs.version` bump (сборка с CRS-A/B/C) → `./gradlew e2eTest`: обновить attribute-matrix,
+ новые real-CRS спеки: материализация Line/Minor round-trip, clear build-формата, skipCommitCheck
round-trip + legacy-мост (v2-читалка видит NOT_AVAILABLE), admin-гейты (viewer vs admin projects).

## Порядок мержа и деплоя

1. CRS-A, CRS-B, CRS-C (любой порядок, параллельно) → деплой CRS на стенды.
2. service-config PR (после CRS-B задеплоен) + reload-config.
3. P-0 (независим) → P-1 (после CRS-A/B) → P-2a (требует ещё CRS-C) → P-2b; P-3 параллельно
   после P-1; P-4 после P-2a → P-5 → merge портала.
4. Деплой портала — только после деплоя CRS (иначе новые ключи PATCH молча теряются).

## Риски

- **Материализация Line→Minor**: шум в diff/audit (оба ключа после первого Save) — осознанно
  (Q9); Review-диалог покажет оба изменения.
- **Field-config write-enforcement**: user-зависимость живёт только в write-гейтах
  (permissions запрашивающего), read-endpoint и кэш-блоб остаются user-agnostic — не смешивать.
- **Q10 открыт**: иллюстрация строится по домен-модели; если выверка покажет, что потребители
  используют обёрнутые line/build — потребуется releng-lib фикс, UI не меняется.
- **Whiskey+NOT_AVAILABLE противоречия в текущем DSL** — проверить до включения Q13-валидации.
- Vitest-флейки известных тестов при полном прогоне — перепроверять изолированно.

## Решения ревью (2026-07-02)

1. adminOnly/none write-гейт: **явный 403/422, change-based** (отказ только при попытке
   изменить; нормализация `"" ≡ null`; presence-based ломал бы combined Save не-админов);
   silent strip только для hidden; `visibility: readonly` энфорсится так же, как `editable: none`.
2. External Registry без options: **readonly + hint**.
3. RC-строка: да, с preview-тестами.
4. **P-0 делаем** (снижает churn в P-2).
5. **P-2 разрезан** на P-2a (layout/state) + P-2b (ladder-preview).

