# Люди: экраны — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Мини-приложение «Люди» по одобренным макетам 9–14: вход из «Настроек», список с фильтрами, быстрое
добавление, карточка с лентой-хроникой, формы, события, сферы и круги, изменения с ПК; версия 1.5.0.

**Architecture:** `App.tsx` получает режим «дневник / люди». Модуль — `src/ui/people/`: оболочка `PeopleApp` со своей
нижней панелью и стеком экранов в состоянии (без роутера, как остальное приложение). Данные читаются
`useLiveQuery(getPeopleData)` и пишутся функциями `src/db/people.ts`; подписи и группировки для экранов — чистые
функции в `src/domain/` с тестами. Общие элементы — `Sheet`, `Segmented`, `primeKeyboard` (`financeUi.tsx`), `Card`
(`MetricCards.tsx`), `IconButton` (`MetricsSettings.tsx`).

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4 (токены `bg`, `surface`, `ink`, `muted`, `line`, `accent`,
`accent-ink`, `danger`), Dexie + `dexie-react-hooks`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-contacts-crm-design.md` (А4–А8, Б4–Б5). Макеты — артборды 9–14 холста
https://claude.ai/artifact/54x6G4dAzDa72P6feRpBM1 (ревизия 23.10). Данные — план
`docs/superpowers/plans/2026-10-23-people-data.md` (готов, ветка `feature/people`).

## Global Constraints

- Ветка `feature/people`. **Push в `main` = деплой**: только в задаче 9 и только после «да» пользователя.
- Палитра «олива», стиль макетов 9–14: карточки 20 px + `shadow-card`, кнопки 14 px, заголовки `font-serif`; поля
  ввода ≥ 16 px; зоны нажатия ≥ 44 px; `safe-area-inset` сверху и снизу; светлая и тёмная тема — только токенами.
- **Без поясняющих надписей на экранах** (решение пользователя): подсказок про диктовку, «кто заполняет поля»,
  строк вроде «Познакомились …» нет. Тексты кнопок и заголовков — как в макетах.
- Нижняя панель модуля: **Люди · События · «+» · Дневник**; панель дневника в режиме «люди» скрыта; приложение
  всегда запускается в дневнике.
- Данные — только через `src/db/`; логика — `src/domain/` с тестами; метки — `isoWithOffset`; логический день —
  `useLogicalToday(meta.boundaryHour)`.
- Удаление (человека, записи, события) — мягкое и с `window.confirm`.
- Коммиты на английском, последняя строка — `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Пустая база** (0 людей, 0 событий, нет применённых файлов): список, события, сферы, «Изменения с ПК» и карточка
   «Люди» в «Настройках» показывают пустые состояния без `NaN`, пустых карточек и падений — тесты `peopleStats`,
   `eventsByMonth` (задача 1), проверка в браузере (задачи 3, 6, 7).
2. **Файл изменений, открытый через «Настройки» → «Импорт»**: попадает в предпросмотр модуля, а не в ошибку «нет
   formatVersion» — задача 2 (маршрут) и задача 8.
3. **Ночь 00:00–06:00**: дата новой встречи и быстрой формы — логический «сегодня» — везде `useLogicalToday`
   (задачи 4, 6).
4. **Человек удалён или в архиве**: не виден в списке (архив — только с переключателем), не предлагается в выборе
   «Знаком с» и «Добавить человека»; ссылка «Знаком с» на удалённого не рисуется — `filterPeople`/`isLive` (задачи 3, 5, 6).
5. **Двойной тап по «Сохранить»** в быстрой форме и формах записи: создаётся одна запись — флаг `busy`, как в
   `TransactionSheet` (задачи 4, 5).

---

### Task 1: Подписи и группировки для экранов

**Files:**
- Modify: `src/domain/ru.ts`, `src/domain/ru.test.ts`, `src/domain/people.ts`, `src/domain/people.test.ts`
- Create: `src/domain/peoplePreview.ts`, `src/domain/peoplePreview.test.ts`

**Interfaces:**
- Produces:
  - `shortDay(day: string): string` — `'2026-10-25'` → `'25 окт'` (`ru.ts`; сокращения `янв фев мар апр мая июн июл авг сен окт ноя дек`)
  - `initials(name: string): string` — первые буквы двух первых слов, заглавные: «Иван Петров» → «ИП», «Дмитрий» → «Д»
  - `peopleStats(data: PeopleData): { total: number; incomplete: number; unparsed: number }` — живые люди (вместе с архивными), «не дополнено», живые неразобранные записи живых людей
  - `countByKey(people: Person[], pick: (p: Person) => string[]): Map<string, number>` — живые люди
  - `eventsByMonth(events: PeopleEvent[], notes: PersonNote[]): { month: string; items: { event: PeopleEvent; count: number }[] }[]` — живые события, месяцы и события по убыванию даты, `count` — `peopleOfEvent(...).length`
  - `FIELD_LABELS: Record<string, string>` — `name` Имя, `aliases` Как ещё называю, `company` Компания, `position` Должность, `about` Чем занимается, `spheres` Сферы, `circle` Круг, `canHelp` Чем может быть полезен, `iCanHelp` Чем я могу быть полезен ему, `personal` Личное, `contacts` Контакты, `archived` В архиве, `day` Дата, `occasion` Повод, `talk` О чём говорили, `life` Что актуально у него, `agreements` Договорились, `original` Исходная заметка (`peoplePreview.ts`)
  - `opTitle(o: PlannedOp, data: PeopleData): string` — `createPerson` «Новый человек»; `updatePerson` «Карточка»; `updateNote` «Разобрать заметку · 25 окт», если запись была неразобранной, иначе «Запись · 25 окт»; `addNote` «Встреча · 20 окт» (+ « · кофе», если есть повод) или «Из дневника · 18 окт»; `upsertDiaryNote` «Из дневника · 18 окт»; `mergePeople` «Присоединить «Дмитрий»»; `linkPeople` «Знакомы»; `renameSphere` «Переименовать сферу»; `mergeSpheres` «Объединить сферы»
  - `previewGroups(plan: PatchPlan, data: PeopleData): { key: string; title: string; isNew: boolean; ops: PlannedOp[] }[]` — по `personId` в порядке первого появления; заголовок — имя человека (новый — из `createPerson`), у операций со сферами — «Сферы»; группы, где все операции `ok`, идут перед группами с конфликтами и блокировками

- [ ] **Step 1: Failing tests** — по одному `describe` на функцию; ключевые утверждения: `shortDay('2026-05-03')` → `'3 мая'`; `initials(' анна  смирнова ')` → `'АС'`; `peopleStats` пустых данных → `{ total: 0, incomplete: 0, unparsed: 0 }`; `eventsByMonth` с событиями 25.10, 15.10, 12.09 и удалённым → `['2026-10', '2026-09']`, в октябре `[25, 15]`; `opTitle` для каждой из девяти операций `samplePatch()` на `patchData()` — точные строки выше; `previewGroups` для `samplePatch()` → заголовки `['Олег Белов', 'Иван Петров', 'Дмитрий Соколов', 'Сферы']`, первая группа `isNew: true`; при конфликте у Ивана его группа уходит в конец.
- [ ] **Step 2: Run** `npx vitest run src/domain/ru.test.ts src/domain/people.test.ts src/domain/peoplePreview.test.ts` — FAIL.
- [ ] **Step 3: Implement** по Interfaces.
- [ ] **Step 4: Run** `npm test && npm run build` — PASS.
- [ ] **Step 5: Commit** `feat(people): labels and groupings for screens`

---

### Task 2: Оболочка модуля и вход

**Files:**
- Modify: `src/App.tsx`, `src/ui/SettingsScreen.tsx`, `src/ui/DataSettings.tsx`, `src/ui/CalendarScreen.tsx`
- Create: `src/ui/people/PeopleApp.tsx`, `src/ui/people/PeopleNav.tsx`, `src/ui/people/peopleUi.tsx`

**Interfaces:**
- `App`: состояние `mode: { kind: 'diary' } | { kind: 'people'; patchJson?: string }` и `openDay: string | null`.
  В режиме «люди» рендерит `<PeopleApp meta patchJson onExit onOpenDay />` на весь экран без `TabBar`.
  `onOpenDay(day)` — режим «дневник», вкладка «Календарь», `CalendarScreen initialDay={day}` сразу открывает форму дня.
- `SettingsScreen({ meta, onOpenPeople })` — первая карточка «Люди» как в макете 9.1: значок, «Люди», «Знакомые, встречи
  и события», три числа `peopleStats` («человека / не дополнено / не разобрано», `plural`), кнопка «Открыть «Люди»».
- `DataSettings({ meta, onPeoplePatch })` — если выбранный файл — JSON и `isPeoplePatchJson`, вызвать
  `onPeoplePatch(json)` вместо импорта бэкапа.
- `PeopleApp({ meta, patchJson, onExit, onOpenDay })` — стек экранов `Screen = { kind: 'list' } | { kind: 'events' } | { kind: 'person'; id } | { kind: 'event'; id } | { kind: 'spheres' } | { kind: 'patch'; json?: string }`, `push`/`back`; вкладки панели сбрасывают стек на свой корень; «+» открывает быструю форму (задача 4) поверх текущего экрана; «Дневник» — `onExit`. Состояние фильтров списка живёт здесь (не теряется при возврате из карточки).
- `PeopleNav({ active: 'list' | 'events' | null, onTab, onAdd, onExit })` — макет 9.2: четыре ячейки, «+» — круг 48 px `bg-accent`.
- `peopleUi.tsx`: `Avatar({ name, id, size })` (инициалы, фон из четырёх оттенков макета по хэшу id), `Chip`, `BottomSheet({ title, onClose, children })` (затемнение + шторка снизу, ручка), `BackBar({ label, onBack, right })`.

- [ ] **Step 1: Implement** по Interfaces; экраны модуля пока заглушки с заголовком.
- [ ] **Step 2: Run** `npm test && npm run build` — PASS.
- [ ] **Step 3: Проверка в браузере** (414×896): `npm run dev` → «Настройки» → карточка «Люди» → модуль открылся, панели дневника нет; «Дневник» возвращает в «Настройки».
- [ ] **Step 4: Commit** `feat(people): module shell, entry card and navigation`

---

### Task 3: Список, фильтры, меню (артборд 9)

**Files:** Create `src/ui/people/PeopleList.tsx`, `src/ui/people/FilterSheet.tsx`; Modify `PeopleApp.tsx`

- Шапка: «Люди» (Lora 30) и кнопка «⋯» → меню (поповер) «Сферы и круги» / «Изменения с ПК» с подписями из макета 9.5.
- Поиск + кнопка фильтров 46×46; включённые фильтры — плашки «Сфера: X ×», «Круг: X ×», «Не дополнено ×»,
  «Неразобранные ×», «Архив ×» (тап убирает пункт); на кнопке — `activeFilterCount`, при > 0 — залитая акцентом.
  При включённых фильтрах или запросе — строка «N человек» (`plural`).
- Список — `filterPeople`; строка: `Avatar`, имя (+ «(псевдонимы)»), компания и должность, сферы акцентом, дата
  последней записи `shortDay`, пометки «не разобрано» (глина) / «не дополнено» (серая). Карточка списка тянется до
  низа и уходит под панель (`pb` под высоту панели). Пусто: «Пока никого. Нажмите «+», чтобы добавить» / «Никого не
  нашлось».
- `FilterSheet` — макет 9.3: сферы (живые, по алфавиту), круг (живые неархивные), «Показать только» (три
  переключателя со счётчиками), «Сортировка» (`Segmented`), «Сбросить», «Показать N».

- [ ] **Step 1: Implement.** - [ ] **Step 2:** `npm test && npm run build` — PASS. - [ ] **Step 3: Браузер**: 0 людей; добавить 3 через консоль-хелпер не нужно — проверка после задачи 4. - [ ] **Step 4: Commit** `feat(people): list, filters and module menu`

---

### Task 4: Быстрое добавление, «похоже, уже есть», форма записи (артборды 10, 11.4)

**Files:** Create `src/ui/people/QuickAdd.tsx`, `src/ui/people/NoteForm.tsx`, `src/ui/people/EventPicker.tsx`; Modify `PeopleApp.tsx`

- `QuickAdd({ today, onClose, onOpenNote })` — полноэкранный `Sheet`: «Отмена» · «Новый человек»; «Имя» (autoFocus,
  `primeKeyboard` в обработчике «+»), «Что запомнил» (большое поле), чипы «Сегодня, 25 окт» (date input) и
  «+ Событие» → `EventPicker` (живые события, свежие сверху) → карточка события с «×»; «Заполнить подробно» раскрывает
  поля полной формы (общий компонент из задачи 5 — до него только кнопка); «Сохранить». Сохранение: `findSimilar` → есть
  совпадение — шторка макета 10.2 («Похоже, он уже есть», карточка найденного, «Это он — добавить встречу к нему»,
  «Это другой человек», подпись под кнопками); иначе `addPersonWithNote(createPerson, createNote(meeting, day, eventId,
  occasion = название события, original = текст))` и закрыть.
- «Это он» → `NoteForm` новой встречи найденного человека: дата, событие и исходная заметка уже заполнены (макет 10.4).
- `NoteForm({ person, note | draft, onClose })` — макеты 10.4 и 11.4: заголовок «Новая встреча» / «Встреча» / «Из
  дневника»; у новой встречи — карточка человека; если есть событие — подпись «на событии «…»» (без поля «Повод»);
  чип даты; поля «О чём говорили», «Что актуально у него», «Договорились, следующий шаг», «Исходная заметка» (у `diary` —
  только текст); «Удалить запись» у существующей. Сохранение — `saveNote`, флаг `busy`.

- [ ] **Step 1: Implement.** - [ ] **Step 2:** `npm test && npm run build` — PASS. - [ ] **Step 3: Браузер**: добавить «Иван Петров» с заметкой → в списке, «не разобрано»; добавить «петров иван» → шторка «Похоже…» → «Это он» → новая встреча у Ивана с заметкой; двойной тап «Сохранить» — одна запись. - [ ] **Step 4: Commit** `feat(people): quick add, similar person and note form`

---

### Task 5: Карточка, лента-хроника, полная форма (артборд 11)

**Files:** Create `src/ui/people/PersonCard.tsx`, `src/ui/people/Feed.tsx`, `src/ui/people/PersonForm.tsx`, `src/ui/people/PersonFields.tsx`, `src/ui/people/SphereInput.tsx`, `src/ui/people/PersonPicker.tsx`; Modify `QuickAdd.tsx` («Заполнить подробно» показывает `PersonFields`), `PeopleApp.tsx`

- `PersonCard` — макет 11.1 без строки «Познакомились»: «‹ Люди» · «Изменить»; аватар 56, имя, псевдонимы через «·»,
  должность и компания; чип круга, глиняный чип «N заметка не разобрана» (`plural`); карточка полей (пустые не
  рисуются); контакты с кнопкой «Скопировать» (`navigator.clipboard.writeText`, при ошибке — тихо); «Знаком с» —
  чипы живых людей (тап — их карточка); «Лента» + «+ Запись» (новая встреча на сегодня).
- `Feed` — макет 11.2: вертикальная нить, точки (глина — «не разобрано», акцент — встреча, полая — из дневника),
  дата Lora, вид капсом, ссылка на событие (тап — экран события), поля встречи с подписями, свёрнутая «Исходная
  заметка» у разобранной, «Открыть день ›» у записи из дневника (`onOpenDay`), полоса «разобрано Claude · 22 окт»
  по `claudeDividerIndex(meta.appliedPatches)` с датой `shortDay` от `lastApplied.appliedAt`; в конце — «Знакомство».
  Тап по записи — `NoteForm`.
- `PersonForm` — макет 11.3 (новый и правка): все поля `PersonFields` — имя, псевдонимы (чипы + «+ имя»), компания и
  должность, «Чем занимается», сферы (`SphereInput`: подсказки `findByName`/подстрока по живым сферам с числом людей,
  «+ Новая сфера «…»», совпадение без регистра выбирает существующую), круг (`select` живых неархивных + текущий),
  три текстовых поля, контакты (тип `select` + значение + «×», «+ контакт»), «Знаком с» (чипы + «+ человек» →
  `PersonPicker`, запись через `setLinks` + `saveLinks`); «Перенести в архив» / «Вернуть из архива», «Удалить человека»
  (confirm). Сохранение — `savePerson` (+ новые сферы `saveSpheres`).
- `PersonPicker({ title, exclude, onPick, onClose })` — `BottomSheet`: поиск `matchesQuery`, живые неархивные люди,
  `exclude` — серые «уже на событии»/«уже знакомы».

- [ ] **Step 1: Implement.** - [ ] **Step 2:** `npm test && npm run build` — PASS. - [ ] **Step 3: Браузер**: правка Ивана — сферы «Консалтинг» при существующей «консалтинг» не дублируется; связь с Анной видна у обоих; архив — пропал из списка, виден с фильтром «Архив»; удаление — пропал. - [ ] **Step 4: Commit** `feat(people): person card, chronicle feed and full form`

---

### Task 6: События (артборд 12)

**Files:** Create `src/ui/people/EventsScreen.tsx`, `src/ui/people/EventScreen.tsx`, `src/ui/people/EventForm.tsx`; Modify `PeopleApp.tsx`

- `EventsScreen` — макет 12.1: «События» + «+» (новое событие), месяцы `eventsByMonth`, строка: дата-плашка,
  название, тема, число людей. Пусто: «Событий пока нет».
- `EventScreen` — макет 12.2: только просмотр — «‹ События» · «Изменить», дата капсом, название, тема, «Люди на
  событии» (тап — карточка).
- `EventForm({ event | null, today })` — макет 12.3: название, дата, тема, список людей, «Добавить человека» →
  `PersonPicker` (уже отмеченные серые) → `NoteForm` новой встречи с `meetingAtEvent`; «Удалить событие» (confirm).
  Новое событие сохраняется перед добавлением человека (нужно название — иначе ошибка под полем).

- [ ] **Step 1: Implement.** - [ ] **Step 2:** `npm test && npm run build` — PASS. - [ ] **Step 3: Браузер**: событие → добавить Ивана → у Ивана в ленте встреча со ссылкой на событие; удалить событие — запись осталась с поводом. - [ ] **Step 4: Commit** `feat(people): events list, view and edit form`

---

### Task 7: Сферы и круги (артборд 13)

**Files:** Create `src/ui/people/SpheresScreen.tsx`; Modify `PeopleApp.tsx`

- Макет 13.1: «‹ Люди», «Сферы и круги»; «Сферы · N» — живые по алфавиту с числом людей (`countByKey`), тап —
  шторка 13.3: название + «Переименовать», «Объединить с другой сферой» (радио), пояснение «У N человек «…»
  заменится на «…»…», «Объединить» → `mergeSphereInto`.
- «Круги» — по `order`, число людей, порядок — кнопками ↑↓ (`IconButton`, как в метриках), «+ Круг», тап — шторка 13.4:
  название, «Сохранить», «Перенести в архив» / «Вернуть»; архивные — свёрнутой строкой «В архиве: …».

- [ ] **Step 1: Implement.** - [ ] **Step 2:** `npm test && npm run build` — PASS. - [ ] **Step 3: Браузер**: объединить две сферы → у человека одна. - [ ] **Step 4: Commit** `feat(people): spheres and circles screen`

---

### Task 8: Изменения с ПК (артборд 14)

**Files:** Create `src/ui/people/PatchScreen.tsx`, `src/ui/people/PatchEditSheet.tsx`; Modify `PeopleApp.tsx`

- Экран выбора (14.1): «‹ Люди», «Изменения с ПК», абзац и три шага из макета, «Выбрать файл» (`accept=".json,application/json"`), карточка ошибки `PatchError` с именем файла. Если пришёл `patchJson` из «Настроек» — сразу предпросмотр.
- Предпросмотр (14.2–14.3): «‹ Назад» · «Предпросмотр»; сводка `summary`, «Создан …· по выгрузке …»
  (`formatDateTime`); глиняная плашка «Этот файл уже применён …», если `alreadyApplied`; группы `previewGroups`
  с аватаром и бейджами «новый» / «объединение»; строка операции: чекбокс (по `effectiveSelection`; `blocked` —
  недоступен; зависимые — пунктир), `opTitle`, «ваша правка», «было → станет» по `FIELD_LABELS`, причина; ✎ у
  `editable`. Раздел «Конфликты · N» перед первой группой с конфликтом. Низ: «Выбрано X из Y» + «Применить выбранное».
- `PatchEditSheet` (14.4): аватар, имя, «карточка» / «запись»; при конфликте — глиняная плашка; по каждому полю
  предложения: «в телефоне» и «от Claude» с кнопками «взять», поле «Итог» (списки — через запятую, контакты — только
  просмотр); «Готово — применить с правкой» → `decisions[index] = { selected: true, set }`.
- Итог (14.5): «Применено N», «из файла от … · K — с вашей правкой», строки по видам, «Пропущено M …», «К людям».
  Применение — `applyPeoplePatch`.

- [ ] **Step 1: Implement.** - [ ] **Step 2:** `npm test && npm run build` — PASS. - [ ] **Step 3: Браузер**: файл `samplePatch` из `testFixtures` (собрать JSON в консоли) через меню и через «Настройки» → «Импорт»; конфликт — поставить галочку, править ✎; повторное открытие — «уже применён». - [ ] **Step 4: Commit** `feat(people): changes-from-PC preview, edit and apply`

---

### Task 9: Версия 1.5.0, документы, проверка на iPhone, публикация

**Files:** Modify `package.json` (`version` 1.5.0), `CLAUDE.md` (модель данных v4, `formatVersion: 5`, экраны,
структура, текущее состояние); Create `docs/phase3-people-results.md` (таблица проверок на iPhone: вход и выход,
быстрое добавление голосом, «похоже», карточка и лента, событие, сферы, экспорт с `people/`, файл изменений через
Telegram → «Файлы», авиарежим).

- [ ] **Step 1:** правки, `npm test && npm run build` — PASS.
- [ ] **Step 2: Commit** `chore: release 1.5.0 — people module`.
- [ ] **Step 3: Спросить пользователя** про слияние в `main` и push (= деплой). Только после «да»: `git switch main && git merge --ff-only feature/people && git push` — хук `pre-push` проверит личные данные.
