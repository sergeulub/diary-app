# Люди: данные — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Слой данных модуля «Люди»: схема `diary` v4, чистая логика в `domain/`, доступ в `db/`, экспорт и импорт
`formatVersion: 5` с папкой `people/`, разбор и применение файла изменений с ПК — всё с тестами, без экранов.

**Architecture:** Шесть новых таблиц Dexie (версия 4). Правила — чистые функции в `src/domain/people.ts`,
`peopleList.ts`, `peopleExport.ts`, `peoplePatch.ts`; запись — только через `src/db/people.ts` и `src/db/diary.ts`.
Файл изменений разбирается в план (`planPatch`), решения пользователя (галочки и правки) передаются отдельно
(`applyPlan(plan, decisions, …)`), запись — одной транзакцией. Экраны — следующий план (Б0 шаг 3).

**Tech Stack:** TypeScript, Dexie 4, fflate, Vitest + `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-10-22-contacts-crm-design.md` (часть Б; поведение — часть А)

## Global Constraints

- Репозиторий публичный: в тестах и коде только вымышленные примеры (Иван Петров, Кедр Консалтинг, `example.com`).
- Логика — чистые функции в `src/domain/` без DOM; IndexedDB — только из `src/db/`.
- `db.version(4).stores({ people: 'id, updatedAt', personNotes: 'id, personId, day, eventId, updatedAt', events: 'id, day, updatedAt', spheres: 'key', circles: 'key', personLinks: 'id, a, b' })`; версии 1–3 не трогать.
- У каждой записи `createdAt`, `updatedAt`, `deletedAt` (мягкое удаление); метки — `isoWithOffset`, сравнение меток — по
  моменту (`Date.parse` / `isLater`), не строкой.
- `FORMAT_VERSION = 5`; импорт принимает 1–5, > 5 отклоняет. `entries_*.md` не меняется.
- `updatedAt` человека меняют только правки карточки, объединение сфер и `mergePeople`; записи ленты и связи — нет.
- Файл изменений трогает только таблицы модуля (`people`, `personNotes`, `spheres`, `circles`, `personLinks`) и
  `meta.appliedPatches`.
- Работа в ветке `feature/people`, коммит после каждой задачи, без push (публикация — после экранов, версия 1.5.0).
- `npm test` и `npm run build` (там `tsc --noEmit`) зелёные в конце каждой задачи.

## Review Focus

1. Текст с `|` или переводом строки в имени, компании, сферах ломает таблицу `people/index.md` → ячейки экранируются
   (`\|`, перевод строки → пробел) — тест в задаче 4.
2. `baseUpdatedAt` в файле с другим смещением (`…+03:00` против `…Z`), но тот же момент → не конфликт — тест в задаче 7.
3. Имя без букв, которые можно транслитерировать («🙂», «—») → файл `person-<8 символов id>.md` — тест в задаче 4.
4. Человек удалён в телефоне, а файл добавляет ему запись, связь или объединяет его → операция заблокирована, человек
   не «воскресает» — тест в задаче 7 и 8.
5. Тот же файл применён второй раз, теперь с правкой → нет дублей людей и записей, ложных конфликтов нет, в
   `meta.appliedPatches` одна строка с этим `id` — тесты в задачах 7, 8, 9.

---

### Task 1: Типы, схема v4, круги по умолчанию

**Files:**
- Modify: `src/domain/types.ts`, `src/db/database.ts`, `src/db/diary.ts` (`DEFAULT_META`, `initDb`, `exportSnapshot`)
- Create: `src/domain/people.ts` (пока только `DEFAULT_CIRCLES`, `CONTACT_LABELS`)
- Modify: `src/domain/testFixtures.ts`, `src/domain/exportFormat.test.ts`, `src/domain/importFormat.test.ts` (хелперы снимка)
- Test: `src/db/diary.test.ts`

**Interfaces:**
- Produces (в `types.ts`):
  - `ContactType = 'phone' | 'telegram' | 'email' | 'linkedin' | 'other'`; `Contact { type: ContactType; value: string }`
  - `Person { id; name; aliases: string[]; company; position; about; sphereKeys: string[]; circleKey; canHelp; iCanHelp; personal; contacts: Contact[]; archived: boolean; createdAt; updatedAt; deletedAt: string | null }` (строки — `string`, `circleKey` `''` — нет круга)
  - `PersonNoteKind = 'meeting' | 'diary'`; `PersonNote { id; personId; kind; day; occasion; eventId; talk; life; agreements; original; patchId; createdAt; updatedAt; deletedAt }` (`eventId`, `patchId` — `''`, если нет)
  - `PeopleEvent { id; day; title; topic; createdAt; updatedAt; deletedAt }` (не `Event` — имя занято DOM)
  - `Sphere { key; name; createdAt; updatedAt; deletedAt }`; `Circle { key; name; order; archived; createdAt; updatedAt; deletedAt }`
  - `PersonLink { id; a; b; createdAt; updatedAt; deletedAt }` (`a < b` строкой)
  - `AppliedPatch { id: string; appliedAt: string; basedOnExportAt: string }`
  - `PeopleData { people: Person[]; personNotes: PersonNote[]; events: PeopleEvent[]; spheres: Sphere[]; circles: Circle[]; personLinks: PersonLink[] }`
  - `Meta` + `appliedPatches?: AppliedPatch[]` (нет — ни один файл не применён); `DiarySnapshot extends PeopleData`
- Produces (в `people.ts`): `DEFAULT_CIRCLES: Circle[]` — `speaker` «Спикер / гость», `friends` «Однокурсник / друг», `hr` «Рекрутер / HR», `mentor` «Наставник / консультант», `order` 1–4, метки `SEED_TIME`, `archived: false`, `deletedAt: null`; `CONTACT_LABELS: Record<ContactType, string>` = Телефон, Telegram, Почта, LinkedIn, Другое.
- Produces (в `testFixtures.ts`): `EMPTY_PEOPLE: PeopleData` (все массивы пустые) — хелперы снимка в тестах экспорта и импорта делают `...EMPTY_PEOPLE`.

- [ ] **Step 1: Ветка.** `git switch -c feature/people` (правки пользователя в `CLAUDE.md` и `ОПИСАНИЕ.md` не трогать и не коммитить).

- [ ] **Step 2: Failing tests в `src/db/diary.test.ts`**

```ts
it('засевает четыре метрики, круги и meta по умолчанию', async () => {
  expect((await getMetrics()).map((d) => d.key)).toEqual(['mood', 'boredom', 'sleepStart', 'sleepEnd'])
  expect(await getMeta()).toEqual({ boundaryHour: 6, lastExportAt: null, schemaVersion: 4, appliedPatches: [] })
  expect((await exportSnapshot()).circles.map((c) => c.key)).toEqual(['speaker', 'friends', 'hr', 'mentor'])
})
describe('миграция v3 → v4', () => {
  it('данные остаются, schemaVersion 4, круги засеяны, люди пустые', async () => {
    db.close(); await Dexie.delete('diary')
    const old = new Dexie('diary') // версии 1–3 — копия src/db/database.ts
    old.version(1).stores({ days: 'day, updatedAt', metricDefinitions: 'key', entries: 'id, day, updatedAt', meta: 'key' })
    old.version(2).stores({ financeCategories: 'key', transactions: 'id, day, updatedAt', goals: 'id, month, updatedAt' })
    old.version(3).stores({ photos: 'id, entryId, day, updatedAt' })
    await old.open(); await old.table('days').put(dayRec('2026-10-05', { text: 'Было' })); await old.table('meta').put({ key: 'schemaVersion', value: 3 }); old.close()
    await db.open(); await initDb()
    expect((await getDay('2026-10-05'))?.text).toBe('Было')
    expect((await getMeta()).schemaVersion).toBe(4)
    const s = await exportSnapshot()
    expect(s.circles).toHaveLength(4); expect(s.people).toEqual([])
  })
})
```

- [ ] **Step 3: Run** `npx vitest run src/db/diary.test.ts` — FAIL (`schemaVersion: 3`, нет `circles`).

- [ ] **Step 4: Implement.** Типы и `DEFAULT_CIRCLES`/`CONTACT_LABELS` как в Interfaces. `db.version(4)` со stores из
  Global Constraints, `.upgrade` ставит `schemaVersion: 4`. `DEFAULT_META = { boundaryHour: 6, lastExportAt: null, schemaVersion: 4, appliedPatches: [] }`.
  `initDb` засевает `circles`, если таблица пуста (как категории) — это покрывает и новую базу, и обновлённую
  (в ТЗ засев указан в `upgrade`; результат тот же). `exportSnapshot` читает шесть новых таблиц. Хелперы снимка в
  `exportFormat.test.ts` и `importFormat.test.ts` (`snap`, `snapshot`, `EMPTY`) дополнить `...EMPTY_PEOPLE`.
  `buildBackup` пока передаёт новые массивы как есть (формат поднимется в задаче 5).

- [ ] **Step 5: Run** `npm test && npm run build` — PASS.

- [ ] **Step 6: Commit** `git add src && git commit -m "feat(people): schema v4, types, default circles"`

---

### Task 2: Домен людей — записи и правила

**Files:**
- Modify: `src/domain/people.ts`
- Test: `src/domain/people.test.ts`

**Interfaces:**
- Consumes: типы задачи 1.
- Produces (все `now` — ISO-строка):
  - `isLive(x: { deletedAt: string | null }): boolean`; `foldText(s: string): string` — нижний регистр, «ё»→«е»
  - `PersonFields = Omit<Person, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>`
  - `createPerson(fields: Partial<PersonFields> & { name: string }, now: string): Person` — UUID, пустые строки и списки по умолчанию, имя обрезано; пустое имя → `throw new Error('Нужно имя')`
  - `updatePerson(p: Person, patch: Partial<PersonFields>, now: string): Person`; `deletePerson(p, now)` (`deletedAt = updatedAt = now`)
  - `NoteFields = Pick<PersonNote, 'day' | 'occasion' | 'eventId' | 'talk' | 'life' | 'agreements' | 'original'>`
  - `createNote(personId: string, kind: PersonNoteKind, fields: Partial<NoteFields> & { day: string }, now: string): PersonNote` (`patchId: ''`); `updateNote(n, patch: Partial<NoteFields>, now)`; `deleteNote(n, now)`
  - `meetingAtEvent(personId: string, ev: PeopleEvent, now: string): PersonNote` — `day = ev.day`, `eventId = ev.id`, `occasion = ev.title`
  - `createEvent(fields: { day: string; title: string; topic?: string }, now: string): PeopleEvent` (пустое название → `throw new Error('Нужно название')`); `updateEvent`; `deleteEvent`
  - `isIncomplete(p: Person): boolean` — пусты (после `trim`) все поля, кроме `name` и `aliases`: `company`, `position`, `about`, `sphereKeys`, `circleKey`, `canHelp`, `iCanHelp`, `personal`, `contacts`
  - `isUnparsed(n: PersonNote): boolean` — `kind === 'meeting'`, `original.trim()` непуст, `talk`, `life`, `agreements` пусты после `trim`
  - `personFeed(personId: string, notes: PersonNote[]): PersonNote[]` — живые записи человека: `day` по убыванию, при равенстве — `createdAt` по убыванию
  - `lastContactDay(personId: string, notes: PersonNote[]): string | null`
  - `metInfo(personId: string, notes: PersonNote[], events: PeopleEvent[]): { day: string; occasion: string } | null` — самая ранняя живая `meeting` (по `day`, затем `createdAt`); `occasion` записи, а если пуст — название живого события по `eventId`
  - `normalizeName(s: string): string` — `foldText`, слова по пробелам без пустых, отсортированы, через один пробел
  - `findSimilar(name: string, company: string, people: Person[]): Person[]` — живые (архивные тоже): `normalizeName` равны **или** первое слово имени (`foldText`) равно и `company` после `trim` непуста и равна по `foldText`
  - `peopleOfEvent(eventId: string, notes: PersonNote[]): string[]` — уникальные `personId` живых записей события, по порядку первой записи
  - `findByName<T extends { name: string; deletedAt: string | null }>(name: string, items: T[]): T | undefined` — живой элемент с тем же `foldText(trim)` именем
  - `createSphere(name: string, now: string): Sphere` (ключ — UUID); `mergeSphere(fromKey: string, intoKey: string, people: Person[], now: string): Person[]` — только изменённые люди, ключ заменён без повторов, `updatedAt = now`
  - `linkPair(x: string, y: string): [string, string] | null` — упорядоченная пара, `null` при `x === y`
  - `linkedIds(personId: string, links: PersonLink[]): string[]` — живые связи
  - `setLinks(personId: string, wanted: string[], links: PersonLink[], now: string): PersonLink[]` — изменённые и новые записи: лишние живые связи мягко удалены, недостающие созданы (UUID), удалённая связь той же пары оживает
  - `lastApplied(applied: AppliedPatch[]): AppliedPatch | null` — с самым поздним `basedOnExportAt`
  - `isSeenByClaude(n: PersonNote, applied: AppliedPatch[]): boolean` — `patchId` непуст **или** есть применённый файл и `createdAt ≤ lastApplied.basedOnExportAt`
  - `claudeDividerIndex(feed: PersonNote[], applied: AppliedPatch[]): number` — индекс первой увиденной записи, если до неё есть хотя бы одна новая; иначе `-1`

- [ ] **Step 1: Failing tests в `src/domain/people.test.ts`** — по `describe` на функцию; ключевые утверждения:
  - `createPerson({ name: '  Иван Петров ' }, NOW)` → `name` `'Иван Петров'`, `aliases` `[]`, `circleKey` `''`, `deletedAt` `null`; `createPerson({ name: ' ' }, NOW)` бросает `'Нужно имя'`.
  - `isIncomplete`: только имя и `aliases: ['Ваня']` → `true`; плюс `contacts: [{ type: 'telegram', value: '@ivan' }]` → `false`; `company: '  '` → всё ещё `true`.
  - `isUnparsed`: встреча с `original: 'Заметка'` → `true`; плюс `talk: 'x'` → `false`; `kind: 'diary'` → `false`; `original: ' '` → `false`.
  - `personFeed`: записи 18.10 и 25.10 и удалённая 30.10 → `['25.10', '18.10']`; две записи одного дня — позже созданная первой.
  - `lastContactDay` без записей → `null`; удалённая самая поздняя не считается.
  - `metInfo`: две встречи и одна `diary` раньше них → самая ранняя встреча; `occasion: ''` и `eventId` живого события → его `title`.
  - `normalizeName('  Петров   Иван ')` === `normalizeName('иван петров')`; `normalizeName('Алёна')` === `'алена'`.
  - `findSimilar('петров иван', '', people)` находит «Иван Петров»; `findSimilar('Иван Сидоров', 'Кедр консалтинг', [{ name: 'Иван Петров', company: 'Кедр Консалтинг' }])` находит; с пустой компанией — нет; удалённый — нет; архивный — да.
  - `mergeSphere('konsalt', 'konsalting', [у человека обе], NOW)` → `sphereKeys` `['konsalting']` (одна, Б6); человек без `konsalt` не возвращается.
  - `linkPair('b', 'a')` → `['a', 'b']`; `linkPair('a', 'a')` → `null`.
  - `setLinks('a', ['c'], [связь a–b живая], NOW)` → связь a–b удалена, a–c создана (`a < b` в записи); повтор с теми же `wanted` → `[]`.
  - `claudeDividerIndex`: нет применённых → `-1`; лента [новая (createdAt после basedOn), старая (до)] → `1`; запись с `patchId` и поздним `createdAt` считается увиденной; все увидены → `-1`; `basedOnExportAt` `'2026-10-21T20:00:00.000Z'` против `createdAt` `'2026-10-21T23:00:00.000+03:00'` (тот же момент) → увидена.

- [ ] **Step 2: Run** `npx vitest run src/domain/people.test.ts` — FAIL (нет экспорта).

- [ ] **Step 3: Implement** функции из Interfaces в `src/domain/people.ts`.

- [ ] **Step 4: Run** `npx vitest run src/domain/people.test.ts && npm run build` — PASS.

- [ ] **Step 5: Commit** `git add src/domain/people.ts src/domain/people.test.ts && git commit -m "feat(people): domain records and rules"`

---

### Task 3: Поиск, фильтры и сортировка списка (А7)

**Files:**
- Create: `src/domain/peopleList.ts`
- Test: `src/domain/peopleList.test.ts`

**Interfaces:**
- Consumes: `foldText`, `isLive`, `isIncomplete`, `isUnparsed`, `lastContactDay` из задачи 2.
- Produces:
  - `PeopleFilter { sphereKeys: string[]; circleKey: string; incomplete: boolean; unparsed: boolean; archived: boolean; sort: 'lastContact' | 'added' }`
  - `DEFAULT_FILTER: PeopleFilter` = `{ sphereKeys: [], circleKey: '', incomplete: false, unparsed: false, archived: false, sort: 'lastContact' }`
  - `matchesQuery(p: Person, query: string): boolean` — по `name`, `aliases`, `company` через `foldText`, подстрока; пустой запрос → `true`
  - `filterPeople(data: Pick<PeopleData, 'people' | 'personNotes'>, query: string, f: PeopleFilter): Person[]` — живые; `archived: false` → только неархивные, `true` → только архивные; сферы — «или» внутри, остальное — «и»; `incomplete` / `unparsed` (есть живая неразобранная запись) — только такие. Сортировка `lastContact`: по `lastContactDay` по убыванию, люди без записей — в конце, при равенстве — по имени (`localeCompare(…, 'ru')`); `added`: `createdAt` по убыванию
  - `activeFilterCount(f: PeopleFilter): number` — `sphereKeys.length` + по 1 за `circleKey`, `incomplete`, `unparsed`, `archived` (сортировка не считается)

- [ ] **Step 1: Failing tests** — ключевые утверждения:
  - запрос `'ваня'` находит по `aliases`; `'кедр'` — по компании; `'алена'` находит «Алёна».
  - сферы `['a', 'b']` и круг `speaker`: человек со сферой `b` и кругом `speaker` — в списке; со сферой `b` и кругом `hr` — нет.
  - архивный человек скрыт при `DEFAULT_FILTER`, виден только он при `archived: true`; удалённый не виден никогда.
  - сортировка `lastContact`: [без записей, 18.10, 25.10] → [25.10, 18.10, без записей].
  - `activeFilterCount({ ...DEFAULT_FILTER, sphereKeys: ['a', 'b'], circleKey: 'hr', sort: 'added' })` → `3`.

- [ ] **Step 2: Run** `npx vitest run src/domain/peopleList.test.ts` — FAIL.
- [ ] **Step 3: Implement** по Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/domain/peopleList.test.ts && npm run build` — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(people): list search, filters and sorting"` (с двумя файлами)

---

### Task 4: Выгрузка `people/` (Б3)

**Files:**
- Create: `src/domain/peopleExport.ts`
- Test: `src/domain/peopleExport.test.ts`

**Interfaces:**
- Consumes: задачи 1–2 (`isIncomplete`, `isUnparsed`, `lastContactDay`, `metInfo`, `peopleOfEvent`, `linkedIds`, `personFeed`, `CONTACT_LABELS`, `isLive`).
- Produces:
  - `translit(s: string): string` — строчные; кириллица по таблице `а a, б b, в v, г g, д d, е e, ё e, ж zh, з z, и i, й y, к k, л l, м m, н n, о o, п p, р r, с s, т t, у u, ф f, х kh, ц ts, ч ch, ш sh, щ shch, ъ —, ы y, ь —, э e, ю yu, я ya`; латиница и цифры как есть; всё прочее → `-`; повторы `-` схлопнуть, `-` по краям убрать; не длиннее 40 символов (и снова убрать `-` в конце); пусто → `'person'`
  - `personFileName(p: Person): string` — `` `${translit(p.name)}-${p.id.slice(0, 8)}.md` ``
  - `renderPeopleIndex(data: PeopleData, now: Date): string`
  - `renderPersonFile(p: Person, data: PeopleData): string`
  - `buildPeopleFiles(data: PeopleData, now: Date): Record<string, string>` — ключи `people/index.md` и `people/<personFileName>` для каждого живого человека

Формат — ровно как в ТЗ Б3. Решения, которых там нет:
- Заголовок: `# Люди — выгрузка ГГГГ-ММ-ДД ЧЧ:ММ` (местное время `now`).
- «Всего» — живые люди вместе с архивными; «не дополнено» — живые с `isIncomplete`; «неразобранных заметок» — живые
  неразобранные записи живых людей; «в архиве» — живые архивные.
- Таблица людей — по имени (`localeCompare(…, 'ru')`). Ячейка «Имя»: `Имя (псевдоним1, псевдоним2)`; «Компания,
  должность» — непустые через `, `; «Сферы» — имена живых сфер через `, `; «Круг» — имя круга или пусто;
  «Последняя запись» — `lastContactDay` или пусто; «Пометки» — «не дополнено», «не разобрано», «архив» через `, `.
  В каждой ячейке `|` → `\|`, переводы строк → пробел.
- Раздел `## События` — только если есть живые события; по дате по убыванию; «Люди» — имена живых людей из
  `peopleOfEvent` по алфавиту через `, `.
- Файл человека: строки-поля в порядке примера ТЗ; значение однострочное (переводы строк → пробел); пустые
  пропускаются; `id:` — полный id; «добавлен» — `createdAt.slice(0, 10)`; «пометки:» — только если есть.
  «Контакты» — `Telegram @ivan · Почта ivan@example.com` (`CONTACT_LABELS`). «Знаком с» — ссылки на живых людей по
  алфавиту. `## Лента` — если есть живые записи, порядок `personFeed`; заголовок встречи
  `### <day> · встреча · <occasion или название события>` (без хвоста, если пусто), `### <day> · из дневника`;
  строка `id:`; поля встречи `**О чём говорили:**`, `**Что актуально у него:**`, `**Договорились:**`,
  `**Исходная заметка:**` с текстом как есть; у `diary` — строка `talk`. Блоки разделены пустой строкой, файл
  заканчивается `\n`.

- [ ] **Step 1: Failing tests** — ключевые утверждения:
  - `translit('Иван Петров')` → `'ivan-petrov'`; `translit('Щука Ёжикова')` → `'shchuka-ezhikova'`; `translit('Anna Ли')` → `'anna-li'`; `translit('🙂')` → `'person'`; результат для имени из 60 букв — ≤ 40 символов, без `-` на конце.
  - тёзки «Иван Петров» с id `1a2b3c4d-…` и `9f8e7d6c-…` → разные имена файлов (Б6).
  - `buildPeopleFiles`: удалённый человек — нет файла и строки в index; архивный — есть, в «Пометках» «архив».
  - точный текст `renderPersonFile` для человека из примера ТЗ (Кедр Консалтинг, одна встреча с событием, одна `diary`, связь с «Анна Смирнова») — сравнение `toBe` со строкой, собранной в тесте.
  - точный текст `renderPeopleIndex` (2 человека, 1 событие, `now = new Date(2026, 9, 25, 23, 10)`), первая строка `'# Люди — выгрузка 2026-10-25 23:10'`.
  - компания `'Кедр | Ко\nнсалтинг'` → в ячейке `'Кедр \| Ко нсалтинг'` (Review Focus 1).

- [ ] **Step 2: Run** `npx vitest run src/domain/peopleExport.test.ts` — FAIL.
- [ ] **Step 3: Implement** по Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/domain/peopleExport.test.ts && npm run build` — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(people): people/ markdown export"`

---

### Task 5: Экспорт и полный импорт `formatVersion: 5` (Б2)

**Files:**
- Modify: `src/domain/exportFormat.ts`, `src/domain/importFormat.ts`, `src/db/diary.ts` (`applyImport`)
- Test: `src/domain/exportFormat.test.ts`, `src/domain/importFormat.test.ts`, `src/db/diary.test.ts`

**Interfaces:**
- Consumes: `buildPeopleFiles` (задача 4), `PeopleData` (задача 1).
- Produces: `FORMAT_VERSION = 5`; `Backup` содержит шесть массивов `PeopleData`; zip содержит `people/…`;
  `ImportPlan` + `people`, `personNotes`, `events`, `spheres`, `circles`, `personLinks` (`MergePart<…>`, ключи — `id`,
  у сфер и кругов — `key`); `planImport(current: Pick<DiarySnapshot, …все таблицы…>, incoming)`; `applyImport` пишет
  новые таблицы в той же транзакции.

- [ ] **Step 1: Failing tests**
  - `exportFormat.test.ts`: `FORMAT_VERSION` `5`; zip из `buildExportZip` с одним человеком содержит `people/index.md` и `people/ivan-petrov-<8>.md`; пустая база — есть `people/index.md` с `Всего: 0 …`; `backup.json` содержит `people`.
  - `importFormat.test.ts`: бэкап формата 4 без новых массивов → все шесть пустые (Б6); туда-обратно `buildBackup` → `parseImport` сохраняет человека, запись, событие, сферу, круг, связь; человек без `name` → `ImportError('Человек №1: не хватает полей или они неверного типа')`; `formatVersion: 6` отклоняется; `describeImport` с одним новым человеком, двумя записями и событием содержит `'Людей: будет добавлено 1, обновлено 0.'`, `'Записей о людях: будет добавлено 2, обновлено 0.'`, `'Событий: будет добавлено 1, обновлено 0.'`; файл со свежим `updatedAt` у человека → `updated: 1`.
  - `diary.test.ts`: импорт снимка с человеком → `exportSnapshot().people` содержит его; круги по умолчанию остаются после импорта бэкапа формата 4.

- [ ] **Step 2: Run** `npx vitest run src/domain/exportFormat.test.ts src/domain/importFormat.test.ts src/db/diary.test.ts` — FAIL.

- [ ] **Step 3: Implement.** Парсеры `parsePerson`, `parseNote`, `parseEvent`, `parseSphere`, `parseCircle`, `parseLink`
  в стиле существующих (`isObj`, `isStr`, `isStamp`, `isDeletedAt`, `DAY_RE`); тексты ошибок `Человек №N`, `Запись о
  человеке №N`, `Событие №N`, `Сфера №N`, `Круг №N`, `Связь №N` + `BAD_FIELDS`. Отсутствующие строковые поля
  записи о человеке (`occasion`, `eventId`, `talk`, `life`, `agreements`, `original`, `patchId`) → `''`; `kind` только
  `meeting`/`diary`; `contacts[].type` — из `ContactType`. `describeImport` называет только «Людей», «Записей о людях»,
  «Событий» (в этом порядке после существующих, и только непустые). `meta` при импорте по-прежнему не переносится.

- [ ] **Step 4: Run** `npm test && npm run build` — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(people): backup format 5 with people tables and people/ folder"`

---

### Task 6: Файл изменений — разбор (Б4)

**Files:**
- Create: `src/domain/peoplePatch.ts`
- Test: `src/domain/peoplePatch.test.ts`

**Interfaces:**
- Produces:
  - `class PatchError extends Error {}`
  - `PersonInput = Partial<Omit<PersonFields, 'sphereKeys' | 'circleKey'>> & { spheres?: string[]; circle?: string }` — сферы и круг по названию
  - `NoteInput = Partial<Pick<PersonNote, 'day' | 'occasion' | 'talk' | 'life' | 'agreements' | 'original'>>`
  - `PatchOp` — объединение девяти вариантов из ТЗ Б4: `createPerson { tempId; person: PersonInput & { name: string } }`, `updatePerson { id; baseUpdatedAt; set: PersonInput }`, `updateNote { id; baseUpdatedAt; set: NoteInput }`, `addNote { personId; note: NoteInput & { kind: PersonNoteKind; day: string } }`, `upsertDiaryNote { personId; day; talk }`, `mergePeople { fromId; intoId; baseUpdatedAt: { from; into } }`, `linkPeople { a; b }`, `renameSphere { name; newName }`, `mergeSpheres { from; into }` (у каждого поле `op`)
  - `PeoplePatch { kind: 'people-patch'; patchVersion: number; id: string; createdAt: string; basedOnExportAt: string; summary: string; ops: PatchOp[] }`
  - `isPeoplePatchJson(json: string): boolean` — JSON-объект с `kind === 'people-patch'`; BOM в начале допустим; ошибки разбора → `false`
  - `parsePeoplePatch(json: string): PeoplePatch`
  - `derivedId(seed: string): string` — детерминированный id формата UUID: четыре 32-битных FNV-1a от `` `${seed}#${k}` `` (k = 0…3) → 32 hex-символа → дефисы 8-4-4-4-12

Правила разбора: `tempId` и ссылки на нового человека начинаются с `new-`; ссылками на человека считаются
`addNote.personId`, `upsertDiaryNote.personId`, `linkPeople.a`, `linkPeople.b`. Тексты ошибок:
- не JSON → `'Это не файл изменений: не JSON'`; нет `kind` или он не `people-patch` → `'Это не файл изменений: нет kind'`
- `patchVersion > 1` → `` `Файл сделан более новой версией (patchVersion ${n}). Обновите дневник и откройте файл снова.` ``
- нет `id`, `createdAt`, `basedOnExportAt` (метки) или `ops` не массив → `'Файл изменений повреждён: не хватает полей'`
- неизвестная `op` → `` `Изменение №${i + 1}: неизвестная операция «${op}»` ``
- поля операции неверного типа → `` `Изменение №${i + 1}: не хватает полей или они неверного типа` ``
- ссылка `new-…` без `createPerson` с таким `tempId` (в любом месте файла), повторный `tempId` или `tempId` не на `new-`
  → `` `Изменение №${i + 1}: нет нового человека «${ref}»` ``

- [ ] **Step 1: Failing tests** — ключевые утверждения:
  - пример из ТЗ Б4 (все девять операций, `new-1`) разбирается; `ops[0].op === 'createPerson'`.
  - каждая ошибка из списка выше — на своём входе, `toThrow(new PatchError('…'))` с точным текстом.
  - `isPeoplePatchJson('﻿{"kind":"people-patch"}')` → `true`; обычный `backup.json` → `false`; `'не json'` → `false`.
  - `derivedId('p:1')` совпадает при повторном вызове, отличается от `derivedId('p:2')`, подходит под `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`; у `derivedId('p:1')` и `derivedId('p:2')` разные первые 8 символов (имена файлов тёзок, созданных одним патчем).

- [ ] **Step 2: Run** `npx vitest run src/domain/peoplePatch.test.ts` — FAIL.
- [ ] **Step 3: Implement** по Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/domain/peoplePatch.test.ts && npm run build` — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(people): parse people-patch files"`

---

### Task 7: Файл изменений — план и выбор

**Files:**
- Modify: `src/domain/peoplePatch.ts`
- Test: `src/domain/peoplePatch.test.ts`

**Interfaces:**
- Consumes: задача 6; `findByName`, `isLive`, `CONTACT_LABELS` (задачи 1–2).
- Produces:
  - `OpStatus = 'ok' | 'conflict' | 'blocked'`
  - `PlannedOp { index: number; op: PatchOp; status: OpStatus; reason: string; personId: string; before: Record<string, string>; after: Record<string, string>; editable: boolean; dependsOn: string }` — `personId` — id или `tempId` для группировки по людям (`''` у операций со сферами); `before`/`after` — строки для «было → станет» по именам полей (`name`, `company`, …, `spheres`, `circle`, `talk`, …; списки — через `, `, контакты — `Telegram @ivan · Почта …`); `dependsOn` — `tempId` нового человека, от которого зависит операция, иначе `''`
  - `PatchPlan { patch: PeoplePatch; ops: PlannedOp[]; alreadyApplied: boolean }`
  - `Decision { selected: boolean; set?: Record<string, unknown> }`; `Decisions = Record<number, Decision>` (ключ — `index`)
  - `planPatch(patch: PeoplePatch, data: PeopleData, applied: AppliedPatch[]): PatchPlan`
  - `defaultDecisions(plan: PatchPlan): Decisions` — `selected` у `ok`
  - `effectiveSelection(plan: PatchPlan, decisions: Decisions): boolean[]` — `blocked` всегда `false`; операция с `dependsOn`, чей `createPerson` не выбран, — `false`

Статусы (сравнение меток — по моменту):
- `blocked`: человек или запись не найдены или удалены (`'Удалён в телефоне — применить нельзя'`); у
  `upsertDiaryNote`/`addNote`/`linkPeople` удалён человек; `linkPeople` с одним человеком
  (`'Нельзя связать человека с самим собой'`); `renameSphere`/`mergeSpheres` без исходной сферы
  (`` `Сферы «${name}» нет` ``) или без целевой; `renameSphere` в имя другой живой сферы
  (`` `Сфера «${newName}» уже есть — объедините их` ``).
- `conflict`: `updatePerson` и `mergePeople` — `updatedAt` ≠ `baseUpdatedAt` (`'Изменена в телефоне после выгрузки'`);
  `updateNote` — то же, если у записи `patchId` ≠ `patch.id`; `upsertDiaryNote` — живая `diary` того же человека и дня
  изменена позже `basedOnExportAt` и её `patchId` ≠ `patch.id`.
- Операция `updatePerson`/`updateNote`/`upsertDiaryNote`, у которой все предлагаемые значения уже совпадают с
  текущими, — `ok`, не конфликт (повторное применение не даёт ложных конфликтов).
- `editable` у `createPerson`, `updatePerson`, `updateNote`, `addNote`, `upsertDiaryNote`, `renameSphere`.
- `alreadyApplied` — `id` файла есть в `applied`.

- [ ] **Step 1: Failing tests** — ключевые утверждения:
  - `updatePerson` с `baseUpdatedAt` ≠ `updatedAt` → `conflict`, `defaultDecisions` его не выбирает (Б6); тот же момент с другим смещением → `ok` (Review Focus 2).
  - `before`/`after` у `updatePerson { set: { position: 'Управляющий партнёр' } }` → `{ position: 'Партнёр' }` / `{ position: 'Управляющий партнёр' }`.
  - удалённый человек: его `addNote`, `upsertDiaryNote`, `linkPeople`, `mergePeople` (как `from` или `into`) → `blocked` (Review Focus 4).
  - `createPerson new-1` с `selected: false` → `effectiveSelection` снимает `addNote` и `linkPeople`, ссылающиеся на `new-1`; снова выбран — возвращаются (Б6).
  - `blocked` с `selected: true` в `decisions` → `effectiveSelection` всё равно `false`.
  - повторный план после применения (данные уже содержат результат первого раза) → `alreadyApplied: true`, ни одной операции `conflict` (Review Focus 5).

- [ ] **Step 2: Run** `npx vitest run src/domain/peoplePatch.test.ts` — FAIL.
- [ ] **Step 3: Implement** по Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/domain/peoplePatch.test.ts && npm run build` — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(people): plan people-patch with conflicts and dependencies"`

---

### Task 8: Файл изменений — применение

**Files:**
- Modify: `src/domain/peoplePatch.ts`
- Test: `src/domain/peoplePatch.test.ts`

**Interfaces:**
- Consumes: задачи 2, 6, 7 (`mergeSphere`, `linkPair`, `findByName`, `derivedId`, `effectiveSelection`).
- Produces:
  - `PatchCounts { applied: number; edited: number; skipped: number }` — выбранные; выбранные с `set`; остальные
  - `PatchResult { changes: PeopleData; applied: AppliedPatch; counts: PatchCounts }` — `changes` содержит только
    созданные и изменённые записи (`events` всегда `[]`)
  - `applyPlan(plan: PatchPlan, decisions: Decisions, data: PeopleData, now: string): PatchResult`

Правила применения — ТЗ Б4; решения, которых там нет:
- Операции выполняются по порядку файла на рабочей копии `data`: следующая видит результат предыдущей.
- Значения операции = предложение файла, поверх него `decisions[index].set` (та же форма, что у предложения).
- Id: человек `createPerson` и запись `addNote` — `derivedId(`${patch.id}:${index}`)`; новая `diary` в
  `upsertDiaryNote` и связь `linkPeople` — так же (операция, чья запись уже есть и удалена в телефоне, заблокирована: повтор файла не воскрешает удалённое); сфера, созданная по имени, —
  `derivedId(`sphere:${foldText(name)}`)`; круг — `derivedId(`circle:${foldText(name)}`)`, `order` = максимум + 1.
  Если запись с таким id уже есть — она перезаписывается (`createdAt` прежний), а не дублируется.
- Записи ленты, созданные или изменённые файлом, получают `patchId = patch.id`.
- `mergePeople`: записи `from` → `into`; связи `from` переносятся на `into` с нормализацией пары; связь `into–into`
  и дубль уже существующей пары мягко удаляются; поля карточки — по правилу ТЗ; `into.updatedAt = now`,
  `from.deletedAt = from.updatedAt = now`.
- `mergeSpheres`: `mergeSphere(fromKey, intoKey, …)` + исходная сфера `deletedAt = now`.
- `applied = { id: patch.id, appliedAt: now, basedOnExportAt: patch.basedOnExportAt }`.

- [ ] **Step 1: Failing tests** — ключевые утверждения:
  - `createPerson new-1` + `addNote new-1` + `linkPeople(new-1, existing)` → человек с id `derivedId(`${id}:0`)`, запись с его `personId` и `patchId`, связь с `a < b`; сфера `'Консалтинг'` при живой `'консалтинг'` не создаётся.
  - правка: `decisions[1] = { selected: true, set: { position: 'Руководитель практики' } }` → в `changes.people` эта должность, `counts.edited === 1`.
  - принятый вручную `conflict` применяется; `blocked` с `selected: true` — нет.
  - `upsertDiaryNote` дважды на один день (в одном и в двух разных файлах) → одна запись `diary`, `talk` последнего (Б6).
  - `mergePeople` при связях from–into и from–x, into–x → у `into` одна связь с x, ни одной «сам с собой» (Б6); записи `from` у `into`; `from` удалён; псевдоним `from` в `aliases` у `into`; `circleKey` от `into`.
  - `addNote`/`linkPeople` не меняют `updatedAt` человека; `mergeSpheres` меняет.
  - применение того же плана дважды подряд к результату → те же id, количество людей и записей не растёт (Review Focus 5).

- [ ] **Step 2: Run** `npx vitest run src/domain/peoplePatch.test.ts` — FAIL.
- [ ] **Step 3: Implement** по Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/domain/peoplePatch.test.ts && npm run build` — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(people): apply people-patch with user decisions"`

---

### Task 9: Доступ к данным `src/db/people.ts`

**Files:**
- Create: `src/db/people.ts`
- Test: `src/db/people.test.ts`

**Interfaces:**
- Consumes: всё выше; `db` из `database.ts`, `getMeta`/`setMeta` из `diary.ts`, `isoWithOffset`.
- Produces:
  - `getPeopleData(): Promise<PeopleData>` — все строки шести таблиц, с удалёнными (отбирает домен)
  - `savePerson(p: Person)`, `saveNote(n: PersonNote)`, `saveEvent(e: PeopleEvent)`, `saveSpheres(s: Sphere[])`,
    `saveCircles(c: Circle[])`, `saveLinks(l: PersonLink[])` — `Promise<void>`
  - `addPersonWithNote(p: Person, n: PersonNote): Promise<void>` — одной транзакцией (быстрая форма)
  - `mergeSphereInto(fromKey: string, intoKey: string, now: Date): Promise<void>` — одной транзакцией: люди через
    `mergeSphere`, исходная сфера мягко удалена
  - `applyPeoplePatch(plan: PatchPlan, decisions: Decisions, now: Date): Promise<PatchCounts>` — одна транзакция на
    пять таблиц модуля и `meta`: свежие данные → `applyPlan` → `bulkPut` → `meta.appliedPatches` без строки с тем же
    `id` + новая строка

- [ ] **Step 1: Failing tests (`fake-indexeddb`, `freshDb` как в `diary.test.ts`)** — ключевые утверждения:
  - `addPersonWithNote` → `getPeopleData()` содержит обоих.
  - `mergeSphereInto` → у человека одна сфера, исходная с `deletedAt`.
  - `applyPeoplePatch` примера ТЗ → люди и записи в базе, `(await getMeta()).appliedPatches` = одна строка `{ id, appliedAt, basedOnExportAt }`; повторный вызов с правкой → строк по-прежнему одна, данных не больше, правка записана (Review Focus 5).
  - таблица `events` патчем не трогается: событие до и после применения одинаковое.

- [ ] **Step 2: Run** `npx vitest run src/db/people.test.ts` — FAIL.
- [ ] **Step 3: Implement** по Interfaces.
- [ ] **Step 4: Run** `npm test && npm run build` — PASS, вывод без ошибок.
- [ ] **Step 5: Commit** `git commit -m "feat(people): db access and transactional patch apply"`

---

## Итоги выполнения (23.10.2026)

Все 9 задач выполнены в ветке `feature/people` (коммиты `d4170b5`…`1d21e98`), 415 тестов, сборка без ошибок.
Финальный обзор — самопроверкой (без отдельного проверяющего); найденная проблема исправлена: повторное применение
файла изменений больше не «воскрешает» удалённых в телефоне людей, записи и связи.

**Решения по ходу (отступления от плана):**
- `PlannedOp.dependsOn` — список `string[]`: связь двух новых людей зависит от обоих.
- Операция обновления, чьи значения уже совпадают с телефоном, — `ok`, не конфликт (сферы и круг — без учёта
  регистра): повторное применение файла не даёт ложных конфликтов.
- Объединение сферы с самой собой и человека с самим собой — блокируется со своей причиной.
- Id связи из файла — `derivedId(`${patch.id}:${index}`)`, как у остальных создаваемых записей.
- Операция, чья запись уже создана этим файлом и удалена в телефоне, блокируется («Удалён в телефоне»).
- Импорт отклоняет человека с пустым именем и связь человека с самим собой.
- Фикстуры `samplePatch()` и `patchData()` — в `src/domain/testFixtures.ts`; тесты применения —
  `src/domain/peoplePatchApply.test.ts`.
- Засев кругов — в `initDb` (покрывает и новую, и обновлённую базу), `upgrade` v4 ставит только `schemaVersion`.

**Отложенные мелочи:**
- Повторно применённый файл показывает `mergePeople` как «Удалён в телефоне» (присоединённый человек) — подпись неточная.
- Имена с `[` или `]` ломают ссылки «Знаком с» в `people/*.md`.
- Хелперы `isObj`/`isStr`/`isStamp` продублированы в `importFormat.ts` и `peoplePatch.ts`.
- Импорт не проверяет `a < b` у связей.
- `applyPlan` при `addNote` не перепроверяет, жив ли существующий человек на момент применения (план мог устареть).
- Маршрут файла изменений из «Настроек» → «Импорт» в предпросмотр — в плане экранов (задача 2).
