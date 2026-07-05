# Подготовка: редизайн Jira-секции (редактор + Create-форма)

Статус: подготовительный анализ, 2026-07-02. Кодовая база: portal `develop`, CRS `v3`.
Назначение: основа для дизайн-сессии (Claude Design) и последующего плана реализации.

---

## 0. Порядок работ (пререквизит)

**Сначала мержится rename `majorVersionFormat → minorVersionFormat`** (закоммичен, не запушен:
CRS ветка `feat/rename-major-to-minor-version-format`, portal ветка `feat/rename-minor-version-format`).
Редизайн ветвится от него и оперирует новыми понятиями:

- **Minor Version Format** — версия планирования в Jira (бывш. "major", `$major.$minor`);
- **Line Version Format** — линия сопровождения, «настоящий major» (`Line.$major.$minor` и т.п.).

Смешивать rename (кросс-репо: колонка БД, DTO, OpenAPI, dual-bind alias) с UI-редизайном не стоит:
пересечение по файлам почти 100%, ревью и откат станут тяжёлыми.

---

## 1. Карта текущего состояния

### 1.1 Редактор, Jira-таб

- Презентация: `frontend/src/components/editor/JiraTab.tsx`; state/save-slice: `useJiraSection.ts`
  (plain state, **без Zod/RHF-валидации**); per-range overrides: `FieldOverrideInline.tsx`.
- Поля по порядку: Project Key, Display Name (условное), Technical (toggle), Releases in default
  branch (toggle), Hotfix Version Format, Version Prefix, Minor(Major) Version Format, Release
  Version Format, Build Version Format, Line Version Format, Version Format. Все текстовые поля
  всегда редактируемы; field-config visibility уважают только `jira.displayName` и
  `component.releasesInDefaultBranch` (`JiraTab.tsx:71-84`).
- Overrides «+ Add override» есть у 9 полей (включая `jira.hotfixVersionFormat` и boolean-override
  у `jira.technical`).
- Labels/tooltips: `FieldLabelText`/`FieldInfo` → field-config `label`/`description` override,
  fallback `frontend/src/lib/fieldDescriptions.ts:47-69`.

### 1.2 Create-форма

- `frontend/src/components/CreateComponentDialog.tsx` + `lib/component/buildCreateRequest.ts`.
- Jira-поля: Project Key (обязателен), Version Prefix, форматы minor/release/build/line
  (`baseConfiguration.jira`) + hotfix (top-level `jiraHotfixVersionFormat`).
  **`technical` и `versionFormat` в форме создания отсутствуют.**
- Field-config уже влияет: hidden/readonly поля вырезаются из формы, схемы и payload
  (`VISIBILITY_GATED_CREATE_FIELDS`, `buildCreateRequest.ts:176-181`); `jiraHotfixVersionFormat`
  уже в этом списке. Дефолты форматов — из `GET /config/component-defaults` (service-config).
- Labels/tooltips переиспользуются с редактором (те же `jira.*` пути).

### 1.3 Field-config (service-config → CRS → фронт)

- Цепочка: service-config YAML → `AdminConfigProperties` (CRS) → `ConfigSyncService` → JSONB-кэш →
  `GET /config/field-config` → `useFieldConfig.ts`. Read-only в портале (code-as-config),
  применение — `POST /admin/reload-config`.
- Схема записи (`AdminConfigProperties.FieldEntry`): `visibility (editable|readonly|hidden)`,
  `searchable`, `required`, `defaultValue`, `label`, `description`.
  **`visibility: hidden/readonly` уже работает end-to-end**, включая server-side write-strip
  (`FieldConfigService` + `ComponentManagementServiceImpl:523-584`).
- **Роль-зависимой редактируемости нет нигде** — visibility глобальна per-field.
- Фронтовый тип `FieldConfigEntry` умеет `options[]` (приоритет над meta-endpoint'ами в
  `useFieldOptions`), но **CRS-сторона `options` не производит** — поле осталось от legacy
  DB-редактируемого блоба.

### 1.4 Permissions

- `GET /auth/me` → роли + permissions; `hasPermission()` (`frontend/src/lib/auth.ts`).
- Роль → permission mapping: CRS `octopus-security.roles` (baseline `application.yml:192-221` +
  service-config), не Keycloak.
- **Решение: «админ» для полей = permission `EDIT_ANY_COMPONENT`** (существующий токен; изменений
  в Keycloak/ролевых конфигах не требуется).
- Прецедент per-field гейта: rename-поле в GeneralTab гейтится на `RENAME_COMPONENTS`
  (`GeneralTab.tsx:183-186`).

### 1.5 Семантика вычисления версий (CRS/releng-lib)

Пайплайн: parse (`NumericVersionFactory`: `$major.$minor.$service.$fix.$build`) → expand format
(`KotlinVersionFormatter`; + вычисляемые переменные `serviceC`/`minorC`/`serviceCBranch` из
`components-registry.version-name`) → обёртка `versionFormat` = `$versionPrefix-$baseVersionFormat`
(если `versionPrefix` непустой) — применяется ко **всем** видам версий.

Fallback-и при вычислении (`JiraComponentVersionFormatter.java:157-185`, `EntityMappers.kt:1193-1214`):

| Формат | Если не задан |
|---|---|
| `buildVersionFormat` | = `releaseVersionFormat` |
| `lineVersionFormat` | = `minorVersionFormat` (бывш. major) |
| `hotfixVersionFormat` | не вычисляется вовсе (без fallback) |

Виды версий (лестница, от крупного к мелкому):

| Вид | Формат (пример) | Использование |
|---|---|---|
| Line | `$major.$minor` / `Line.$major.$minor` | линия сопровождения; по умолчанию — version line для CRN-отчёта |
| Minor (planning) | `$major.$minor` | планирование в Jira |
| Release | `$major.$minor.$service` | **Jira Fix Version** (+ вариант `_RC`) |
| Build | `$major.$minor.$service.$fix` | CI/промежуточные сборки |
| Hotfix | `…-$build` | только при включённых хотфиксах |

Рабочий пример (фикстура releng-lib): version `2.15.1505.147-1128`, prefix `testcomponent`,
`versionFormat='$versionPrefix-$baseVersionFormat'` → Fix Version `testcomponent-2.15.1505`,
planning `testcomponent-2.15`, build `testcomponent-2.15.1505.147`, line `testcomponent-Line.2.15`,
hotfix `testcomponent-2.15.1505.147-1128`.

- **«Hotfix enabled» — вычисляемый признак, не хранится**: включён ⇔ хотя бы у одного VCS-root
  задан `hotfixBranch` (`ComponentHotfixSupportResolver`). На v4 read доступен через
  `vcsEntries[].hotfixBranch` — фронт выводит признак сам, CRS менять не нужно.
- **Technical**: pass-through флаг для release-автоматизации; версии технических компонентов
  ведутся в Jira custom field **«SubComponent Fix Version/s»**
  (`octopus-jira-utils/.../JiraCustomField.java:34`), из customer-facing release notes исключаются.
- Готовый endpoint вычисленных версий: v2 `GET /components/{c}/versions/{v}/detailed-version`
  (типы MINOR/LINE/BUILD/RC/RELEASE/HOTFIX).
- ⚠️ Известная ловушка: **PATCH `null` по скалярам jira-аспекта = no-op** в CRS (`?.let`) —
  очистка поля из редактора молча не сохраняется. Для кнопок «убрать отдельный формат» нужна
  clear-семантика (см. §4.5, §6-CRS).

### 1.6 External Registry (`vcsExternalRegistry`)

- CRS: per-component строковая колонка `vcs_external_registry`; **свободный текст, не enum**;
  валидации значений и meta-endpoint'а со списком нет. `NOT_AVAILABLE` — строковый sentinel.
  Есть на create/PATCH/read v4 (`ComponentUpdateRequest.kt:54` и др.); PATCH `null` = no-op —
  **очистить поле сейчас невозможно** (комментарий в `useVcsSection.ts:111` о «clear persists» —
  устаревший, латентный баг).
- Портал: free-text Input на **VCS-табе** (`VcsTab.tsx:26-36`, путь `vcs.externalRegistry`),
  placeholder «External registry URL» вводит в заблуждение (значения — имена реестров /
  `NOT_AVAILABLE`, не URL); поле игнорирует `canEdit`. В Create-форме нет (copy-mode копирует).
  Per-range overrides не поддерживаются by design (per-component скаляр).
- Семантика downstream (Jira releng plugin):
  - пусто → обычный git-компонент, все проверки активны;
  - имя реестра → исходники в внешнем (Whiskey) реестре, VCS-roots резолвятся из whiskey-builds;
  - `NOT_AVAILABLE` → **`skipCommitCheck`**: при регистрации релиза/RC отключаются проверки
    коммитов, и **привязка issues к RC идёт только по билдам** (проход по коммитам пропускается,
    `RCSearchService.kt:101-111`). Это в точности семантика нового тумблера (§4).
- Связь с buildSystem: жёсткого правила нет; enum buildSystem содержит `WHISKEY`;
  externalRegistry описан как «used by Whiskey tool», но в данных встречается и на
  не-Whiskey компонентах (в паре с `NOT_AVAILABLE`).
- Имена реальных реестров installation-specific — в код/доки/коммиты их не вносить
  (CI Content Validation); список должен приходить из service-config.

---

## 2. Требования и анализ

### R1. Project Key — основное поле

Визуальная иерархия: Project Key первым, крупнее/акцентнее, остальное — сгруппированные
подсекции. Чистый UI-редизайн, контракт не трогаем. Учесть: уникальность пары
(projectKey, versionPrefix) энфорсится сервером (409) — место под понятную ошибку.

### R2. Technical — редактирование только админам

- «Админ» = `EDIT_ANY_COMPONENT` (решено).
- Для остальных пользователей — иллюстративное отображение (read-only состояние + пояснение).
- Реализация — через новую generic-настройку field-config **`editable: all | adminOnly | none`**
  (см. §3), а не hardcode: тот же механизм нужен External Registry (R10) и будущим полям.
- При `technical = true` показывать в иллюстрации: «Versions tracked in Jira field:
  **SubComponent Fix Version/s**»; при `false` — строку не показывать (стандартный Fix Version/s
  подразумевается — уточнить формулировку с дизайном, см. вопрос Q7).
- Create-форма: `technical` в ней отсутствует — **не добавлять** (рекомендация; см. Q5).

### R3. Releases in default branch — hidden

Механизм уже существует: одна строка в service-config
(`field-config.component.releasesInDefaultBranch: { visibility: hidden }`; сейчас на живом стенде
стоит `readonly`). Jira-таб и Create-форма уже уважают visibility этого поля. Работы: только
изменение конфига + reload. Отдельный вопрос — согласование с владельцем service-config
(инфра-репо: нужен апрув и задача).

### R4. Hotfix Version Format — только при включённых хотфиксах

- Признак: `isHotfixEnabled = vcsEntries.some(e => !!e.hotfixBranch)` — вычисляется на фронте из
  уже приходящих данных v4 read. Нового контракта не нужно.
- Если хотфиксы выключены — поле скрыть; если у компонента при этом задан формат (в БД) —
  см. Q8 (скрыть полностью vs read-only hint «формат задан, но хотфиксы не включены»).
- Create-форма: инпута hotfixBranch в ней нет → хотфиксы на момент создания всегда выключены →
  **поле Hotfix Version Format из Create-формы убрать**.
- Per-range: базовое значение — top-level `jiraHotfixVersionFormat` (clear работает), per-range
  override принимается override-эндпоинтами, но помечен в CRS как «не editor-write field»
  (untested-by-design) — при редизайне сохранить текущее поведение, не расширять.

### R5. Build Version Format — сворачивание в release

Семантика CRS уже такая (fallback build→release), UI её честно визуализирует.
**Layout (решение 2026-07-02): Release и Build — в одной строке** (Release — редактируемый,
Build — производный рядом):

- **не задан** (null) → uneditable поле с задублированным значением из Release Version Format
  (пометка «same as release») + кнопка **«Set separate build format»**;
- **задан** → отдельное редактируемое поле + действие «убрать отдельный формат» (вернуть к
  «= release»). Это clear jira-аспект-скаляра → упирается в PATCH null-noop, нужен CRS-фикс
  clear-семантики (§6-CRS, Q3).
- Свернуть можно только если base-значение пусто **и нет per-range overrides** по
  `jira.buildVersionFormat`; при наличии overrides показывать развёрнуто.

### R6. Line — ведущий, Minor — производный (решение Q9, 2026-07-02)

После rename пара полей строится так: **«Line / Major Version Format» — ведущее поле**,
показывается всегда; **Minor Version Format** (планирование в Jira) по умолчанию — его копия,
**расположен рядом, в той же строке** (решение 2026-07-02):

- **Minor не переопределён** → uneditable, зеркалирует Line (пометка «same as line») + кнопка
  «Set separate minor format»;
- **переопределён** → отдельное редактируемое поле + «убрать отдельный формат» (clear → §Q3).
- Свернуть Minor нельзя, если на `jira.minorVersionFormat` есть per-range overrides.

⚠️ **Реализация — UI-материализация (вариант 1)**: fallback в CRS/releng-lib обратный
(`line ?? minor`, а незаданный minor падает на жёсткий дефолт `"$major"`), и менять его нельзя —
`JiraComponentVersionFormatter` живёт в общей либе `octopus-releng-lib`, потребляемой также
releng-автоматизацией и Jira-плагином. Поэтому при Save ведущее значение пишется в **оба**
base-поля (`lineVersionFormat` и `minorVersionFormat`), пока minor не переопределён явно.
CRS не меняется; все потребители либы видят полностью заполненную пару.

Маппинг при загрузке: `line == minor` или `line` пуст → свёрнуто (ведущее = эффективный line);
значения различаются → оба развёрнуты. Заметить асимметрию с R5: пара Build/Release живёт на
честном server-side fallback (материализация не нужна), пара Line/Minor — на материализации.

Пояснение в иллюстрации: line version — линия сопровождения, по умолчанию используется как
version line для CRN-отчёта; minor — версия планирования в Jira.

### R7. Version Format / Prefix — переименование и семантика (инструкция domain owner, 2026-07-02)

- Лейблы: **«Jira Version Prefix»** (бывш. Version Prefix) и **«Full Version Format in Jira»**
  (бывш. Version Format) — через field-config label override или смену fallback-лейблов.
- Заголовок группы: **«Jira project — Where releases and issues of this component are tracked.»**
- Семантика для UI/иллюстрации: **префикс применяется только к Jira-версиям** (Release, Minor,
  Hotfix); Line и Build показываются **без префикса**. Держать рядом: Prefix + Full Version Format.
- ⚠️ Follow-up (Q10): в releng-lib формула сейчас оборачивает ВСЕ виды версий (тест-фикстура
  даёт line/build с префиксом). Требуется выверка: либо потребители line/build не используют
  обёрнутые значения (тогда иллюстрация корректна как есть), либо нужен фикс форматтера
  (`JiraComponentVersionFormatter` — общая либа, менять только согласованно).

### R8. Иллюстрация вычисления версий

Живой preview-блок: по текущим (в т.ч. несохранённым) значениям форматов + примерной версии
показывать лестницу:

```
version (git tag / build)   1.2.3
├─ Release Version in Jira  pgw-1.2.3   → поле Fix Version/s
│                                         (technical → SubComponent Fix Version/s)
├─ Minor Version            pgw-1.2     (= line format) → used for planning in Jira
├─ Line Version             1.2         (no prefix; ведущий формат) → CRN report:
│                                         by default all versions of this line are included
├─ Build Version            1.2.3       (= release format, no prefix) → CI builds
└─ Hotfix Version           1.2.3-4 → hotfix build (no prefix)
                            pgw-1.2.3-4 → Jira Fix Version (стандартная обёртка, как у Release)
```
Префикс — только на Jira-версиях; Line и Build — без префикса (см. R7/Q10).
✅ **Q14 (2026-07-02): у Hotfix Version ДВА использования** — версия hotfix-сборки (без префикса)
и версия в Jira (с префиксом/обёрткой, по стандартной схеме, аналогично Release). В иллюстрации
показывать оба значения.

Реализация: чистая клиентская preview-функция (парсинг `$major/$minor/$service/$fix/$build` +
обёртка prefix) — работает и в Create-форме, и для несохранённых правок. Вычисляемые переменные
(`$serviceC`, `$minorC`, `$serviceCBranch` — installation-configured) — degrade gracefully
(показывать как есть или помечать «server-computed»). Для существующего компонента опционально
сверка с v2 `detailed-version` (реальный вычислитель). Sample-версию выводить из последних
известных версий компонента, fallback — синтетическая.

### R9. Create-форма — те же правила, где применимо

| Правило | Применимость в Create |
|---|---|
| R1 Project Key основной | да (уже обязателен) |
| R2 Technical admin-only | поля нет — не добавлять (Q5) |
| R3 releasesInDefaultBranch hidden | уже работает через visibility-gating |
| R4 Hotfix format | убрать из формы (хотфиксы при создании всегда выключены) |
| R5/R6 сворачивание build/line | да — с учётом дефолтов из component-defaults: если дефолт build = дефолту release, показывать свёрнуто |
| R7 Version Format | в форме отсутствует — оставить как есть (сложная настройка, наследуется из Defaults) |
| R8 иллюстрация | да — client-side preview по вводимым форматам |
| R10/R11 External Registry / skip-commit-check | см. Q6 (рекомендация: только тумблер skip-commit-check, admin-only; реестр задавать после создания) |

### R10. External Registry — admin-only, только для Whiskey

- Редактирование: `editable: adminOnly` через новый механизм §3 (permission `EDIT_ANY_COMPONENT`);
  заодно чинится текущий баг «поле игнорирует canEdit».
- Видимость: показывать только при `buildSystem = WHISKEY` (эффективное значение build-аспекта).
  Жёсткой связки в CRS нет — это UI-правило; данные это поддерживают (не-Whiskey компоненты с
  externalRegistry — это как раз case `NOT_AVAILABLE`, который покрывается тумблером R11).
- Вид: **дропдаун вместо free-text**, значения из списка, **без `NOT_AVAILABLE`** (он выражается
  тумблером R11). Источник списка: CRS enum'а нет, имена реестров installation-specific →
  **добавить `options` в CRS `FieldEntry`** (service-config-driven; фронт уже умеет options
  приоритетом над meta) — см. §3.
- Починить placeholder («URL» → имя реестра) и добавить описание семантики в tooltip.
- Где живёт: остаётся на VCS-табе или переезжает ближе к buildSystem — вопрос дизайна (Q6b).

### R11. Тумблер «Skip Commit Check at Issue Assignment at Release» (Jira-секция)

- Семантика подтверждена кодом releng-плагина: `skipCommitCheck = (externalRegistry ==
  'NOT_AVAILABLE')` — при регистрации релиза отключаются проверки коммитов, привязка issues к RC
  идёт только по билдам (+ по minor-версии в Fix Version/s).
- **Основной use case (domain owner, 02.07): несколько компонентов в одном репозитории** —
  commit-based привязка не различает, чей коммит, и вешает версии всех компонентов репо на
  задачу. Вторичные кейсы: репозитория нет вовсе, либо в нём ведётся не основной код компонента
  (согласуется с releng-валидатором: ошибка «VCS Settings has no roots» подавляется при флаге). RM FAQ описывает конфигурацию через `NOT_AVAILABLE` в СТАРОМ CR (DSL); в новом портале
  пользователь sentinel не заполняет никогда — тумблер и есть его замена.
- ✅ **Решение Q12 (2026-07-02): отдельное поле в БД.** Новый компонентный boolean
  `skipCommitCheck` (колонка + v4 create/PATCH/read + audit + OpenAPI). Sentinel `NOT_AVAILABLE`
  в БД больше НЕ хранится — `vcs_external_registry` содержит только реальные имена реестров
  (фактически для buildSystem = WHISKEY).
- **Совместимость (мосты, по образцу rename):**
  - legacy-чтение v1–v3: `VCSSettings.externalRegistry` возвращает `NOT_AVAILABLE`, когда
    `skipCommitCheck = true` (флаг побеждает реальный реестр) — Jira-плагин/RM без изменений;
  - DSL import: `externalRegistry = "NOT_AVAILABLE"` → `skipCommitCheck=true`, реестр пуст;
  - as-code renderer: флаг → DSL-литерал `NOT_AVAILABLE` (DSL-контракт не меняется);
  - compat-гейт: legacy-выдача бит-в-бит.
- UI: toggle на Jira-секции, пишет в собственное поле `skipCommitCheck`.
- ✅ **Правило Q13 (2026-07-02): при `buildSystem = WHISKEY` `skipCommitCheck = false` всегда.**
  Server-side валидация (v4 write + import) + в UI тумблер disabled с подсказкой
  «not applicable for Whiskey components». Так как реальный реестр бывает только у WHISKEY,
  флаг и реестр взаимоисключающие по построению — конфликтов «flag + registry» не существует,
  confirm-диалог Q4 и hint о сосуществовании не нужны вовсе.
- Следствия отдельного поля (упрощения против sentinel-схемы):
  - clear при toggle OFF не нужен (boolean) — Q3 остаётся только для кнопок «убрать отдельный
    формат» и админской очистки реестра;
  - спец-случай Q11 в write-гейте не нужен: тумблер = своё поле (canEdit), реестр = adminOnly;
  - слайс-конфликта нет: `skipCommitCheck` живёт в Jira-слайсе, `vcsExternalRegistry` — в VCS.
- Детали реализации Q13 (проверить при имплементации):
  - `buildSystem` overridable per-range, флаг — компонентный: правило применяем к эффективному
    BASE build system;
  - смена buildSystem → WHISKEY на компоненте с флагом=true в combined PATCH: явная
    validation-ошибка (не авто-сброс);
  - импорт: проверить, нет ли в текущем DSL WHISKEY-компонентов с `NOT_AVAILABLE` — если есть,
    это противоречия в данных (разрешить до включения хард-валидации, либо import-warning).
- Tooltip обязателен: объяснить, что это то же самое поле External Registry со значением
  `NOT_AVAILABLE`, и что именно отключается при включении.
- ✅ **Доступ (Q11): тумблер доступен любому редактору компонента** (`canEdit`) — с отдельным
  полем это реализуется без спец-случаев в гейте.
- Открытые мини-вопросы реализации: отдельный DSL-атрибут `skipCommitCheck` (рекомендация:
  пока нет, моста достаточно); валидация «реестр только при WHISKEY» на write-side
  (рекомендация: предупреждение при импорте, не хард-ошибка).

---

## 3. Новая фича field-config: `editable: all | adminOnly | none` (+ `options`)

Расширение существующего механизма (не роль-зависимая visibility, а отдельная ось
редактируемости; `none` ≈ сегодняшний `readonly`, оставить синонимом или заменить — решить при
дизайне конфига). «adminOnly» = permission `EDIT_ANY_COMPONENT`.

Точки расширения (из карты §1.3):

**CRS**
1. `AdminConfigProperties.FieldEntry` — новые свойства `editable` (enum) и `options: List<String>`.
2. `ConfigSyncService.serializeFieldEntry` + валидация enum-значений (по образцу `VISIBILITIES`).
3. `FieldConfigService` — user-aware ответ: для `adminOnly` write-гейт должен смотреть на
   permissions запрашивающего (сейчас «один блоб — один ответ всем»).
4. Write-гейты `ComponentManagementServiceImpl` (`:523-584` и др.) — reject-or-strip для
   `adminOnly`/`none` по требованию permission (сейчас только `isHidden`-strip).
5. Тесты, пиняющие форму entry: `FieldConfigServiceTest`, `FieldConfigEnforcementIntegrationTest`,
   `AdminConfigPropertiesBindingTest`, `StrictContractTest`.

**Portal frontend**
6. `FieldConfigEntry` + резолверы (`useFieldConfig.ts`) — «эффективная редактируемость» =
   f(entry, currentUser); резолверы перестают быть user-agnostic.
7. Потребители: editor-табы (в т.ч. **Jira-таб начинает уважать visibility/editable для всех
   полей** — сейчас не уважает), `buildUpdateRequest`/`buildCreateRequest` strip-логика,
   `CreateComponentDialog`, read-only каталог `FieldConfigEditor` (новая колонка).

**service-config** — записи для `jira.technical` и `vcs.externalRegistry` (+ options списком
реестров), `component.releasesInDefaultBranch: hidden`. Инфра-репо: задача + апрув.

---

## 4. Сквозные технические риски

1. **PATCH null-noop (clear) jira-аспекта и `vcsExternalRegistry`** — блокирует R5/R6
   («убрать отдельный формат») и R11 (toggle OFF). Нужен осознанный CRS-фикс clear-семантики
   (это давно открытый follow-up; данный редизайн делает его load-bearing).
2. **Один PATCH-владелец для `vcsExternalRegistry`** при двух UI-контролах (VCS-дропдаун +
   Jira-тумблер).
3. **Сворачивание полей vs per-range overrides**: свёрнутое (mirrored) поле при существующих
   range-overrides показывать развёрнутым.
4. **Jira-секция без схемы валидации** — при редизайне добавить лёгкую валидацию форматов
   (допустимые `$`-переменные) и подсветку в preview.
5. E2E не гоняются в PR CI — обновить `frontend/e2e` (attribute-matrix, roundtrip) и прогнать
   `./gradlew e2eTest` локально до merge.

---

## 5. Открытые вопросы (нужны решения)

Решено 2026-07-02 (domain owner):

- ✅ **Q1+Q2.** `editable: all | adminOnly | none` — **generic-ось в field-config**, отдельная от
  `visibility` (её не трогаем); «adminOnly» = permission `EDIT_ANY_COMPONENT`.
- ✅ **Q4.** Whiskey-компонент с заданным реестром + включение skip-commit-check: **confirm-диалог**
  с описанием последствий («затрёт External Registry '<имя>'»); изменение также видно в Review diff.
- ✅ **Q5.** `technical` в Create-форме — **не добавлять** (выставляется после создания в редакторе).
- ✅ **Q11.** Skip Commit Check тумблер — **доступен любому редактору компонента** (canEdit).
- ✅ **Q12.** skipCommitCheck — **отдельное boolean-поле в БД** (не sentinel): legacy-мост
  `true → externalRegistry='NOT_AVAILABLE'` для v1–v3; в `vcs_external_registry` — только
  реальные реестры (WHISKEY). Q4-confirm предложено заменить на hint (см. §R11).
- ✅ **Q9.** Иерархия пары Line/Minor: **Line — ведущее поле, Minor — производный** (по умолчанию
  копия Line, переопределяется). Реализация — UI-материализация в оба поля при Save (вариант 1),
  CRS/releng-lib не трогаем. Детали в §R6.

- ✅ **Q3.** Clear-семантика в CRS PATCH — **вариант A: «пустая строка = clear»** (решение
  2026-07-02, «пока A» — с возможностью добавить явный `clearFields` позже, они не конфликтуют).
  Единое правило для строковых скаляров v4 PATCH (jira-аспект + `vcsExternalRegistry`):
  `null`/отсутствует = не трогать, `""` = очистить, непустое = установить
  (`?.let { entity.x = it.ifBlank { null } }`). Обязательно: документация в OpenAPI-описаниях
  полей, аудит old→null, тест-матрица; портал заменяет `clearedScalarNoop`-аннотацию на отправку `""`.

Открыто:

- **Q10.** Prefix-scope: домен-модель «префикс только для Jira-версий» vs releng-lib, который
  оборачивает все виды (line/build тоже). Выверить потребителей вычисленных line/build
  (detailed-version v2, CRN/RM) и решить: подтвердить как есть или фиксить форматтер (общая либа).
  Косвенное подтверждение домен-модели — RM 2.0 FAQ (v81): во всех примерах build/release-версии
  «голые», префиксованная форма фигурирует только как Jira Fix Version; про line/hotfix+prefix
  FAQ не высказывается (hotfix в FAQ отсутствует вовсе).
- UI-копирайт полей финализирован из RM 2.0 FAQ — см. бриф §5a (единый источник для
  fieldDescriptions.ts при реализации).

Предварительно принято (provisional, 2026-07-02 — рекомендованные варианты; domain owner может
переиграть):

- 🟡 **Q6a.** External Registry в Create-форме — **не показывать** (задаётся админом после
  создания; copy-mode продолжает копировать значение источника).
- 🟡 **Q6b.** External Registry в редакторе — **остаётся на VCS-табе** (свойство VCS-настроек):
  становится дропдауном, виден только при `buildSystem = WHISKEY`, редактируем при
  `EDIT_ANY_COMPONENT`.
- 🟡 **Q7.** Иллюстрация для не-technical компонентов — **показывать «Fix Version/s» явно**
  (симметрично technical → «SubComponent Fix Version/s»).
- ✅ **Q8.** (решение 2026-07-02, заменяет provisional): Hotfix Version Format **скрывать всегда,
  когда хотфиксы не включены** — независимо от того, задано ли значение в БД.

---

## 6. Бриф для Claude Design (входные данные)

- Скриншот текущего Jira-таба — есть (сессия 2026-07-02).
- Модель данных и лестница версий — §1.5, §R8 (рабочий пример прилагается).
- Поведенческие правила — §2 (R1–R11), включая условную видимость (hotfix, Whiskey),
  admin-only состояния и свёрнутые mirrored-поля с кнопками «Set separate…».
- Ограничения: shadcn/ui (Radix + Tailwind 4 + CVA), существующие паттерны редактора
  (sticky SaveBar, Review diff, FieldOverrideInline «+ Add override» должен остаться доступным
  у всех 9 override-полей), два потребителя — таб редактора и Create-диалог.
- Ключевая дизайн-задача: превратить «плоскую простыню форматов» в понятную историю:
  (1) Project Key — главный; (2) группа «Version formats» с лестницей-иллюстрацией и
  progressive disclosure (mirrored-поля свёрнуты); (3) служебные флаги (Technical admin-only,
  Skip Commit Check) — с объяснением последствий.
