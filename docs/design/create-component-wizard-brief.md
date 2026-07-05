# Design brief — «Create Component» wizard (multi-step, отдельная страница)

> Постановка для Claude Design. Цель — визуальный дизайн полноэкранного пошагового
> мастера создания компонента с финальным шагом-«сохранением», на котором
> показывается сводка/дифф изменений и вводятся Jira task key + commit message
> (как это уже сделано при редактировании компонента).
>
> **Границы scope.** Большинство формы перекомпоновывается в шаги, но **есть
> осознанные изменения модели/UI**, часть которых **требует правок request-builder
> (`buildCreateRequest`)** — т.е. это НЕ чистая перекомпоновка. Что меняется:
> - **Produced Artifacts** — переименование (user-facing) **+ per-group модель:**
>   каждая запись = Group ID + свой artifactId matching mode (+ tokens при EXPLICIT) →
>   **отдельная запись `artifactIds[]`** (`{versionRange:null, groupPattern, mode,
>   artifactTokens}`). Backend-таргет — **не** `ownership.groups`-строка, а массив
>   `artifactIds[]`. Сейчас `buildCreateRequest` склеивает группы в **один** mapping
>   (`groups.join(',')`) — **реализация должна перейти на per-group массив**.
> - Низкоуровневый контрол Group ID — **общий** для Create и Edit; Edit-секция выравнивается.
> - **Component profile (старт)** — 4 профиля задают `solution`/`external`/`explicit`;
>   сырых тумблеров External/Explicit в create нет (derived из профиля).
> - **Classification-тумблеры в редакторе переносятся** с Distribution-таба в General.
> - **Docker в Distribution — always-on**, вне explicit-гейта → **правка
>   request-builder** (сейчас Docker идёт через explicit+external-gated coordinate,
>   `buildCreateRequest.ts`); в Edit — отдельный left-nav пункт в группе Distribution.
> - **Jira task key — required** в create (required-guard поверх общего хелпера).
>
> То есть это дизайн wizard'а **плюс** перечисленные изменения модели/редактора и
> сопутствующие правки request-builder. Реализация под утверждённый макет — отдельная задача.

---

## 0. Терминология (user-facing)

Для нового мастера используем **один** термин в макете и во всём тексте:

- Режим создания из существующего компонента — **Clone** (не «Create from», не «Copy»).
- Точка входа / кнопка — **Clone**.
- Заголовок мастера в этом режиме — **«Clone {componentName}»** (или «Clone component»,
  если имя ещё не выбрано).
- Пояснение сути режима — **«pre-filled from source component»**.

Дизайн не должен вводить синонимы. Старый внутренний термин в UI не всплывает.

**Глоссарий переименований (user-facing → backend/поле).** Слева — что видит
пользователь; справа — backend-таргет. Enum-значения режима (`ALL` /
`ALL_EXCEPT_CLAIMED` / `EXPLICIT`) — неизменяемый контракт; **структура Produced
Artifacts меняется** на per-group `artifactIds[]` (см. §Границы scope и §4).

| User-facing (в макете)                          | Backend / поле                      |
|-------------------------------------------------|-------------------------------------|
| **Produced Artifacts** (секция)                 | `artifactIds[]` (было «Artifact ownership») |
| **Group ID** (один на запись)                   | `artifactIds[].groupPattern` (Maven groupId) |
| **artifactId matching mode**                    | `artifactIds[].mode`                |
| — All under the group ID                        | `ALL`                               |
| — All except artifacts assigned elsewhere †     | `ALL_EXCEPT_CLAIMED`                |
| — Specific artifacts only                       | `EXPLICIT`                          |
| **Specific artifacts**                          | `artifactIds[].artifactTokens`      |

† Лейбл `ALL_EXCEPT_CLAIMED` — **утверждён: «All except artifacts assigned elsewhere»**
и **обязательно с help-текстом** (короткий лейбл сам по себе искажает смысл). Точная
семантика (из кода, `OWNERSHIP_MODES.help`): «Owns any artifact in the group **not
explicitly assigned to another component in an overlapping range**». Ограничение: режим
поддерживает **только одну группу** (single Group ID; иначе валидатор — «supports a
single group only»). Не формулировать как «исключаются любые пересечения».

Запрет **на primary/видимые лейблы** новой секции Produced Artifacts (заголовок,
подписи полей, опции режима, кнопки): не использовать «ownership», «owned group»,
«claimed». Это **не** требует переписывать весь editor-only вспомогательный текст —
help-подписи, сообщения о конфликтах, «legacy preview» и т.п. могут сохранять
точную доменную лексику (в т.ч. «claimed»/«unclaimed»), если так корректнее по смыслу
(см. §4, Шаг 2 (Build → Produced Artifacts) — что именно выравнивается в редакторе, а что нет).

---

## 1. Контекст

**База кода для реализации.** Ветвиться и реализовывать — от последнего
**`origin/develop`** (на момент подготовки брифа — `cc5652b`, включает `#154`
version-format leading/derived pairs, `#155`, `#156` version-preview polish, `#157`
worktree-beside convention). Весь inventory полей в §4 сверен именно с этим develop.
Рабочая ветка create-wizard: `feature/create-component-wizard` (создана от
`origin/develop`, в worktree рядом с репо). **Не** базироваться на старых feature-ветках
(напр. `feature/general-tab-solution-labels-docs`) — они отстают и не содержат `#154`.

Portal — внутренний инструмент управления реестром компонентов.
Стек UI: **React 19 + Vite + shadcn/ui (Radix + Tailwind CSS 4 + CVA) + React Hook
Form + Zod + react-router 7**. Дизайн обязан быть **theme-aware** (light/dark) и
опираться на shadcn-компоненты и токены Tailwind, уже используемые в проекте.

### Как форма создания устроена сейчас

- Файл `frontend/src/components/CreateComponentDialog.tsx`.
- Это **одна длинная скроллящаяся форма внутри модального `Dialog`** (`sm:max-w-lg`,
  `max-h-[90vh] overflow-y-auto`), сгруппированная в несколько `<fieldset>`. Не мастер.
- Два режима (одна и та же форма):
  - **Scratch** — с нуля, префилл из `GET /config/component-defaults`.
  - **Clone** — префилл из компонента-источника («pre-filled from source
    component»); уникальные поля (key, VCS Path, Jira project key, coordinate) очищаются.
- **task/message сейчас инлайн**: fieldset «Change metadata» в самом низу формы
  (`jiraTaskKey` + `changeComment`), хранится в локальном `useState` вне RHF,
  подмешивается в запрос на submit.
- Submit: `POST /components` → тост → переход на `/components/{id}`.

### Эталон UX сохранения — редактор компонента

Именно его подачу переносим на создание:

- Sticky `SaveBar` → кнопка «Save changes» → модалка **`ReviewChangesDialog`**,
  которая одновременно (а) показывает **дифф изменений** и (б) собирает
  **Jira task key + commit message**, затем → один combined `PATCH`.
- Валидация ключа и нормализация — общие хелперы `frontend/src/lib/editor/jiraKey.ts`
  (`validateJiraKey`, `normalizeJiraKey`, `normalizeChangeComment`;
  regex `^[A-Z][A-Z0-9]+-\d+$`, пустой ключ допустим = «без ключа»). **Переиспользуем**
  — но в create Jira key **обязателен**, поэтому поверх хелпера нужен required-guard
  (см. §5.2; в edit остаётся optional).

---

## 2. Цель

1. Превратить создание компонента в **полноэкранный пошаговый мастер на отдельном
   маршруте** (`/components/new`), а не модалку.
2. **Вынести Jira task key + commit message на финальный шаг «Сохранение»** — по
   образцу `ReviewChangesDialog` редактора.
3. На финальном шаге показывать **сводку/дифф** создаваемой конфигурации
   (и, по возможности, **«full as-code»** представление — см. §6, открытый вопрос).
4. **Выровнять секцию «Produced Artifacts» в Edit-форме (редакторе)** под ту же
   терминологию и тот же add-row контрол Group ID, что и в Create (детали — §4, Шаг 2 (Build → Produced Artifacts)).

---

## 3. Маршрут и общий каркас страницы

- Новый роут **`/components/new`** (полноэкранный, не модалка). Роута пока нет —
  добавляется в `frontend/src/App.tsx` (текущий router — `createBrowserRouter`).
  - **Точки входа** (все ведут на новый роут):
    - **New Component** — кнопка на списке компонентов и в command palette → `/components/new`.
    - **Clone** — действие в строке таблицы и в диалоге на detail-странице →
      `/components/new?from={id}`.
  - Видимые лейблы в UI — именно **«New Component»** и **«Clone»** (см. §0 —
    единый термин).

  **Точные видимые строки (капитализация фиксирована — использовать дословно):**
  - entry-кнопка (список / palette): **`New Component`**
  - entry-действие (клон): **`Clone`**
  - header (scratch): **`Create component`** · header (clone): **`Clone {componentName}`**
  - финальная кнопка сабмита: **`Create component`**
  - навигация: **`Back`** / **`Next`** / **`Cancel`**
- Макет страницы:
  - **Header** — заголовок («Create component» / «Clone {name}»),
    крестик/«Cancel» для выхода (с подтверждением, если есть несохранённые данные).
  - **Stepper** — индикатор шагов (номер/название, состояния: done / current /
    upcoming / invalid). Клик по любому доступному шагу — переход к нему.
  - **Тело шага** — контент текущего шага (по центру, читаемая ширина ~`max-w-2xl`).
  - **Footer-навигация** — `Back` / `Next`; на последнем шаге — `Create component`.
    Кнопка `Next` заблокирована, пока поля текущего шага невалидны.
- Прогресс мастера при уходе со страницы — предупреждение о потере данных
  (аналог useBlocker в редакторе).

### 3.1. Кросс-шаговая валидация и навигация (важно)

Валидность **не локальна для шага** — гейты одного шага меняют требования на других.
Дизайн обязан это отразить:

- **Stepper помечает как invalid любой шаг**, а не только текущий: пользователь мог
  уйти вперёд, а более ранний шаг стал невалидным из-за более позднего гейта.
- **Кросс-шаговые зависимости, которые нужно визуализировать:**
  - Флаги **Explicit + External** (General/Classification, шаг 1) включают
    **клиентскую** required-ность Display Name / Release Managers / Security Champions —
    все **в том же шаге 1** (гейт локален), **и** Coordinate **(Maven/Package)** на
    шаге 5 Distribution → шаг 5 может «покраснеть» задним числом. Это **единственная**
    кросс-шаговая зависимость флагов. **Docker на шаге 5 не гейтится** (доступен всегда). **Copyright сюда НЕ входит** как захардкоженный флаг-гейт: его
    required-ность **config-driven** (service-config / field-config), не привязана к
    Explicit+External. В текущем конфиге copyright **не required**; другой конфиг может
    сделать его required — тогда клиент энфорсит required по field-config. **Валидность
    значения** (catalog) — только на сервере (Portal его не знает) → **400 inline**.
  - VCS-шаг (шаг 3) **постоянный** (не исчезает); при смене `buildSystem` на шаге 2
    меняется только **содержимое** шага (поля VCS ↔ нота «No VCS root required»).
  - async-валидация владельца (`componentOwner`, шаг 1 Ownership) может резолвиться с
    задержкой и **заблокировать финальный submit**, даже если шаг выглядел пройденным.
- **Финальный шаг** при наличии ошибок показывает их списком со **ссылками на
  конкретное поле/шаг** («Display Name required → перейти к шагу 1»), а не просто
  блокирует кнопку. Тупиков быть не должно.
- Изменение позднего гейта, инвалидирующее ранний шаг, должно быть **заметно**
  (маркер в stepper + баннер), а не молча блокировать `Create`.

### 3.2. Адаптивность (stepper + footer)

- **Desktop** — горизонтальный stepper сверху или вертикальный side-rail слева.
- **Footer** (`Back`/`Next`/`Create`) — sticky, кнопки не наезжают на контент формы.
- **Mobile — вне scope пока** (не актуально на этом этапе). Отдельный collapsed-stepper
  («шаг N из M» + `@media`) **не требуется** — при необходимости вернёмся позже.

### 3.3. Clone-режим: пояснение «что скопировано / что ввести заново» (обязательно)

В текущей форме clone-режим содержит важный info-блок «Included / Excluded», который
объясняет, что подтянулось из источника, а что **обязательно ввести заново**
(в первую очередь **VCS Path** и **Jira project key**, а также component key и
coordinate — они уникальны). Этот блок нельзя потерять в новом флоу.

- Дизайн обязан предусмотреть **место для этого пояснения в Clone-режиме** —
  рекомендуемо: info-баннер в header'е и/или на первом шаге, плюс подсветка
  очищенных обязательных полей на соответствующих шагах.
- Формат: две группы — **Included** (что скопировано из `{componentName}`) и
  **Excluded / re-enter** (уникальные поля: key, VCS Path, Jira project key, coordinate).
- В scratch-режиме блок не показывается.
- Текущее поведение — `CreateComponentDialog.tsx` (clone-режим, info-блок).

---

## 4. Разбивка на шаги

**Принцип: шаги Create = табы редактора (Edit); максимальная паритетность имён и
структуры.** Каждый шаг wizard зеркалит соответствующий таб редактора, а секции
внутри шага и их **имена — дословно как в Edit**. Цель — одна ментальная модель в
Create и Edit. Немногочисленные create-only отступления помечены явно.

**Соответствие Create-шаг ↔ Edit-таб:**

| Create-шаг | Edit-таб | Секции (имена как в Edit) |
|---|---|---|
| 1 **General** | General | Identity · Ownership · Metadata · **Classification** (в create — derived из профиля; в Edit — тумблеры) |
| 2 **Build** | Build | Build System · **Produced Artifacts** (перенесена из General — обе формы) |
| 3 **VCS** *(постоянный; поля условны)* | VCS | один VCS Entry |
| 4 **Jira** | Jira | Jira project · Version formats |
| 5 **Distribution** | Distribution | **Docker** (отдельная секция, не gated) + Coordinate (Maven/Package, gated на Explicit+External) |
| 6 **Review & create** | — (аналог `ReviewChangesDialog`) | Summary + task/message |

Табы редактора **без create-эквивалента** (Escrow, Documentation, Misc,
Supported Versions, Configurations, As Code, Overrides, History, Validation Problems)
в wizard **не входят** — это post-create/advanced. **Solution** не отдельный шаг: он
выбирается **профилем на старте** («Choose component profile»), который задаёт
`solution` и правила именования ключа (см. ниже). Post-create solution-таб (тумблер) —
отдельная админская история, вне create. Названия шагов в stepper —
дословно **General / Build / VCS / Jira / Distribution / Review & create**
(не «Basics»/«Основное»).

**Полный inventory полей → шаг/секция** (сверено с `origin/develop`, включая `#154`).
Это все поля формы; ничего вне этой таблицы в create нет.

| Шаг | Секция | Поле (backend) | User-facing | Примечание |
|-----|--------|----------------|-------------|------------|
| 1 General | Identity | `name` | Component Key | required, autofocus |
| 1 | Identity | `displayName` | Display Name | gated; required при explicit+external |
| 0 Старт | — | `solution`, `distributionExternal`, `distributionExplicit` | Component profile | выбор **Solution / DMP Bundle / Regular external / Regular internal**; задаёт все 3 флага + правила ключа; Clone — выводится из источника, editable |
| 0 Старт | — | `distributionExplicit` | «Has explicit distribution?» | вопрос **только для 2 regular-профилей**; Solution/DMP Bundle → explicit=true фикс |
| 1 | Ownership | `componentOwner` | Component Owner | required; префилл (scratch=current user, Clone=источник) |
| 1 | Ownership | `releaseManager` | Release Managers | people-list; required при explicit+external |
| 1 | Ownership | `securityChampion` | Security Champions | people-list; required при explicit+external |
| 1 | Metadata | `copyright` | Copyright | текст; required — config-driven (сейчас не required); значение — серверный 400 inline |
| 1 | Classification | `distributionExternal` / `distributionExplicit` | (derived) | в **create** выводятся из профиля (не тумблеры); read-only recap опц. В **Edit** — editable тумблеры в General (перенести с Distribution) |
| 2 Build | — | `buildSystem` | Build System | required, select |
| 2 Build | Produced Artifacts | `artifactIds[].groupPattern` | Group ID | per-group записи, «Add one more groupId» |
| 2 Build | Produced Artifacts | `artifactIds[].mode` | artifactId matching mode | radio, **дефолт ALL** / ALL_EXCEPT_CLAIMED / EXPLICIT |
| 2 Build | Produced Artifacts | `artifactIds[].artifactTokens` | Specific artifacts | только при EXPLICIT |
| 3 VCS *(постоянный; поля условны)* | VCS Entry | `vcsUrl` | VCS Path | ssh://, host allowlist; required когда `vcsBlockApplies`; для no-VCS систем — нота вместо полей |
| 3 | VCS Entry | `vcsBranch` | Production branch | |
| 3 | VCS Entry | `vcsTag` | Tag | |
| 4 Jira | Jira project | `jiraProjectKey` | Project Key | required |
| 4 | Version formats | `versionPrefix` | Version Prefix | scratch: зеркалит key |
| 4 | Version formats | `lineVersionFormat` | Line Version Format | leading (Line pair) |
| 4 | Version formats | `minorVersionFormat` | Minor Version Format | derived/mirror «from Line» |
| 4 | Version formats | `releaseVersionFormat` | Release Version Format | leading (Release pair) |
| 4 | Version formats | `buildVersionFormat` | Build Version Format | derived/mirror «same as release» |
| 5 Distribution | **Docker** (не gated) | `coordinate.imageName` [+ flavor] | Image Name | **всегда доступен**, независимо от explicit; отдельная секция/nav-пункт |
| 5 | Coordinate (gated) | `coordinate.type` | Coordinate type | maven / package; gated на Explicit+External (флаги из General) |
| 5 | Coordinate (gated) | `coordinate.groupPattern`, `coordinate.artifactPattern` | Group Pattern / Artifact Pattern | под-поля **maven** |
| 5 | Coordinate (gated) | `coordinate.packageType`, `coordinate.packageName` | Package Type / Package Name | под-поля **package** |
| 6 Review & create | — | `jiraTaskKey` | Jira task key | **required** (create-only; в edit optional), вне RHF |
| 6 | — | `changeComment` | Comment | optional, вне RHF |

> **Нет в create-форме** (осознанно): `hotfixVersionFormat` (активен только при
> заданном `hotfixBranch`, которого при создании нет) — не добавлять;
> `jira.versionFormat` («Full Version Format»), Jira-**Flags** (Technical /
> Releases-in-default-branch / Skip-Commit-Check), VCS Hotfix Branch / Name /
> Repository Type, System / Client Code (Metadata) — всё это **editor-only**, в create
> нет; multi-mapping / version-range overrides по артефактам — только в редакторе.

### Старт — Choose component profile (первый вопрос)

**Самый первый экран/вопрос wizard'а** — выбор профиля создаваемого компонента.
Профиль — **единый источник** для трёх булевых флагов (`solution`,
`distributionExternal`, `distributionExplicit`) и правил именования Component Key;
отдельных «сырых» тумблеров External/Explicit в create нет (они выводятся из профиля,
см. Classification ниже).

**Четыре профиля (фиксированные visible-лейблы — дословно):**

| Профиль | Требование к key | `external` | `explicit` | `solution` |
|---|---|---|---|---|
| **Solution** | содержит `-solution` | true | true | true |
| **DMP Bundle** | содержит `dmp-bundle` (2-й solution-паттерн) | true | true | true |
| **Regular external component** | базовый regex | true | **спросить** ↓ | false |
| **Regular internal component** | базовый regex | false | **спросить** ↓ | false |

- Для **Solution** и **DMP Bundle** флаги фиксированы (external+explicit=true) — они
  всегда триггерят gated-блок (Display Name / RM / SC / Coordinate, т.к. `explicit &&
  external`). Паттерны берутся из `solutionKeyPatterns` (`-solution` — первый,
  `dmp-bundle` — второй; §Правило `isSolutionCandidate`).
- Для двух **Regular** — после выбора профиля **явный вопрос:**
  **«Has explicit distribution?»** (может ли поставляться как отдельная единица) —
  yes/no → задаёт `distributionExplicit`. `external` фиксирован профилем
  (external=true у external-профиля, false у internal).
- **DMP Bundle** тоже ставит `solution = true` (подтверждено): оба паттерна —
  «solution candidate» по `isSolutionCandidate`. От «Solution» отличается только
  требуемым суффиксом ключа (`dmp-bundle` vs `-solution`).

**Правила Component Key по профилю** (base regex — см. Identity):
- Solution → base **+** содержит `-solution`.
- DMP Bundle → base **+** содержит `dmp-bundle`.
- Regular (оба) → **только** base `^[a-z][a-z0-9-]*$`; ключ **не должен** содержать
  solution-паттерны (иначе это solution/bundle — подсказать сменить профиль).

**Поток (scratch): профиль — отдельный ПЕРВЫЙ шаг-гейт.** В режиме с нуля wizard
сначала показывает **только** выбор профиля (4 карточки/радио) **+ для regular —
вопрос «Has explicit distribution?»**. Остальные поля/шаги **скрыты**, пока не нажата
**«Дальше»**. То есть: выбрал профиль (± explicit-distribution) → «Дальше» →
раскрываются General / Build / VCS / Jira / Distribution / Review. Обоснование: профиль
задаёт правила ключа и флаги, от которых зависят последующие поля и гейты, — логично
зафиксировать его первым.

**В Clone:** этот гейт-шаг **пропускается** — профиль **выводится из флагов источника**
(`solution`/`external`/`explicit` + key-паттерн), wizard открывается **сразу на форме**.
Профиль **остаётся редактируемым** (не lock; например, в верхней части / recap); при
смене — **сбросить/перепровалидировать Component Key** и пересчитать флаги (ключ в Clone
всё равно вводится заново как уникальное поле).

**Stepper:** в scratch первый шаг stepper'а — **Profile** (затем General/Build/…); в
clone шага Profile нет (профиль предзаполнен). Итоговые шаги: scratch = *Profile →
General → Build → VCS → Jira → Distribution → Review & create*; clone = без *Profile*.

> **Permissions:** роли и пермишены уже настроены — право создавать solution
> обеспечивается на уровне модели доступа, дизайну гейтить сам выбор профиля не нужно
> (энфорс — на бэке/permission-слое). Не блокер.

### Шаг 1 — General

Зеркалит **General-таб** редактора; секции: Identity / Ownership / Metadata /
**Classification** (Explicit/External). **Produced Artifacts здесь НЕТ — перенесена в
шаг Build** (см. Шаг 2). Classification в create — derived из профиля (не тумблеры); в
Edit — тумблеры в General (редактор привести к этому, см. ниже).

#### Identity
- **Component Key** `name` — обязательное, autofocus. **Валидация зависит от профиля**
  (полная матрица — таблица в «Choose component profile»; все 4 профиля):
  - **Regular external component / Regular internal component:** только базовые правила
    — lowercase, латинские буквы/цифры, разделитель `-`, **первый символ — не цифра**
    (буква), т.е. `^[a-z][a-z0-9-]*$`; ключ **не должен** содержать solution-паттерны.
  - **Solution:** базовые правила **плюс** ключ содержит `-solution`.
  - **DMP Bundle:** базовые правила **плюс** ключ содержит `dmp-bundle`.
  - (паттерны — из `solutionKeyPatterns`, `isSolutionCandidate`; иначе inline-ошибка
    «solution/bundle key must contain …»).
  - **Намеренно строже для НОВЫХ компонентов.** Старый `NAME_REGEX =
    ^[a-zA-Z0-9_\-./]+$` (Upper/`_`/`.`/`/`) — это легаси-толерантность для уже
    существующих имён; **новые** компоненты создаются по строгой конвенции выше.
    Это осознанная политика create-формы, а не сверка с бэком.
- **Display Name** `displayName` — gated (field-config); обязателен при explicit+external.
- *(Solution surface: отдельного тумблера/беджа в Identity больше нет — факт
  solution определяется профилем на старте. Правило `isSolutionCandidate` —
  `frontend/src/lib/solutionKey.ts`, `name.includes(p)`; паттерны из
  `/portal/config.solutionKeyPatterns`; бэкенд зеркалит.)*

#### Ownership *(имя секции — как в Edit)*
- **Component Owner** `componentOwner` — people-picker (async AD lookup), обязателен.
  Префилл: **scratch** — текущий пользователь (`useCurrentUser().data?.username`);
  **Clone** — из исходного компонента. Значение редактируемо.
- **Release Managers** `releaseManager` — people-list; обязателен при explicit+external.
- **Security Champions** `securityChampion` — people-list; обязателен при explicit+external.
- В Edit RM/SC всегда живут в Ownership; в Create показываем их **так же** (в этой
  секции), а required-маркер включается флагами Explicit+External (ниже, тот же шаг).

#### Metadata
- **Copyright** `copyright` — текст. Required-ность **config-driven** (service-config /
  field-config): в текущем конфиге **не required**, другой конфиг может сделать
  required (тогда клиент энфорсит по field-config). Валидность значения (catalog) не
  проверяется клиентом — только серверный **400 inline** (§3.1).
- *(System / Client Code из Metadata-секции редактора — editor-only, в create нет.)*

#### Classification
Флаги-классификаторы `distributionExternal` / `distributionExplicit` (по использованию
/ по типу распространения) + `solution`.

- **В Create флаги НЕ редактируются тумблерами** — они **выводятся из профиля**
  (см. «Старт — Choose component profile»): профиль задаёт `external`/`solution`, а для
  regular-профилей `explicit` — из вопроса «Has explicit distribution?». Отдельной
  editable Classification-секции в create нет; допустим **read-only recap** («External,
  implicit distribution» и т.п.) для прозрачности. tooltip-тексты — §10.
- Gated-блок (Display Name / RM / SC / Coordinate) требуется **только когда**
  `explicit && external` — т.е. для профилей **Solution / DMP Bundle** и для **Regular
  external + explicit distribution = yes**. Для остальных не required. Copyright флагами
  не гейтится — его required-ность config-driven (§3.1).
- **В Edit** (редактор) `external`/`explicit` остаются **редактируемыми тумблерами** в
  секции General/**Classification** (профиля в редакторе нет — там правят готовый
  компонент). **Требуется правка редактора:** перенести эти два тумблера с
  Distribution-таба в General-таб. Tooltip-тексты (§10):
  - **External** — предоставляется клиенту; выкл. — только внутреннее использование.
  - **Explicit** — есть собственный дистрибутив (отдельная единица); выкл. — неявно,
    в составе дистрибутива пакетного компонента.

### Шаг 2 — Build

Зеркалит **Build-таб** редактора. Содержит **Build System** и секцию **Produced
Artifacts** (плюрал — «artifacts»). **Produced Artifacts перенесена сюда из General —
в обеих формах** (в редакторе секция «Artifact IDs» переезжает с General-таба на
Build-таб; см. editor-alignment ниже).
- **Build System** `buildSystem` — select, обязательное (устаревший `BS2_0` скрыт).

#### Produced Artifacts

Секция описывает, какие артефакты **производит** этот компонент — по ним компонент
резолвится по артефакту. (Ранее называлась «Artifact ownership» — термин заменён.)
Подпись секции: «artifacts this component produces».

**Структура — список per-group записей.** matching mode — **правило на конкретный
groupId**, не одно на всю секцию. Каждая запись = **один Group ID + его artifactId
matching mode** (+ Specific artifacts, если EXPLICIT).

**User-facing лейблы (обязательно использовать в макете):**
- **Group ID** — Maven **groupId** (`ownership.groups`). Не «group» / «owned group» —
  именно **Group ID**. Один groupId на запись.
- **artifactId matching mode** — `ownership.mode` **для этого groupId**, radio
  (label → backend-значение). **Дефолт — `ALL` («All under the group ID»)**; пустого
  «— select matching mode —» состояния НЕТ (mode всегда задан, меняется при
  необходимости):
  - **All under the group ID** → `ALL` *(default)*
  - **All except artifacts assigned elsewhere** → `ALL_EXCEPT_CLAIMED` (утверждённый
    лейбл) — **обязателен help-текст** (короткий лейбл искажает смысл): «Owns any
    artifact in the group not explicitly assigned to another component in an overlapping
    range» (см. глоссарий †). «claimed» — допустимо в help-тексте, не в primary-лейбле.
  - **Specific artifacts only** → `EXPLICIT`
- **Specific artifacts** — `ownership.tokens` **для этого groupId**; показывается
  **только** при `EXPLICIT`.

**Повторяемость и «Add one more groupId»:**
- Каждая запись — свой Group ID + matching mode (дефолт `ALL`) (+ tokens при EXPLICIT),
  с кнопкой удаления. Минимум одна запись.
- matching mode задан по умолчанию (`ALL`) → отдельно «выбирать mode» не требуется.
  **«Add one more groupId» доступна, когда у текущей записи заполнен Group ID** (и, при
  `EXPLICIT`, есть хотя бы один Specific artifact). Пустые записи не отправляются.

**Payload-контракт:** `artifactIds` — **массив** `ArtifactIdRequest {versionRange:null,
groupPattern, mode, artifactTokens}`; **каждая запись → своя запись массива**
(`groupPattern` = этот один group; **не** comma-join нескольких групп под один mode).
Тип `artifactIds` уже массив, но **`buildCreateRequest` СЕЙЧАС строит один элемент** с
`groupPattern: groups.join(',')` под общий mode (`buildCreateRequest.ts`) — **реализация
должна перейти на per-group: по одному `ArtifactIdRequest` на каждую запись.** Правило
single-group для `ALL_EXCEPT_CLAIMED` тогда **естественно** — одна группа на запись.

**Мгновенная проверка конфликта по паре (groupId, artifactId).** Требование:
проверять пересечение с артефактами **других компонентов сразу при вводе**
(debounced / on-blur), а не только на сохранении. UX:
- Триггерится на координатах, которые компонент объявляет: `Group ID` + artifactId
  из **Specific artifacts** (`ownership.tokens`) — т.е. по паре **(groupId, artifactId)**.
  Для режимов `ALL`/`ALL_EXCEPT_CLAIMED` (без artifactId) — проверка на уровне
  пересечения groupId с чужими явными координатами.
- Состояния поля: **checking…** → **ok** → **conflict** (inline у строки, не только
  общий баннер). При конфликте — показать, **какой компонент** уже владеет парой,
  со ссылкой на него.
- Это про **cross-component** конфликт. Текущая клиентская проверка
  (`detectIntraComponentConflicts`) — только **внутри** одного компонента; её не
  ломаем, cross-component добавляется поверх.

> **Открытый вопрос — источник данных (backend-зависимость).** Готового эндпоинта
> resolve-by-координате нет: в спеке есть только `components/meta/group-keys` и
> `components/meta/owners`, но **нет** «кто владеет (groupId, artifactId)». Значит
> мгновенная кросс-компонентная проверка требует **нового backend-эндпоинта**
> (напр. `GET …/resolve?groupId=&artifactId=` → владелец, или dedicated
> conflict-check). Аналог открытого вопроса as-code (§6). **Fallback без бэкенда:**
> серверный `409`/value-conflict на сохранении (существует уже сейчас) — дизайн
> должен предусмотреть и это состояние (ошибка на финальном шаге, §5.3). Дизайнить
> оба: инлайн-проверку (желаемое) + save-time конфликт (гарантированное).

> Enum-значения режима (`ALL` / `ALL_EXCEPT_CLAIMED` / `EXPLICIT`) — контракт, не
> меняются. **Структура секции меняется** на per-group `artifactIds[]` (см. §Границы
> scope и выше); user-facing лейблы — по глоссарию.

#### Выравнивание с Edit-формой (редактор) — ограниченный deliverable

Секция «produced artifacts» существует **и в редакторе** (`ArtifactOwnershipEditor`,
сейчас в `GeneralTab.tsx`). **Её тоже переносим: с General-таба на Build-таб** — чтобы
совпадало с create (Produced Artifacts живёт в Build в обеих формах).

> **⚠️ Границы для Claude Design (читать первым).** От дизайна нужен ровно **один
> вариант editor mapping-card** с новой терминологией и add-row Group ID — **НЕ**
> весь редактор. **Вне scope макета:** множественные mapping'ы, base «Applies to all
> versions» + «Version-range overrides», их кнопки «Add …», detection конфликтов,
> «legacy preview» — это продвинутая **editor-only** структура, её в макет wizard'а
> тянуть **не надо**. Create даёт только **base layer** (`versionRange:null`) — без
> version-range overrides, — но в нём **несколько per-group записей** (по одной на
> Group ID); add-row Group ID добавляет такие записи.

Требование: секция в редакторе должна **называться и выглядеть так же**, что и в
Create — единая терминология и тот же add-row контрол Group ID. Что выровнять
(текущие лейблы → новые), в пределах одного mapping-card:
- Заголовок секции «Artifact IDs» / карточка «Artifact coordinates» → **Produced Artifacts**.
- Режим `ownership.mode`, сейчас лейбл **«Owns»** → **artifactId matching mode** (+ те же опции,
  что в глоссарии). «claimed» — только в help-тексте, не в primary-лейбле (см. §0).
- Токены `ownership.tokens`, сейчас лейбл **«Artifacts»** → **Specific artifacts**.
- **«Group ID»** — в редакторе лейбл уже совпадает; заменить единый comma-separated
  input на тот же **повторяемый add-row контрол** «Add one more groupId» (как в Create).

Единый низкоуровневый контрол Group ID стоит **сделать общим** (по образцу уже общих
`ModeRadioGroup` и `ArtifactTokensInput`), чтобы Create и Edit не разъезжались.
Вспомогательные editor-only тексты (conflict/legacy) переименовывать не обязательно
(§0) — важна согласованность primary-лейблов и контрола.

**Ещё одно выравнивание редактора:** перенести тумблеры **Explicit / External** с
**Distribution-таба** в **General-таб** (секция Classification) — чтобы совпадало с
Create (см. §4, Шаг 1 → Classification). После переноса Distribution-таб редактора =
только артефакты/координаты.

### Шаг 3 — VCS *(постоянный шаг; поля условны)*

Зеркалит **VCS-таб** редактора (секция VCS Entry). **VCS — постоянный шаг stepper'а**
(как VCS-таб в редакторе; VCS нужен в ~99% случаев — НЕ прятать шаг по умолчанию, в т.ч.
когда build system ещё не выбран). Условны только **поля внутри**:
- Если `vcsBlockApplies(buildSystem)` (почти все системы) — показываем поля VCS,
  `VCS Path` обязателен.
- Для **no-VCS build systems** (`vcsBlockApplies=false`: WHISKEY / PROVIDED / ESCROW_* /
  BS2_0) — вместо полей **нота** «No VCS root required for {buildSystem}» (VCS Path не
  обязателен, ничего не отправляем). Шаг **остаётся** в stepper'е (не исчезает).
- До выбора build system — шаг виден, показываем поля (99%-путь) / нейтральную
  подсказку выбрать build system.

Лейблы — **как в Edit** (не «VCS URL»/«Branch»):
- **VCS Path** `vcsUrl` — формат `ssh://…`, host из allowlist; обязателен когда
  `vcsBlockApplies`. *(В Edit путь = `vcs.vcsPath`, лейбл «VCS Path».)*
- **Production branch** `vcsBranch` — лейбл «Production branch» (как в Edit).
- **Tag** `vcsTag`.
- *(Hotfix Branch / Name / Repository Type из VCS Entry редактора — editor-only, в
  create нет.)*

### Шаг 4 — Jira

Зеркалит **Jira-таб**; секции «Jira project» и «Version formats» (имена как в Edit).
Владелец сюда **не входит** — он в General/Ownership (паритет).

#### Jira project
- **Project Key** `jiraProjectKey` — обязателен.

#### Version formats
- **Version Prefix** `versionPrefix` — в scratch-режиме зеркалит ключ, пока не отредактируют.
- **Две leading/derived пары** (модель `#154`, контрол
  `CreateMirrorField`; выровнено с редактором):
  - **Line pair:** *Line Version Format* `lineVersionFormat` (leading, помечен «(Major)»)
    → *Minor Version Format* `minorVersionFormat` (**derived/mirror**, pill «from Line»).
  - **Release pair:** *Release Version Format* `releaseVersionFormat` (leading)
    → *Build Version Format* `buildVersionFormat` (**derived/mirror**, pill «same as release»).
  - Поведение mirror: derived-поле **зеркалит** leading и не редактируется, пока не
    нажать **«Set separate … format»** — тогда появляется отдельный editable-input
    (и «Remove separate» — вернуть к зеркалу). Дизайн должен показать оба состояния:
    свёрнутое (pill «from Line» / «same as release») и раскрытое (отдельное поле).
  - **Hotfix Version Format в create-форме НЕТ.** Hotfix включается только когда
    задан **`hotfixBranch`**, которого при создании ещё нет → hotfix при создании
    неактивен. **Не добавлять** ни поле `hotfixVersionFormat`, ни отдельный
    hotfix-sample, ни hotfix-toggle, ни строку «Hotfix Version» в Summary.
    *(В текущем макете Claude Design это ошибочно присутствует — убрать.)*
  - Все форматы — monospace, плейсхолдеры-примеры (`$major.$minor`, `$major.$minor.$service`…).

### Шаг 5 — Distribution

Зеркалит **Distribution-таб** редактора. Флаги Explicit/External — в General/Classification
(здесь их нет). Две **независимые** части:

**5a. Docker — отдельная секция, НЕ гейтится на explicit.**
- **Docker** (Image Name `coordinate.imageName` [+ Flavor как в Edit]) доступен
  **всегда**, независимо от Explicit/External — компонент может публиковать Docker-образ
  и при `explicit=false` (неявно дистрибутируемый).
- Обоснование: в редакторе Distribution-артефакты **не** гейтятся на explicit (только
  `canEdit`/permission), поэтому для Docker create приводится к тому же — always-on.
- **Правка реализации:** сейчас `buildCreateRequest` шлёт distribution coordinate
  (в т.ч. Docker) через **explicit+external-gated** `coordinatePatch` — Docker надо
  вывести из этого гейта (отправлять всегда, когда задан Image Name).
- **Выделить Docker в самостоятельную секцию/пункт** (в create-шаге — свой блок; в
  **editor** — отдельный пункт left-nav в группе Distribution, вынесенный из общего
  Distribution-таба).

**5b. Coordinate (Maven / Package) — gated на Explicit+External.**
- **Осознанное create-only правило** (не editor-parity): distribution-coordinate
  Maven/Package имеет смысл только для явно-дистрибутируемого внешнего компонента,
  поэтому в **create** он показывается/обязателен только при Explicit+External (флаги из
  General → кросс-шаговая зависимость, см. §3.1). *(В **editor** эти секции не гейтятся
  на explicit — там правят готовый компонент; это допустимое create/edit-отличие.)*
  Лейблы — **как в Distribution-табе Edit**:
  - **maven** → **Group Pattern** `coordinate.groupPattern` + **Artifact Pattern** `coordinate.artifactPattern`;
  - **package** → **Package Type** `coordinate.packageType` + **Package Name** `coordinate.packageName`.
  Показывать под-поля только для выбранного типа.
- *(В Edit Distribution допускает несколько строк на тип — Create даёт по одной;
  multi-row — editor-only.)*

### Шаг 6 — Review & create
Финальный шаг. См. §5.

> Порядок и группировку менять не рекомендуется — они выбраны для **паритета с
> табами Edit** (осознанное решение). Create-only отличия:
> - **сокращения:** нет Hotfix; Produced Artifacts — только base layer
>   (`versionRange:null`, несколько per-group записей), без version-range overrides;
>   по одной строке на distribution-тип (без multi-row);
> - **осознанные create/edit-расхождения:** Jira task key required (в Edit optional);
>   Classification в create — derived из профиля (в Edit — тумблеры); Maven/Package
>   coordinate в create gated на Explicit+External (в Edit не гейтится). Docker —
>   always-on в обеих формах.
>
> VCS — **постоянный** шаг (условно только его содержимое) и gated-поля учесть обязательно.

---

## 5. Финальный шаг «Сохранение»

Комбинирует три вещи на одном экране (аналог `ReviewChangesDialog`, но для create):

1. **Сводка/дифф создаваемой конфигурации.**
   - У создания нет «прежнего состояния», поэтому это по сути список «что будет
     создано»: все заполненные поля, сгруппированные по секциям (как шаги).
   - Визуально можно переиспользовать язык диффа редактора (см. §7): моноширинный
     мелкий текст, значения-«добавления» зелёным с префиксом `+`, hairline-разделители
     между полями, жирные лейблы секций. Пустые/незаполненные поля — muted или скрыты.
   - **Summary — основное и дефолтное представление.** «full as-code» превью —
     только опционально-зарезервированное состояние (см. §6); базовый макет
     проектируем Summary-only.

2. **Change metadata** (переезжает сюда из инлайн-fieldset):
   - **Jira task key** — input, placeholder `ABC-123`, **обязателен** (помечен
     `*`), inline-валидация по regex `^[A-Z][A-Z0-9]+-\d+$`.
     **⚠️ Отличие от редактора:** в edit-форме Jira key **optional**, а при
     **создании компонента — required**. Реализационно: общий `validateJiraKey`
     считает пустой ключ валидным («без ключа») — для create поверх него нужен
     дополнительный **required-guard** (пустое значение → ошибка «required»,
     блокирует Create).
   - **Commit message / comment** — textarea, «(optional)».

3. **Кнопка `Create component`** + контракт ошибок (важно для мастера):
   - Кнопка заблокирована, пока Jira key пуст/невалиден (required), или во время
     отправки; спиннер на время запроса.
   - Ошибки сервера могут относиться к полям на **более ранних шагах**. Поэтому:
     - На финальном шаге — **постоянный destructive-баннер** с сообщением сервера
       (409 конфликт ключа, 400 по полям), как в редакторе.
     - Плюс **маркеры ошибок в stepper** на затронутых шагах.
     - **Клик по ошибке ведёт на нужный шаг/поле.** 400, отрутенный на скрытое/
       офскрин-поле, не должен превращаться в тупик без объяснения.

---

## 6. Открытый вопрос — «full as-code» на шаге создания

«As Code» уже существует, но:
- Это **read-only вкладка существующего компонента**
  (`frontend/src/components/editor/AsCodeTab.tsx`), данные тянутся через
  **`GET /components/{id}/as-code`** — DSL рендерит **сервер**
  (`ComponentCodeRenderer`), фронт только подсвечивает (`CodeBlock` +
  `asCodeHighlight.ts`). Есть toggle Full/Resolved и кнопка Copy.
- **У создаваемого компонента нет `id`** и нет клиентского сериализатора в DSL —
  значит «full as-code» превью на шаге сохранения нельзя получить тем же путём.

- **A. Diff-style сводка** (не требует бэкенда) — показываем поля как «добавления».
  **Дефолт: базовый UI шипится Summary-only.** Точно реализуемо сегодня.
- **B. Full as-code превью** — потребует нового серверного preview-эндпоинта,
  рендерящего DSL из create-request (пока **не существует**).

**Указание дизайну:** не тратить площадь на несобираемую сейчас вкладку. Достаточно
**зарезервировать состояние** под будущий переключатель «Summary ↔ As code» (как это
выглядело бы, где кнопка), но основной макет и все проработанные состояния — вокруг
Summary. Полноценный as-code-таб (код с подсветкой + Copy, визуально как `CodeBlock`)
детализируем только если/когда появится preview-эндпоинт.

---

## 7. Визуальный язык для переиспользования

**Diff-строки редактора** (`ReviewChangesDialog.tsx`) — образец для сводки:
- Контейнер: скроллбокс `rounded-md border`, внутри список с hairline-разделителями
  (`divide-y text-sm`).
- Строка: жирный лейбл поля (`font-medium text-foreground`), ниже значение
  моноширинным мелким (`font-mono text-xs`).
- Скалярное изменение: `старое` (destructive-красный + strikethrough) → muted-стрелка
  `ArrowRight` → `новое` (зелёный, `var(--color-badge-green-fg)`).
- Списки: построчно, удаления `− line` красным/зачёркнуто, добавления `+ line` зелёным.
- Для **создания** релевантны только «добавления» (зелёные `+`).

**As-code блок** (`CodeBlock.tsx` + `asCodeHighlight.ts`):
- Read-only `<pre><code>` `font-mono text-xs`, токен-подсветка: header — rose,
  property — sky, string — emerald, enum — amber, keyword — purple, number — cyan
  (все с dark-вариантами). Кнопка Copy.

Общие принципы: shadcn-компоненты, Tailwind-токены проекта, аккуратные состояния
(loading skeleton при префилле, disabled-кнопки, destructive-баннеры ошибок),
адаптивность и обе темы.

---

## 8. Что дизайн задаёт (deliverable)

- Единый термин **Clone** во всём макете (§0).
- Полноэкранный layout `/components/new`: header + stepper + тело + footer-навигация.
- Внешний вид stepper'а и всех его состояний, включая **invalid на любом (в т.ч.
  раннем) шаге** и клик-навигацию (§3.1).
- Адаптив stepper'а/footer'а: desktop (mobile — вне scope пока, §3.2).
- Clone-режим: info-блок «Included / Excluded (re-enter)» (§3.3).
- **Choose component profile** — **в scratch это отдельный ПЕРВЫЙ шаг-гейт:** только
  выбор профиля (**4:** Solution / DMP Bundle / Regular external component / Regular
  internal component) **+ для regular — «Has explicit distribution?»**; остальные
  поля/шаги скрыты до нажатия «Дальше». Профиль задаёт `solution`+`external`+`explicit`
  и правила ключа. **В Clone** шаг Profile **пропускается** (профиль выведен из
  источника, форма открывается сразу; профиль editable, смена → reset ключа + пересчёт
  флагов). Показать оба режима — не пропустить (§4, «Старт»).
- **Паритет с Edit:** шаги = табы редактора (**General / Build / VCS / Jira /
  Distribution / Review & create**), имена секций внутри — как в Edit (§4).
- Макет каждого шага (§4), включая постоянный VCS-шаг (условно его содержимое) и gated-поля.
- Шаг 1 **General** — секции Identity / Ownership / Metadata / **Classification**
  (Explicit/External). Флаги Explicit/External в General в обеих формах (в редакторе
  перенести их с Distribution-таба в General).
- **Produced Artifacts живёт в шаге Build** (не в General) — в обеих формах; в редакторе
  секция переезжает с General-таба на Build-таб. Плюрал в лейбле — **Produced Artifacts**.
- Секция **Produced Artifacts** (в Build): **per-group** записи — Group ID + свой
  **artifactId matching mode** (**дефолт ALL**, без пустого «select») + **Specific
  artifacts** при EXPLICIT; «Add one more groupId» доступна когда заполнен Group ID.
  Переименования vs editor: «Owns»→artifactId matching mode, «Artifacts»→Specific
  artifacts, «Artifact IDs»→Produced Artifacts.
- **Distribution:** **Docker — отдельная секция, доступна всегда** (не gated на explicit;
  в editor — свой left-nav пункт в группе Distribution); Coordinate (Maven/Package) —
  gated на Explicit+External.
- Инлайн-проверка конфликта по паре **(groupId, artifactId)** с другими компонентами:
  состояния **checking / ok / conflict** (с ссылкой на компонент-владельца) + save-time
  fallback-конфликт (§4, Шаг 2 Build → Produced Artifacts — backend-зависимость).
  Save-time conflict по Produced Artifacts должен вести на шаг **Build** (не General).
- Tooltip/help-тексты (§10) для **component / External / Explicit** —
  санитизированные (без org/продуктовых токенов).
- Финальный шаг «Сохранение» (§5): **Summary-only по умолчанию** (as-code — лишь
  зарезервированное состояние, §6) + Jira key/comment + Create + контракт ошибок
  (баннер + маркеры в stepper + клик-навигация к полю).
- Пустые/loading/error-состояния, light + dark.
- Различие заголовка для scratch vs Clone.

## 9. Вне рамок дизайна (переиспользуется — база, расширяется create-only)

**Базовые** схемы/хелперы переиспользуются, но **расширяются create-only guard'ами**
из §4/§5 (не «как есть»):
- Zod-схема и cross-field валидации — как основа; **добавляются create-only правила:**
  required Jira key, строгий Component Key regex (profile-dependent), config-driven
  required (напр. Copyright).
- Хелперы `jiraKey.ts` (+ required-guard поверх), построение запроса
  `buildCreateRequest.ts`, мутация `useCreateComponent` (`POST /components`).
- Режимы scratch/clone, префилл-эндпоинты, field-config видимость/required полей.

**Правило видимости для read-only беджей/баннеров.** Любой read-only бедж/баннер,
который зеркалит поле (напр. **System-бедж** в хедере редактора; System — editor-only),
обязан уважать **field-config visibility**: при `hidden` бедж **не рендерится** (не
только сам input скрыт). Не показывать System-бедж, если `component.system` = hidden.

---

## 10. Справочные тексты (tooltips / help) — санитизированные

Источник — внутренний глоссарий «Component». **Тексты уже очищены** от запрещённых
токенов и такими должны попасть в макет/код.

> **⚠️ Запрет токенов (CI Content Validation роняет build; поэтому и здесь литералы
> не пишем).** Нигде в брифе, макете, подсказках, коде и сообщениях **не
> использовать**: имя организации/вендора; аббревиатуру подразделения разработки;
> имя системы/продукта и названия конкретных примеров-компонентов из исходного
> глоссария; ссылки на внутреннюю wiki. Формулировать **нейтрально** («система»,
> «продукт», «поставляется клиенту», «внутреннее использование», «отдельный
> дистрибутив»).

**Component (что такое компонент)** — для intro/подсказки:
> Компонент — программный модуль с собственной сборкой и версионированием.
> Компоненты могут быть организованы в иерархическую (пакетную) структуру.
> Каждый компонент регистрируется в реестре компонентов и в Jira.

**Component profile (4 карточки, тексты для старта):**
> - **Solution** — верхнеуровневый компонент-solution, группирующий и поставляющий
>   другие компоненты вместе. Ключ содержит `-solution`. Внешний, с собственным
>   дистрибутивом.
> - **DMP Bundle** — компонент-бандл (тоже solution). Ключ содержит `dmp-bundle`.
>   Внешний, с собственным дистрибутивом.
> - **Regular external component** — обычный компонент, поставляется клиенту.
> - **Regular internal component** — обычный компонент только для внутреннего
>   использования, клиенту не поставляется.

**Вопрос для двух Regular-профилей:**
> **Has explicit distribution?** — Есть ли у компонента собственный дистрибутив,
> т.е. может ли он поставляться как отдельная единица? Нет → распространяется в
> составе дистрибутива пакетного компонента.

**Классификация** — тексты для **profile recap в Create** (флаги derived из профиля +
вопрос «Has explicit distribution?») и для **тумблеров Classification в Edit**:

- **External** (`distributionExternal`) — *по использованию*:
  > **External** — компонент предоставляется клиенту. Выключено = **internal**:
  > используется только внутри, клиенту не поставляется.

- **Explicit** (`distributionExplicit`) — *по типу распределения*:
  > **Explicit** — у компонента отдельный собственный дистрибутив (явно
  > дистрибутируемый). Выключено = неявно дистрибутируемый: распространяется в
  > составе дистрибутива пакетного компонента.

*(EN-вариант для лейблов/подсказок при желании — те же формулировки в переводе;
англ. исходник глоссария сохраняет тот же смысл, но без org/продуктовых токенов.)*
