# Create Component Wizard — правки к макету (итерация 2 для Claude Design)

Скармливать вместе с `create-component-wizard-brief.md`. Ниже — дельта между текущим
макетом и брифом. Сгруппировано по приоритету. **«Хорошо покрыто» — не трогать.**

## Итерация N+1 — добить перенос Produced Artifacts → Build (state/summary/routing) + C4

Визуально Produced Artifacts переехали в Build, но привязки к General остались. Доделать:

- **D1 (C4): `addArtifact()` создаёт строку с `mode: 'ALL'`, не `''`.** Seed уже `ALL`,
  но добавление новой строки даёт `{mode:''}` → рассинхрон UI/payload. Пустого mode быть
  не должно; «Add one more» — по заполненному Group ID (условие `mode===''` убрать).
- **D2: save-time conflict по Produced Artifacts → шаг `build`.** Сейчас
  `serverError.stepId='general'` и CTA «Go to General» для Group ID conflict — заменить
  на `build` / «Go to Build».
- **D3: Summary — Produced artifact строки в Build-группу, не General.** Сейчас строки
  добавляются в `genRows`; перенести в `buildRows` (Build = Build System + Produced
  Artifacts).
- **D4: Editor mapping-card preview — breadcrumb `Editor › Build`** (секция в редакторе
  переезжает с General-tab на Build-tab). Либо две зоны alignment: `General/Classification`
  и `Build/Produced Artifacts`.
- **D5: General subtitle** — убрать «…and the artifacts this component produces»
  (артефакты теперь в Build). Напр.: «Profile, identity, ownership».
- **D6: VCS tooltip** — заменить «WHISKEY / PROVIDED skip the VCS step» на «VCS fields
  are not required for these build systems; the step shows a note» (шаг постоянный).
- **D7: System-бедж уважает field-config `hidden`.** Read-only бедж с системой (хедер
  редактора) **не рендерить**, если `component.system` скрыт (visibility=hidden). Общее
  правило: read-only бедж/баннер, зеркалящий поле, при `hidden` не показывается.

## MUST-FIX

### Структура и имена (паритет с табами редактора)
1. **Шаги = табы Edit:** `General → Build → VCS → Jira → Distribution → Review & create`.
   Переименовать шаг 1 **Basics → General**. Имена секций внутри — как в редакторе.
2. **Шаг General**, секции по порядку:
   - **Identity:** Component Key, Display Name.
   - **Ownership:** Component Owner, **Release Managers**, **Security Champions**
     (перенести Owner сюда из бывшего «Jira & owner»; RM/SC — сюда из Distribution).
   - **Metadata:** Copyright (перенести из Distribution).
   - **Classification:** тумблеры **External**, **Explicit** (перенести из Distribution;
     это классификация компонента, не механика дистрибутива).
   - *(Produced Artifacts здесь НЕТ — переехала в Build, см. п.3 и C7.)*
3. **Шаг Build** — **Build System + Produced Artifacts** (секция перенесена сюда из
   General, см. C7).
4. **Шаг Jira** — секции **Jira project** (Project Key) и **Version formats**
   (Version Prefix + пары Line/Minor, Release/Build). Owner здесь НЕ показывать.
5. **Шаг Distribution** — только **Coordinate**: maven → Group Pattern + Artifact
   Pattern; docker → Image Name; package → Package Type + Package Name. Флагов здесь нет.
6. **VCS** — лейблы как в Edit: **VCS Path** (не «VCS URL»), **Production branch**
   (не «Branch»), Tag.

### Поля
7. **Убрать Hotfix полностью** — поле `hotfixVersionFormat`, отдельный hotfix-sample,
   hotfix-toggle (ladder) и строку «Hotfix Version» в Summary. Хотфикс активен только
   при заданном `hotfixBranch`, которого при создании нет.
8. **Jira task key — required** (пометить `*`, блокировать Create при пустом/невалидном).
   Comment — optional. *(В Edit key остаётся optional — это create-only отличие.)*

### Недостающие состояния (добавить — это ключевые P1/P2)
9. **Conflict-check по паре (groupId, artifactId)** в Produced Artifacts:
   inline-состояния у строки **checking… / ok / conflict**, при конфликте — ссылка на
   **компонент-владельца**; плюс save-time fallback-конфликт. Это **отдельно** от
   Jira-key 409 (который сейчас единственный смоделированный). Состояния нарисовать
   даже при том, что backend-эндпоинт ещё под вопросом (mock).
10. **Отдельный вариант editor mapping-card** (не только wizard): одна карточка
    Produced Artifacts в редакторе с той же терминологией (Produced Artifacts /
    artifactId matching mode / Specific artifacts) и тем же add-row Group ID «Add one more groupId».
    Плюс показать перенос Explicit/External в General редактора. НЕ весь редактор,
    без version-range overrides/legacy.
11. **Мобильный collapsed-stepper как breakpoint-состояние:** на узком экране stepper
    сворачивается до «Step N of M» + progress/меню-переход; sticky footer без
    перекрытия. Сейчас есть только prop-переключатель side-rail/horizontal — нужен
    реальный mobile-макет/медиа-состояние.
12. **Guard на уход со страницы:** Cancel и уход с роута → диалог подтверждения потери
    прогресса (сейчас `onCancel` пустой). Показать состояние подтверждения.

### Component profile — 4 профиля (расширено; см. §4 «Старт»)
15. **Choose component profile — первый вопрос wizard'а**, 4 профиля, каждый задаёт
    `solution`/`external`/`explicit` + правила ключа:
    - **Solution** — key содержит `-solution`; external=true, explicit=true, solution=true.
    - **DMP Bundle** — key содержит `dmp-bundle`; external=true, explicit=true,
      solution=true.
    - **Regular external component** — external=true; **доп. вопрос «Has explicit
      distribution?»** → explicit yes/no; solution=false.
    - **Regular internal component** — external=false; тот же вопрос → explicit yes/no;
      solution=false.
    Regular key → `^[a-z][a-z0-9-]*$` (не содержит solution-паттернов); Solution/DMP
    Bundle → base + соответствующий суффикс. **Сырых тумблеров External/Explicit в
    create НЕТ** — выводятся из профиля (read-only recap опц.). В Clone профиль выводится
    из источника, editable (смена → reset ключа + пересчёт флагов). Правила ключа строже
    для НОВЫХ; существующие — старый `NAME_REGEX`. В **Edit** external/explicit остаются
    editable тумблерами (профиля нет).

### Тексты
13. **ALL_EXCEPT_CLAIMED** — канонический visible label **«All except artifacts
    assigned elsewhere»** ВЕЗДЕ, включая Summary (сейчас в summary осталось stale
    «All except those matched by other components»). Обязателен help-текст «Owns any
    artifact in the group not explicitly assigned to another component… Supports a
    single Group ID».
14. **Tooltips** для **component / External / Explicit** (санитизированные, §10 брифа)
    — без org/вендор/продуктовых токенов и wiki-ссылок.

## Хорошо покрыто (сохранить как есть)
Единый термин **Clone**; clone info-блок Included/Re-enter; 6 шагов с условным VCS;
gated Distribution; mirror-пары version format; Summary-first финальный шаг; disabled
«As code» как future-state; cross-step invalid-баннер + кликабельный список проблем.

---

## Iteration 3 / carry-over (по ревью макета 19:03)

Макет итерации 2 закрыл #1–15 (профиль, шаги=табы, hotfix убран, VCS Path/Production
branch, conflict-check checking/ok/conflict + «Already produced by {owner}», ALL_EXCEPT
wording, Jira key required, editor mapping-card, unsaved-guard диалог, copyright
config-driven). Осталось два пункта:

C1. **Дефолт флагов Classification:** в seed'е сейчас `distributionExternal: false` —
    должно быть **External = вкл** (Explicit = выкл) по умолчанию (scratch). Совпадает с
    кодом `CreateComponentDialog` defaults и брифом (§4 Classification). Поправить дефолт.
C2. ~~Мобильный adaptive-stepper (#11)~~ — **СНЯТО:** мобильное представление пока не
    актуально. Отдельный collapsed-stepper не требуется; вернёмся при необходимости.

C3. **(терминология)** лейбл режима — **«artifactId matching mode»** (не «Matching
    mode»); опции те же. Обновить и в create, и в editor mapping-card.

C4. **Produced Artifacts — matching mode per-groupId:** каждая запись = один Group ID +
    свой **artifactId matching mode** (+ Specific artifacts при EXPLICIT). **Дефолт mode
    = `ALL` («All under the group ID»); пустого «— select matching mode —» НЕТ.** Кнопка
    **«Add one more groupId» доступна, когда у текущей записи заполнен Group ID** (mode
    уже задан дефолтом). Payload: `artifactIds` — массив, каждая запись → своя
    `ArtifactIdRequest` (не comma-join групп под один mode). Single-group для ALL_EXCEPT —
    естественно.

C8. **Profile — отдельный первый шаг-гейт (scratch).** В scratch wizard сначала
    показывает **только** выбор профиля (+ «Has explicit distribution?» для regular);
    остальные поля/шаги скрыты до **«Дальше»**. Stepper scratch: *Profile → General →
    Build → VCS → Jira → Distribution → Review*. В **Clone** шаг Profile **пропускается**
    (профиль выведен из источника, форма сразу; профиль editable). Сейчас в макете
    профиль — контрол наверху, без отдельного гейт-шага.

C7. **Produced Artifacts → в шаг Build (обе формы) + плюрал.** Перенести секцию из
    General в **Build** (в create-шаге и в editor — с General-таба на Build-таб). Лейбл
    секции — множественное **«Produced Artifacts»** (в макете сейчас «PRODUCED ARTIFACT»
    — единственное, исправить). Дефолт artifactId matching mode = **ALL** (без пустого
    «— select matching mode —»); «Add one more groupId» доступна при заполненном Group ID.

C6. **VCS — постоянный шаг (не прятать по умолчанию):** VCS нужен в ~99% случаев и в
    редакторе это постоянный таб. Сейчас макет скрывает VCS-шаг, пока build system не
    выбран (`showVcs = buildSystem!=='' && !vcsHidden`). Сделать VCS **постоянным шагом**
    stepper'а; условно только **содержимое**: поля VCS (VCS Path required) при
    `vcsBlockApplies`, а для no-VCS систем (WHISKEY/PROVIDED/ESCROW_*/BS2_0) — нота «No
    VCS root required for {buildSystem}». Шаг не исчезает.

C5. **Distribution — Docker отдельно и не gated:** Docker (Image Name [+Flavor]) —
    **самостоятельная секция, доступна всегда**, независимо от Explicit (в create-шаге —
    свой блок; в **editor** — отдельный left-nav пункт в группе Distribution, вынести из
    общего Distribution-таба). Coordinate (Maven/Package) остаётся gated на
    Explicit+External. Редактор уже не гейтит артефакты на explicit (только canEdit).
