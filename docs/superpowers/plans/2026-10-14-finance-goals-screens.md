# Финансы и цели, часть 2 — экраны. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** вкладки «Финансы» и «Цели», строка трат в «Итоге», блок «Категории» в «Настройках» по выбранным макетам;
версия 1.2.0 на iPhone.

**Architecture:** логика для экранов (доли важности, группы по дням, подписи прогресса, форма измерения цели) —
чистые функции в `src/domain/` с тестами; экраны в `src/ui/` читают данные через `db/` (`useLiveQuery`) и пишут через
функции `db/`. Общие элементы (точка важности, шапка месяца, лист, переключатель) — `src/ui/financeUi.tsx`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Dexie 4 + `dexie-react-hooks`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-finance-goals-design.md` (§6 и §6.1 — экраны и выбранный дизайн).
Макеты — Claude Design «Дневник — финансы и цели» (https://claude.ai/artifact/54x6G4dAzDa72P6feRpBM1): доска 2А
(Финансы), 3А (ввод), 4 (Цели), 5 (Итог, Категории). Часть 1 — `docs/superpowers/plans/2026-10-14-finance-goals-data.md`.

## Global Constraints
- Ветка `phase2-finance-goals` (часть 1 уже в ней). **Push в `main` = деплой**: только в Task 7, после «да» пользователя.
- Интерфейс — на русском. Поля ввода — шрифт ≥ 16 px; зоны нажатия ≥ 44 px; `safe-area-inset` сверху и снизу.
- Цвета только токенами (`bg`, `surface`, `ink`, `muted`, `line`, `accent`, `accent-ink`, `danger`, новые
  `imp-need`, `imp-useful`, `imp-optional`). Важность: светлая `#5A6B36` / `#A3B677` / `#D9925F`, тёмная
  `#B6C78C` / `#6E7F4B` / `#D9936D`.
- Карточки — скругление 20 px, `shadow-card`; кнопки — 14 px; заголовки — `font-serif` (Lora 600).
- Данные — только через `src/db/diary.ts`; логика — в `src/domain/` с тестами; метки времени — `isoWithOffset`.
- Суммы — копейки; ввод суммы — только через `parseAmount`, вывод — `formatMoney` / `formatAmount`.
- Нижняя панель: **Итог · Финансы · Цели · Календарь · Настройки**.
- В строке «Итога» — только траты, без дохода.
- Коммиты на английском, последняя строка — `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Клавиатура не открывается по «+» на iPhone** (iOS фокусирует поле с клавиатурой только внутри жеста, а лист
   рисуется после него). Ожидание: `primeKeyboard()` в обработчике тапа, поле суммы забирает фокус. Проверка —
   Task 5 (браузер) и Task 7 (iPhone, пункт 2).
2. **Правка операции без смены категории** (или её категория в архиве и не видна в сетке). Ожидание: кнопка
   «Сохранить» в режиме правки сохраняет с прежней категорией. Task 3.
3. **Сумма с пробелами, запятой, «₽» или ноль.** Ожидание: понятная ошибка под суммой, ничего не сохранено.
   `parseAmount` (часть 1) + вывод ошибки в Task 3; порог цели — тесты `targetFromForm` в Task 1.
4. **Ночь 00:00–06:00.** Ожидание: новая операция по умолчанию — на логический «сегодня» (вчерашнюю дату), строка
   «Итога» и список «Сегодня» — тоже. Везде `useLogicalToday`; проверка сменой границы дня в Task 5.
5. **Нет данных** (пустой месяц, нет трат, нет метрик для привычки). Ожидание: понятные пустые состояния, без
   `NaN %` и пустых полос. Тесты `importanceShares`, `progressPercent` в Task 1; проверка в Task 5.

---

### Task 1: Логика для экранов

**Files:**
- Modify: `src/domain/dates.ts`, `src/domain/dates.test.ts`, `src/domain/ru.ts`, `src/domain/ru.test.ts`,
  `src/domain/finance.ts`, `src/domain/finance.test.ts`, `src/domain/goals.ts`, `src/domain/goals.test.ts`

**Interfaces:**
- Produces:
  - `addMonths(month: string, n: number): string`, `monthRange(month: string): [string, string]` (`dates.ts`)
  - `dayGroupTitle(day: string, today: string): string` (`ru.ts`)
  - `importanceShares(byImportance): Record<Importance, number>`, `groupByDay(txs, month): DayGroup[]`,
    `DayGroup { day; expense; income; items: Transaction[] }`, `nextImportance(i): Importance`;
    `dayTotals` возвращает ещё `expenseCount`; комментарий операции схлопывает переносы строк (`finance.ts`)
  - `AGGREGATE_LABELS`, `progressPercent(p): number`, `goalDetail(goal, p, defs): string`, `TargetMeasure`,
    `TargetForm`, `EMPTY_TARGET_FORM`, `targetFromForm(f): GoalTarget`, `formFromTarget(t?): TargetForm` (`goals.ts`)

- [ ] **Step 1: Написать падающие тесты**

`src/domain/dates.test.ts` (импорт `addMonths, monthRange`):

```ts
describe('месяцы', () => {
  it('addMonths переходит через год в обе стороны', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-05', 0)).toBe('2026-05')
  })
  it('monthRange — с 01 по 31 включительно', () => {
    expect(monthRange('2026-02')).toEqual(['2026-02-01', '2026-02-31'])
  })
})
```

`src/domain/ru.test.ts` (импорт `dayGroupTitle`):

```ts
describe('dayGroupTitle', () => {
  it('сегодня, вчера, иначе день недели', () => {
    expect(dayGroupTitle('2026-11-18', '2026-11-18')).toBe('Сегодня, 18 ноября')
    expect(dayGroupTitle('2026-11-17', '2026-11-18')).toBe('Вчера, 17 ноября')
    expect(dayGroupTitle('2026-11-16', '2026-11-18')).toBe('Понедельник, 16 ноября')
  })
})
```

`src/domain/finance.test.ts` — в импорт добавить `groupByDay, importanceShares, nextImportance`; в тесте
`dayTotals` заменить ожидания на `{ income: 0, expense: 125000, count: 2, expenseCount: 2 }` и
`{ income: 0, expense: 0, count: 0, expenseCount: 0 }`; добавить:

```ts
describe('для экранов', () => {
  it('importanceShares: целые проценты в сумме 100; нет трат — нули', () => {
    expect(importanceShares({ need: 31200, useful: 12640, optional: 8500 })).toEqual({ need: 60, useful: 24, optional: 16 })
    expect(importanceShares({ need: 1, useful: 1, optional: 1 })).toEqual({ need: 34, useful: 33, optional: 33 })
    expect(importanceShares({ need: 0, useful: 0, optional: 0 })).toEqual({ need: 0, useful: 0, optional: 0 })
  })
  it('groupByDay: живые операции месяца, новые дни сверху, внутри — последние добавленные сверху', () => {
    const a = txRec('2026-11-02', { amount: 100, createdAt: '2026-11-02T10:00:00.000+03:00' })
    const b = txRec('2026-11-02', { amount: 200, createdAt: '2026-11-02T12:00:00.000+03:00' })
    const c = txRec('2026-11-03', { kind: 'income', categoryKey: 'salary', amount: 5000 })
    const gone = txRec('2026-11-04', { deletedAt: NOW })
    const other = txRec('2026-10-31')
    const groups = groupByDay([a, b, c, gone, other], '2026-11')
    expect(groups.map((g) => [g.day, g.expense, g.income])).toEqual([['2026-11-03', 0, 5000], ['2026-11-02', 300, 0]])
    expect(groups[1].items.map((t) => t.id)).toEqual([b.id, a.id])
  })
  it('nextImportance — по кругу', () => {
    expect([nextImportance('need'), nextImportance('useful'), nextImportance('optional')]).toEqual(['useful', 'optional', 'need'])
  })
  it('комментарий операции — в одну строку', () => {
    const t = createTransaction({ kind: 'expense', amount: 100, categoryKey: 'cafe', day: '2026-11-02', note: ' кофе\nс  Машей ' }, NOW)
    expect(t.note).toBe('кофе с Машей')
    expect(updateTransaction(t, { note: 'обед\r\nс коллегами' }, NOW).note).toBe('обед с коллегами')
  })
})
```

`src/domain/goals.test.ts` — в импорт добавить `EMPTY_TARGET_FORM, formFromTarget, goalDetail, progressPercent,
targetFromForm, type GoalProgress`; добавить:

```ts
describe('подписи прогресса', () => {
  const p = (value: number | null, target: number, remaining: number | null, state: GoalProgress['state']): GoalProgress =>
    ({ value, target, remaining, state })
  const fin = (measure: 'expense' | 'saved', op: 'le' | 'ge', value: number) =>
    goalRec('2026-11', { target: { kind: 'finance', measure, op, value } })
  const met = (metricKey: string, aggregate: 'count' | 'sum' | 'avg', value: number) =>
    goalRec('2026-11', { target: { kind: 'metric', metricKey, aggregate, op: 'ge', value } })

  it('progressPercent: 0–100, без деления на ноль и отрицательных', () => {
    expect(progressPercent(p(560000, 600000, 40000, 'within'))).toBe(93)
    expect(progressPercent(p(3266000, 3000000, 0, 'done'))).toBe(100)
    expect(progressPercent(p(-5000, 3000000, 3005000, 'progress'))).toBe(0)
    expect(progressPercent(p(null, 3.5, null, 'progress'))).toBe(0)
    expect(progressPercent(p(5, 0, 0, 'done'))).toBe(100)
  })
  it('goalDetail по состояниям', () => {
    expect(goalDetail(fin('expense', 'le', 600000), p(560000, 600000, 40000, 'within'), defs)).toBe('5 600 из 6 000 ₽ · можно ещё 400 ₽')
    expect(goalDetail(fin('expense', 'le', 600000), p(620000, 600000, -20000, 'over'), defs)).toBe('6 200 из 6 000 ₽ · перерасход 200 ₽')
    expect(goalDetail(fin('saved', 'ge', 3000000), p(3266000, 3000000, 0, 'done'), defs)).toBe('32 660 из 30 000 ₽')
    expect(goalDetail(met('m1', 'count', 12), p(7, 12, 5, 'progress'), defs)).toBe('7 из 12 дней · осталось 5')
    expect(goalDetail(met('m1', 'count', 12), p(7, 12, 5, 'missed'), defs)).toBe('7 из 12 дней')
    expect(goalDetail(met('m2', 'sum', 600), p(75, 600, 525, 'progress'), defs)).toBe('75 из 600 мин · осталось 525 мин')
    expect(goalDetail(met('mood', 'avg', 3.5), p(null, 3.5, null, 'progress'), defs)).toBe('Пока нет данных')
    expect(goalDetail(goalRec('2026-11'), null, defs)).toBe('Без измерения — сверит Claude по записям дней')
  })
})

describe('форма измерения цели', () => {
  const form = (patch: Partial<typeof EMPTY_TARGET_FORM>) => ({ ...EMPTY_TARGET_FORM, ...patch })

  it('траты по категории, по важности; «отложено» без фильтра; доход без фильтра важности', () => {
    expect(targetFromForm(form({ filter: 'cat:cafe', value: '6 000' }))).toEqual(
      { kind: 'finance', measure: 'expense', filter: { categoryKey: 'cafe' }, op: 'le', value: 600000 })
    expect(targetFromForm(form({ filter: 'imp:optional', value: '10000' }))).toEqual(
      { kind: 'finance', measure: 'expense', filter: { importance: 'optional' }, op: 'le', value: 1000000 })
    expect(targetFromForm(form({ measure: 'saved', filter: 'cat:cafe', op: 'ge', value: '30 000' }))).toEqual(
      { kind: 'finance', measure: 'saved', op: 'ge', value: 3000000 })
    expect(targetFromForm(form({ measure: 'income', filter: 'imp:need', op: 'ge', value: '1' }))).toEqual(
      { kind: 'finance', measure: 'income', op: 'ge', value: 100 })
  })
  it('метрика: число с запятой', () => {
    expect(targetFromForm(form({ measure: 'metric', metricKey: 'mood', aggregate: 'avg', op: 'ge', value: '3,5' }))).toEqual(
      { kind: 'metric', metricKey: 'mood', aggregate: 'avg', op: 'ge', value: 3.5 })
  })
  it('ошибки с текстом для пользователя', () => {
    expect(() => targetFromForm(form({ value: '' }))).toThrow('Введите сумму, например 1 250 или 99,90')
    expect(() => targetFromForm(form({ measure: 'metric', value: '12' }))).toThrow('Выберите привычку или метрику')
    expect(() => targetFromForm(form({ measure: 'metric', metricKey: 'm1', value: 'много' }))).toThrow('Введите число, например 12')
    expect(() => targetFromForm(form({ measure: 'metric', metricKey: 'm1', value: '-1' }))).toThrow('Введите число, например 12')
  })
  it('formFromTarget → targetFromForm возвращает то же измерение', () => {
    const targets: GoalTarget[] = [
      { kind: 'finance', measure: 'expense', filter: { categoryKey: 'cafe' }, op: 'le', value: 600050 },
      { kind: 'finance', measure: 'expense', filter: { importance: 'need' }, op: 'le', value: 100000 },
      { kind: 'finance', measure: 'saved', op: 'ge', value: 3000000 },
      { kind: 'metric', metricKey: 'm2', aggregate: 'sum', op: 'ge', value: 600 },
      { kind: 'metric', metricKey: 'mood', aggregate: 'avg', op: 'ge', value: 3.5 },
    ]
    for (const t of targets) expect(targetFromForm(formFromTarget(t))).toEqual(t)
    expect(formFromTarget(undefined)).toEqual(EMPTY_TARGET_FORM)
  })
})
```

- [ ] **Step 2: Запустить — падают**

Run: `npx vitest run src/domain`
Expected: FAIL — нет `addMonths`, `monthRange`, `dayGroupTitle`, `importanceShares`, `groupByDay`, `nextImportance`,
`progressPercent`, `goalDetail`, `targetFromForm`, `formFromTarget`; `dayTotals` без `expenseCount`; переносы в note.

- [ ] **Step 3: Реализовать**

`src/domain/dates.ts`:

```ts
/** 2026-11 + 2 → 2027-01. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** Границы месяца для выборки по дням: с 01 по 31 (строки сравниваются, несуществующая дата не мешает). */
export const monthRange = (month: string): [string, string] => [`${month}-01`, `${month}-31`]
```

`src/domain/ru.ts` (импорт: `import { addDays, pad, parseDay } from './dates'`):

```ts
/** Заголовок дня в списке операций: «Сегодня, 18 ноября», «Вчера, 17 ноября», иначе «Понедельник, 16 ноября». */
export function dayGroupTitle(day: string, today: string): string {
  const d = parseDay(day)
  const date = `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`
  if (day === today) return `Сегодня, ${date}`
  if (day === addDays(today, -1)) return `Вчера, ${date}`
  return formatDayTitle(day)
}
```

`src/domain/finance.ts`:
- после `checkAmount` добавить и использовать в `createTransaction` (`const note = cleanNote(input.note)`) и
  `updateTransaction` (`const note = cleanNote(next.note)`):

```ts
/** Комментарий — одна строка: переносы и повторные пробелы схлопываются (строка «Траты» в Markdown). */
const cleanNote = (note?: string) => note?.replace(/\s+/g, ' ').trim()
```

- `dayTotals`:

```ts
export function dayTotals(
  txs: Transaction[],
  day: string,
): { income: number; expense: number; count: number; expenseCount: number } {
  const ofDay = liveTransactions(txs).filter((t) => t.day === day)
  const expenses = ofDay.filter((t) => t.kind === 'expense')
  return {
    income: sum(ofDay.filter((t) => t.kind === 'income')),
    expense: sum(expenses),
    count: ofDay.length,
    expenseCount: expenses.length,
  }
}
```

- в конец:

```ts
/** Доли уровней в процентах: целые, в сумме 100 (метод наибольшего остатка); нет трат — нули. */
export function importanceShares(byImportance: Record<Importance, number>): Record<Importance, number> {
  const result: Record<Importance, number> = { need: 0, useful: 0, optional: 0 }
  const total = IMPORTANCES.reduce((s, i) => s + byImportance[i], 0)
  if (total <= 0) return result
  const exact = IMPORTANCES.map((i) => (byImportance[i] / total) * 100)
  IMPORTANCES.forEach((i, k) => (result[i] = Math.floor(exact[k])))
  let left = 100 - IMPORTANCES.reduce((s, i) => s + result[i], 0)
  const byRemainder = IMPORTANCES.map((i, k) => ({ i, r: exact[k] - Math.floor(exact[k]) })).sort((a, b) => b.r - a.r)
  for (const { i } of byRemainder) {
    if (left <= 0) break
    result[i]++
    left--
  }
  return result
}

export interface DayGroup {
  day: string
  expense: number
  income: number
  items: Transaction[]
}

/** Живые операции месяца по дням: новые дни сверху, внутри дня — последние добавленные сверху. */
export function groupByDay(txs: Transaction[], month: string): DayGroup[] {
  const map = new Map<string, DayGroup>()
  for (const t of liveTransactions(txs)) {
    if (monthOf(t.day) !== month) continue
    const g = map.get(t.day) ?? { day: t.day, expense: 0, income: 0, items: [] }
    g[t.kind] += t.amount
    g.items.push(t)
    map.set(t.day, g)
  }
  const groups = [...map.values()].sort((a, b) => b.day.localeCompare(a.day))
  for (const g of groups) g.items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return groups
}

/** Следующий уровень важности по кругу — тап по метке в «Настройках». */
export function nextImportance(i: Importance): Importance {
  return IMPORTANCES[(IMPORTANCES.indexOf(i) + 1) % IMPORTANCES.length]
}
```

`src/domain/goals.ts` — импорт `formatAmount, formatMoney, parseAmount` из `'./money'`; добавить:

```ts
export const AGGREGATE_LABELS: Record<GoalAggregate, string> = { count: 'дней с «да»', sum: 'сумма', avg: 'среднее' }

/** Заполненность полосы прогресса, 0–100. */
export function progressPercent(p: GoalProgress): number {
  if (p.value === null || p.value <= 0) return 0
  if (p.target <= 0) return 100
  return Math.min(100, Math.round((p.value / p.target) * 100))
}

const DAYS: [string, string, string] = ['день', 'дня', 'дней']

function amountOf(t: GoalTarget, n: number, defs: MetricDefinition[]): string {
  if (t.kind === 'finance') return formatMoney(n)
  if (t.aggregate === 'count') return String(n)
  const unit = defs.find((d) => d.key === t.metricKey)?.unit
  return unit ? `${decimal(n)} ${unit}` : decimal(n)
}

function valuePair(t: GoalTarget, value: number, target: number, defs: MetricDefinition[]): string {
  if (t.kind === 'finance') return `${formatAmount(value)} из ${formatMoney(target)}`
  if (t.aggregate === 'count') return `${value} из ${target} ${plural(target, DAYS)}`
  return `${decimal(value)} из ${amountOf(t, target, defs)}`
}

/** «5 600 из 6 000 ₽ · можно ещё 400 ₽», «7 из 12 дней · осталось 5»; без измерения — подсказка. */
export function goalDetail(goal: Goal, p: GoalProgress | null, defs: MetricDefinition[]): string {
  if (!goal.target || !p) return 'Без измерения — сверит Claude по записям дней'
  if (p.value === null || p.remaining === null) return 'Пока нет данных'
  const t = goal.target
  const pair = valuePair(t, p.value, p.target, defs)
  if (p.state === 'within') return `${pair} · можно ещё ${amountOf(t, p.remaining, defs)}`
  if (p.state === 'over') return `${pair} · перерасход ${amountOf(t, -p.remaining, defs)}`
  if (p.state === 'progress') return `${pair} · осталось ${amountOf(t, p.remaining, defs)}`
  return pair
}

export type TargetMeasure = 'expense' | 'income' | 'saved' | 'metric'

/** Поля формы «Измерять». filter: '' — без фильтра, 'cat:<ключ>', 'imp:<уровень>'. */
export interface TargetForm {
  measure: TargetMeasure
  filter: string
  metricKey: string
  aggregate: GoalAggregate
  op: GoalOp
  value: string
}

export const EMPTY_TARGET_FORM: TargetForm = { measure: 'expense', filter: '', metricKey: '', aggregate: 'count', op: 'le', value: '' }

/** Измерение из полей формы; ошибка — с текстом для пользователя. */
export function targetFromForm(f: TargetForm): GoalTarget {
  if (f.measure === 'metric') {
    if (!f.metricKey) throw new Error('Выберите привычку или метрику')
    const value = Number(f.value.replace(/\s/g, '').replace(',', '.'))
    if (!f.value.trim() || !Number.isFinite(value) || value < 0) throw new Error('Введите число, например 12')
    return { kind: 'metric', metricKey: f.metricKey, aggregate: f.aggregate, op: f.op, value }
  }
  const value = parseAmount(f.value)
  let filter: { categoryKey: string } | { importance: Importance } | undefined
  if (f.measure !== 'saved' && f.filter.startsWith('cat:')) filter = { categoryKey: f.filter.slice(4) }
  if (f.measure === 'expense' && f.filter.startsWith('imp:')) filter = { importance: f.filter.slice(4) as Importance }
  return { kind: 'finance', measure: f.measure, ...(filter ? { filter } : {}), op: f.op, value }
}

export function formFromTarget(t: GoalTarget | undefined): TargetForm {
  if (!t) return EMPTY_TARGET_FORM
  if (t.kind === 'metric') {
    return { ...EMPTY_TARGET_FORM, measure: 'metric', metricKey: t.metricKey, aggregate: t.aggregate, op: t.op, value: String(t.value).replace('.', ',') }
  }
  const filter = !t.filter ? '' : 'categoryKey' in t.filter ? `cat:${t.filter.categoryKey}` : `imp:${t.filter.importance}`
  return { ...EMPTY_TARGET_FORM, measure: t.measure, filter, op: t.op, value: formatAmount(t.value) }
}
```

(`decimal` уже объявлен в `goals.ts` для `formatGoalValue` — перенести его объявление выше `amountOf`.)

- [ ] **Step 4: Запустить — проходят; сборка без ошибок**

Run: `npm test && npm run build`
Expected: PASS; build без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat: screen helpers for finance and goals (shares, day groups, goal details, target form)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Токены важности и общие элементы

**Files:**
- Modify: `src/index.css`, `src/ui/MetricsSettings.tsx` (экспорт `IconButton`)
- Create: `src/ui/financeUi.tsx`

**Interfaces:**
- Consumes: `addMonths` (Task 1), `monthTitle`, `isoWithOffset`.
- Produces (`financeUi.tsx`): `IMP_BG`, `ImpDot({ importance?, className? })`, `MonthHeader({ overline, month,
  onChange, max? })`, `Sheet({ children })`, `Segmented<T>({ label, options, value, onChange, className? })`,
  `primeKeyboard()`, `now()`; из `MetricsSettings.tsx` — `export function IconButton`.

- [ ] **Step 1: Токены в `src/index.css`**

В `:root` после `--danger`:

```css
  --imp-need: #5A6B36;
  --imp-useful: #A3B677;
  --imp-optional: #D9925F;
```

В тёмном блоке после `--danger`:

```css
    --imp-need: #B6C78C;
    --imp-useful: #6E7F4B;
    --imp-optional: #D9936D;
```

В `@theme inline` после `--color-danger`:

```css
  --color-imp-need: var(--imp-need);
  --color-imp-useful: var(--imp-useful);
  --color-imp-optional: var(--imp-optional);
```

- [ ] **Step 2: `src/ui/MetricsSettings.tsx`** — `function IconButton` → `export function IconButton` (без других изменений).

- [ ] **Step 3: Создать `src/ui/financeUi.tsx`**

```tsx
import type { ReactNode } from 'react'
import { addMonths, isoWithOffset } from '../domain/dates'
import { monthTitle } from '../domain/ru'
import type { Importance } from '../domain/types'

export const now = () => isoWithOffset(new Date())

export const IMP_BG: Record<Importance, string> = {
  need: 'bg-imp-need',
  useful: 'bg-imp-useful',
  optional: 'bg-imp-optional',
}

/** Точка важности категории; у дохода важности нет — точка акцентная. */
export function ImpDot({ importance, className = 'size-2.5' }: { importance?: Importance; className?: string }) {
  return <span aria-hidden="true" className={`shrink-0 rounded-full ${importance ? IMP_BG[importance] : 'bg-accent'} ${className}`} />
}

const Chevron = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

/** Шапка вкладки: надпись, «Ноябрь 2026», стрелки месяца. max — последний доступный месяц. */
export function MonthHeader({ overline, month, onChange, max }: {
  overline: string
  month: string
  onChange: (month: string) => void
  max?: string
}) {
  const [y, m] = month.split('-').map(Number)
  const btn = 'flex size-11 items-center justify-center rounded-[14px] border border-line bg-surface text-ink disabled:opacity-30'
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">{overline}</p>
        <h1 className="font-serif text-[30px] leading-[1.15] font-semibold">{monthTitle(y, m - 1)}</h1>
      </div>
      <div className="flex gap-2">
        <button type="button" aria-label="Прошлый месяц" className={btn} onClick={() => onChange(addMonths(month, -1))}>
          <Chevron d="M15 5l-7 7 7 7" />
        </button>
        <button
          type="button" aria-label="Следующий месяц" className={btn}
          disabled={max !== undefined && month >= max} onClick={() => onChange(addMonths(month, 1))}
        >
          <Chevron d="M9 5l7 7-7 7" />
        </button>
      </div>
    </header>
  )
}

/** Полноэкранный лист поверх вкладки — как правка дня в календаре. */
export function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-3.5 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ label, options, value, onChange, className = '' }: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="group" aria-label={label} className={`grid rounded-xl bg-line/70 p-[3px] ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={`min-h-[36px] rounded-[10px] px-2 text-[14px] ${
            o.value === value ? 'bg-surface font-semibold text-ink shadow-sm' : 'font-medium text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * iOS открывает клавиатуру, только если поле получило фокус внутри жеста. Лист рисуется после тапа, поэтому в самом
 * обработчике фокусируем временное поле: клавиатура открывается, поле суммы в листе забирает фокус себе.
 */
export function primeKeyboard() {
  const el = document.createElement('input')
  el.setAttribute('inputmode', 'decimal')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px'
  document.body.appendChild(el)
  el.focus()
  window.setTimeout(() => el.remove(), 1000)
}
```

- [ ] **Step 4: Проверка**

Run: `npm test && npm run build`
Expected: PASS; build без ошибок (новые компоненты пока не используются — `noUnusedLocals` касается только
локальных имён, экспорт допустим).

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/ui
git commit -m "feat: importance color tokens and shared finance UI pieces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Вкладка «Финансы» и ввод операции

**Files:**
- Create: `src/ui/TransactionSheet.tsx`, `src/ui/FinanceScreen.tsx`

**Interfaces:**
- Consumes: Task 1, Task 2; из части 1 — `getFinanceCategories`, `listTransactions`, `saveTransaction`,
  `monthSummary`, `categoryOf`, `categoriesByUse`, `createTransaction`, `updateTransaction`, `deleteTransaction`,
  `IMPORTANCES`, `IMPORTANCE_LABELS`, `parseAmount`, `formatAmount`, `formatMoney`; `Card` из `MetricCards.tsx`.
- Produces: `TransactionSheet({ initial: Transaction | null, today, onClose })`, `FinanceScreen({ meta })` (default exports).

- [ ] **Step 1: `src/ui/TransactionSheet.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getFinanceCategories, listTransactions, saveTransaction } from '../db/diary'
import { addDays } from '../domain/dates'
import {
  IMPORTANCES, IMPORTANCE_LABELS, categoriesByUse, createTransaction, deleteTransaction, updateTransaction,
} from '../domain/finance'
import { formatAmount, parseAmount } from '../domain/money'
import { dayGroupTitle } from '../domain/ru'
import type { FinanceKind, Transaction } from '../domain/types'
import { errorText } from './errors'
import { ImpDot, Segmented, Sheet, now } from './financeUi'

const KINDS: { value: FinanceKind; label: string }[] = [
  { value: 'expense', label: 'Трата' },
  { value: 'income', label: 'Доход' },
]

/** Ввод и правка операции: сумма → тап по категории сохраняет и закрывает. */
export default function TransactionSheet({ initial, today, onClose }: {
  initial: Transaction | null
  today: string
  onClose: () => void
}) {
  const [kind, setKind] = useState<FinanceKind>(initial?.kind ?? 'expense')
  const [amount, setAmount] = useState(initial ? formatAmount(initial.amount) : '')
  const [day, setDay] = useState(initial?.day ?? today)
  const [note, setNote] = useState(initial?.note ?? '')
  const [noteOpen, setNoteOpen] = useState(Boolean(initial?.note))
  const [error, setError] = useState<string | null>(null)
  const cats = useLiveQuery(getFinanceCategories)
  const recent = useLiveQuery(() => listTransactions(addDays(today, -89), today), [today])
  if (!cats || !recent) return null
  const list = categoriesByUse(recent, cats, kind, today)

  async function save(categoryKey: string) {
    let value: number
    try {
      value = parseAmount(amount)
    } catch (e) {
      setError(errorText(e))
      return
    }
    const tx = initial
      ? updateTransaction(initial, { amount: value, categoryKey, day, note }, now())
      : createTransaction({ kind, amount: value, categoryKey, day, note }, now())
    try {
      await saveTransaction(tx)
      onClose()
    } catch (e) {
      setError(`Не сохранилось: ${errorText(e)}`)
    }
  }

  async function remove() {
    if (!initial || !window.confirm('Удалить операцию?')) return
    try {
      await saveTransaction(deleteTransaction(initial, now()))
      onClose()
    } catch (e) {
      setError(`Не удалилось: ${errorText(e)}`)
    }
  }

  const side = 'min-h-[44px] w-24 text-[16px] text-accent'
  return (
    <Sheet>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onClose} className={`${side} text-left`}>Отмена</button>
        {initial ? (
          <h2 className="font-serif text-[20px] font-semibold">{kind === 'income' ? 'Доход' : 'Трата'}</h2>
        ) : (
          <Segmented label="Вид операции" options={KINDS} value={kind} onChange={setKind} className="w-44" />
        )}
        {initial ? (
          <button type="button" onClick={() => void save(initial.categoryKey)} className={`${side} text-right font-semibold`}>
            Сохранить
          </button>
        ) : (
          <span className="w-24" />
        )}
      </div>

      <label className="flex items-baseline justify-center gap-2 py-1">
        <span className="sr-only">Сумма в рублях</span>
        <input
          autoFocus={!initial} inputMode="decimal" enterKeyHint="done" value={amount} placeholder="0"
          onChange={(e) => {
            setAmount(e.target.value)
            setError(null)
          }}
          style={{ width: `${Math.max(amount.length, 1) + 0.6}ch` }}
          className="bg-transparent text-right font-serif text-[52px] leading-none font-semibold text-ink tabular-nums outline-none placeholder:text-muted"
        />
        <span className="font-serif text-[30px] text-muted">₽</span>
      </label>

      <div className="flex flex-wrap justify-center gap-2">
        <label className="relative flex min-h-[40px] items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[14px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          {dayGroupTitle(day, today)}
          <input
            type="date" value={day} max={today} aria-label="День операции"
            onChange={(e) => e.target.value && setDay(e.target.value)} className="absolute inset-0 opacity-0"
          />
        </label>
        {!noteOpen && (
          <button
            type="button" onClick={() => setNoteOpen(true)}
            className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-dashed border-muted/60 px-3.5 text-[14px] text-muted"
          >
            + Комментарий
          </button>
        )}
      </div>
      {noteOpen && (
        <input
          value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-label="Комментарий"
          placeholder="Например, «кофе с Машей»"
          className="min-h-[44px] rounded-[14px] border border-line bg-surface px-3.5 text-[16px] text-ink outline-none placeholder:text-muted"
        />
      )}
      {error && <p role="alert" className="text-center text-[14px] text-danger">{error}</p>}

      {list.length === 0 ? (
        <p className="text-center text-[15px] text-muted">Нет активных категорий — добавьте их в «Настройках».</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {list.map((c) => {
            const current = initial?.categoryKey === c.key
            return (
              <button
                key={c.key} type="button" aria-pressed={current} onClick={() => void save(c.key)}
                className={`flex min-h-[58px] flex-col items-start justify-center gap-1 rounded-[14px] border bg-surface px-2.5 py-2 text-left text-[14px] leading-tight ${
                  current ? 'border-accent ring-2 ring-accent' : 'border-line'
                }`}
              >
                <ImpDot importance={c.importance} />
                <span>{c.name}</span>
              </button>
            )
          })}
        </div>
      )}
      {kind === 'expense' && (
        <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-1 text-[12px] text-muted">
          {IMPORTANCES.map((i) => (
            <span key={i} className="flex items-center gap-1.5"><ImpDot importance={i} className="size-2" />{IMPORTANCE_LABELS[i]}</span>
          ))}
        </div>
      )}
      {initial && (
        <button
          type="button" onClick={() => void remove()}
          className="mt-2 min-h-[48px] rounded-[14px] border border-danger text-[16px] font-semibold text-danger"
        >
          Удалить операцию
        </button>
      )}
    </Sheet>
  )
}
```

- [ ] **Step 2: `src/ui/FinanceScreen.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getFinanceCategories, listTransactions } from '../db/diary'
import { monthOf, monthRange } from '../domain/dates'
import {
  IMPORTANCES, IMPORTANCE_LABELS, categoryOf, groupByDay, importanceShares, monthSummary,
} from '../domain/finance'
import { formatMoney } from '../domain/money'
import { dayGroupTitle, plural } from '../domain/ru'
import type { Meta, Transaction } from '../domain/types'
import { IMP_BG, ImpDot, MonthHeader, primeKeyboard } from './financeUi'
import { Card } from './MetricCards'
import TransactionSheet from './TransactionSheet'
import { useLogicalToday } from './useLogicalToday'

const TOP = 5
const box = 'flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4 shadow-card'

export default function FinanceScreen({ meta }: { meta: Meta }) {
  const today = useLogicalToday(meta.boundaryHour)
  const [month, setMonth] = useState(() => monthOf(today))
  const [sheet, setSheet] = useState<Transaction | 'new' | null>(null)
  const [allCats, setAllCats] = useState(false)
  const [from, to] = monthRange(month)
  const txs = useLiveQuery(() => listTransactions(from, to), [from, to])
  const cats = useLiveQuery(getFinanceCategories)
  if (!txs || !cats) return null

  const s = monthSummary(txs, cats, month)
  const shares = importanceShares(s.byImportance)
  const groups = groupByDay(txs, month)
  const maxCat = s.expenseByCategory[0]?.amount ?? 0
  const hidden = s.expenseByCategory.length - TOP
  const shownCats = allCats ? s.expenseByCategory : s.expenseByCategory.slice(0, TOP)

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-28">
      <MonthHeader overline="Финансы" month={month} onChange={setMonth} max={monthOf(today)} />

      <section className={box}>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Доход', formatMoney(s.income), ''],
            ['Траты', formatMoney(s.expense), ''],
            ['Отложено', formatMoney(s.saved), s.saved < 0 ? 'text-danger' : 'text-accent'],
          ].map(([label, value, tone]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-[13px] text-muted">{label}</span>
              <span className={`text-[18px] font-semibold tabular-nums ${tone}`}>{value}</span>
            </div>
          ))}
        </div>
      </section>

      {s.expense > 0 && (
        <Card title="Траты по важности">
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-md">
            {IMPORTANCES.filter((i) => s.byImportance[i] > 0).map((i) => (
              <div key={i} className={IMP_BG[i]} style={{ flex: s.byImportance[i] }} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {IMPORTANCES.map((i) => (
              <div key={i} className="flex items-center gap-2.5 text-[15px]">
                <ImpDot importance={i} />
                <span className="flex-1">{IMPORTANCE_LABELS[i]}</span>
                <span className="text-[13px] text-muted">{shares[i]} %</span>
                <span className="w-24 text-right font-semibold tabular-nums">{formatMoney(s.byImportance[i])}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {s.expenseByCategory.length > 0 && (
        <Card title="По категориям">
          {shownCats.map((c) => (
            <div key={c.key} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[15px]">
                <ImpDot importance={c.importance} />
                <span className="flex-1">{c.name}</span>
                <span className="font-semibold tabular-nums">{formatMoney(c.amount)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-line">
                <div
                  className={`h-1.5 rounded-full ${c.importance ? IMP_BG[c.importance] : 'bg-accent'}`}
                  style={{ width: `${maxCat ? Math.round((c.amount / maxCat) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
          {hidden > 0 && (
            <button type="button" onClick={() => setAllCats((v) => !v)} className="min-h-[44px] self-start text-[14px] font-semibold text-accent">
              {allCats ? 'Свернуть' : `Ещё ${hidden} ${plural(hidden, ['категория', 'категории', 'категорий'])}`}
            </button>
          )}
        </Card>
      )}

      {s.incomeByCategory.length > 0 && (
        <Card title="Доходы">
          {s.incomeByCategory.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-[15px]">
              <ImpDot />
              <span className="flex-1">{c.name}</span>
              <span className="font-semibold tabular-nums">{formatMoney(c.amount)}</span>
            </div>
          ))}
        </Card>
      )}

      {groups.length === 0 && (
        <p className="rounded-[20px] border border-dashed border-line p-5 text-center text-[15px] text-muted">
          В этом месяце операций нет. Нажмите «+», чтобы добавить первую.
        </p>
      )}
      {groups.map((g) => (
        <div key={g.day} className="flex flex-col gap-2">
          <div className="flex justify-between px-1 text-[13px] font-semibold text-muted">
            <span>{dayGroupTitle(g.day, today)}</span>
            <span>{g.expense > 0 ? formatMoney(g.expense) : ''}</span>
          </div>
          <section className="flex flex-col rounded-[20px] border border-line bg-surface px-4 py-1">
            {g.items.map((t) => {
              const c = categoryOf(t, cats)
              return (
                <button
                  key={t.id} type="button" onClick={() => setSheet(t)}
                  className="flex min-h-[56px] items-center gap-3 border-b border-line py-2 text-left text-[15px] last:border-b-0"
                >
                  <ImpDot importance={c.importance} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span>{c.name}</span>
                    {t.note && <span className="truncate text-[13px] text-muted">{t.note}</span>}
                  </span>
                  <span className={`font-semibold tabular-nums ${t.kind === 'income' ? 'text-accent' : ''}`}>
                    {t.kind === 'income' ? '+' : ''}{formatMoney(t.amount)}
                  </span>
                </button>
              )
            })}
          </section>
        </div>
      ))}

      <button
        type="button" aria-label="Добавить операцию"
        onClick={() => {
          primeKeyboard()
          setSheet('new')
        }}
        className="fixed right-5 bottom-[calc(max(8px,env(safe-area-inset-bottom))+84px)] z-10 flex size-[60px] items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_8px_20px_rgba(40,50,20,0.28)]"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>

      {sheet && (
        <TransactionSheet initial={sheet === 'new' ? null : sheet} today={today} onClose={() => setSheet(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Проверка**

Run: `npm test && npm run build`
Expected: PASS; build без ошибок. (Вкладка подключается в Task 5, проверка в браузере — там.)

- [ ] **Step 4: Commit**

```bash
git add src/ui
git commit -m "feat: Finance tab with month summary, importance bars, day list and quick entry sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Вкладка «Цели» и форма цели

**Files:**
- Create: `src/ui/GoalSheet.tsx`, `src/ui/GoalsScreen.tsx`

**Interfaces:**
- Consumes: Task 1 (`goalDetail`, `progressPercent`, `AGGREGATE_LABELS`, `TargetForm`, `targetFromForm`,
  `formFromTarget`, `monthRange`), Task 2; часть 1 — `listGoals`, `saveGoals`, `listDays`, `getMetrics`,
  `goalsOfMonth`, `goalProgress`, `createGoal`, `updateGoal`, `deleteGoal`, `moveGoal`, `allowedAggregates`,
  `AREAS`, `AREA_LABELS`, `GOAL_STATE_LABELS`, `formatGoalValue`, `activeCategories`, `activeMetrics`.
- Produces: `GoalSheet({ initial, month, goals, data, today, onClose })`, `GoalsScreen({ meta })` (default exports).

- [ ] **Step 1: `src/ui/GoalSheet.tsx`**

```tsx
import { useState } from 'react'
import { saveGoals } from '../db/diary'
import { IMPORTANCES, IMPORTANCE_LABELS, activeCategories } from '../domain/finance'
import {
  AGGREGATE_LABELS, AREAS, AREA_LABELS, GOAL_STATE_LABELS, allowedAggregates, createGoal, deleteGoal, formFromTarget,
  formatGoalValue, goalProgress, moveGoal, targetFromForm, updateGoal,
  type ProgressData, type TargetForm, type TargetMeasure,
} from '../domain/goals'
import { activeMetrics } from '../domain/metrics'
import type { Goal, GoalArea, GoalOp, GoalTarget } from '../domain/types'
import { errorText } from './errors'
import { Segmented, Sheet, now } from './financeUi'
import { Card } from './MetricCards'

const MEASURES: { value: TargetMeasure; label: string }[] = [
  { value: 'expense', label: 'Траты' },
  { value: 'income', label: 'Доход' },
  { value: 'saved', label: 'Отложено' },
  { value: 'metric', label: 'Привычка' },
]
const OPS: { value: GoalOp; label: string }[] = [
  { value: 'le', label: 'не больше' },
  { value: 'ge', label: 'не меньше' },
]
const field = 'min-h-[44px] rounded-[14px] border border-line bg-bg px-3 text-[16px] text-ink outline-none'

export default function GoalSheet({ initial, month, goals, data, today, onClose }: {
  initial: Goal | null
  month: string
  goals: Goal[]
  data: ProgressData
  today: string
  onClose: () => void
}) {
  const [text, setText] = useState(initial?.text ?? '')
  const [area, setArea] = useState<GoalArea>(initial?.area ?? 'finance')
  const [measured, setMeasured] = useState(Boolean(initial?.target))
  const [form, setForm] = useState<TargetForm>(() => formFromTarget(initial?.target))
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<TargetForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setError(null)
  }

  const metrics = activeMetrics(data.metricDefinitions).filter((d) => allowedAggregates(d.type).length > 0)
  const metricDef = data.metricDefinitions.find((d) => d.key === form.metricKey)
  const aggregates = metricDef ? allowedAggregates(metricDef.type) : []
  const cats = activeCategories(data.financeCategories, form.measure === 'income' ? 'income' : 'expense')
  const isFinance = form.measure !== 'metric'
  const suffix = isFinance ? '₽' : form.aggregate === 'count' ? 'дн.' : (metricDef?.unit ?? '')

  let draft: GoalTarget | null = null
  try {
    draft = measured ? targetFromForm(form) : null
  } catch {
    draft = null
  }
  const probe: Goal = { id: 'draft', month, text, area, order: 0, createdAt: '', updatedAt: '', deletedAt: null, ...(draft ? { target: draft } : {}) }
  const preview = draft ? goalProgress(probe, data, today) : null

  function pickMeasure(measure: TargetMeasure) {
    const first = metrics[0]
    set({
      measure, filter: '',
      ...(measure === 'metric' && !form.metricKey && first ? { metricKey: first.key, aggregate: allowedAggregates(first.type)[0] } : {}),
    })
  }

  function pickMetric(key: string) {
    const def = data.metricDefinitions.find((d) => d.key === key)
    if (def) set({ metricKey: key, aggregate: allowedAggregates(def.type)[0] })
  }

  async function save() {
    if (!text.trim()) {
      setError('Напишите цель')
      return
    }
    let target: GoalTarget | null = null
    if (measured) {
      try {
        target = targetFromForm(form)
      } catch (e) {
        setError(errorText(e))
        return
      }
    }
    try {
      const goal = initial
        ? updateGoal(initial, { text, area, target }, now())
        : createGoal({ month, text, area, ...(target ? { target } : {}) }, goals, now())
      await saveGoals([goal])
      onClose()
    } catch (e) {
      setError(`Не сохранилось: ${errorText(e)}`)
    }
  }

  async function run(action: () => Promise<void>) {
    try {
      await action()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const side = 'min-h-[44px] w-24 text-[16px] text-accent'
  return (
    <Sheet>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onClose} className={`${side} text-left`}>Отмена</button>
        <h2 className="font-serif text-[20px] font-semibold">{initial ? 'Цель' : 'Новая цель'}</h2>
        <button type="button" onClick={() => void save()} className={`${side} text-right font-semibold`}>Сохранить</button>
      </div>

      <Card title="Цель — своими словами">
        <textarea
          rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Цель"
          placeholder="Например, «Тратить на кафе не больше 6 000 ₽»"
          className="resize-none bg-transparent text-[17px] leading-[1.35] text-ink outline-none placeholder:text-muted"
        />
      </Card>

      <Card title="Сфера">
        <div className="flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <button
              key={a} type="button" aria-pressed={a === area} onClick={() => setArea(a)}
              className={`min-h-[40px] rounded-full border px-3.5 text-[14px] ${
                a === area ? 'border-accent bg-accent font-semibold text-accent-ink' : 'border-line bg-bg text-ink'
              }`}
            >
              {AREA_LABELS[a]}
            </button>
          ))}
        </div>
      </Card>

      <Card
        title="Измерять"
        aside={
          <button
            type="button" role="switch" aria-checked={measured} aria-label="Измерять" onClick={() => setMeasured((v) => !v)}
            className={`flex h-8 w-[52px] rounded-full p-0.5 ${measured ? 'justify-end bg-accent' : 'justify-start bg-line'}`}
          >
            <span className="size-7 rounded-full bg-white shadow" />
          </button>
        }
      >
        {!measured ? (
          <p className="text-[14px] text-muted">Без измерения цель сверит Claude по записям дней в конце месяца.</p>
        ) : (
          <>
            <Segmented label="Что измерять" options={MEASURES} value={form.measure} onChange={pickMeasure} />
            {(form.measure === 'expense' || form.measure === 'income') && (
              <label className="flex items-center justify-between gap-3">
                <span className="text-[15px] text-muted">Что считать</span>
                <select value={form.filter} onChange={(e) => set({ filter: e.target.value })} className={`${field} max-w-[60%]`}>
                  <option value="">{form.measure === 'income' ? 'Весь доход' : 'Все траты'}</option>
                  {form.measure === 'expense' && (
                    <optgroup label="Важность">
                      {IMPORTANCES.map((i) => <option key={i} value={`imp:${i}`}>{IMPORTANCE_LABELS[i]}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Категория">
                    {cats.map((c) => <option key={c.key} value={`cat:${c.key}`}>{c.name}</option>)}
                  </optgroup>
                </select>
              </label>
            )}
            {form.measure === 'saved' && <p className="text-[14px] text-muted">Доход месяца минус траты месяца.</p>}
            {form.measure === 'metric' && (metrics.length === 0 ? (
              <p className="text-[14px] text-muted">Нет подходящих метрик — добавьте привычку «да / нет» или число в «Настройках».</p>
            ) : (
              <>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[15px] text-muted">Привычка</span>
                  <select value={form.metricKey} onChange={(e) => pickMetric(e.target.value)} className={`${field} max-w-[60%]`}>
                    {metrics.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
                  </select>
                </label>
                {aggregates.length > 1 ? (
                  <Segmented
                    label="Как считать" value={form.aggregate} onChange={(aggregate) => set({ aggregate })}
                    options={aggregates.map((a) => ({ value: a, label: AGGREGATE_LABELS[a] }))}
                  />
                ) : (
                  <p className="text-[14px] text-muted">Считаем: {AGGREGATE_LABELS[form.aggregate]}</p>
                )}
              </>
            ))}
            <div className="flex items-center gap-2">
              <Segmented label="Условие" options={OPS} value={form.op} onChange={(op) => set({ op })} className="w-52 shrink-0" />
              <label className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="sr-only">Порог</span>
                <input
                  inputMode="decimal" value={form.value} placeholder="0" onChange={(e) => set({ value: e.target.value })}
                  className={`${field} min-w-0 flex-1 text-right font-semibold`}
                />
                <span className="text-[15px] text-muted">{suffix}</span>
              </label>
            </div>
            {draft && preview && (
              <p className="text-[13px] text-muted">
                Сейчас: {formatGoalValue(draft, preview.value, data.metricDefinitions)} — {GOAL_STATE_LABELS[preview.state]}
              </p>
            )}
          </>
        )}
      </Card>

      {error && <p role="alert" className="text-center text-[14px] text-danger">{error}</p>}

      {initial && (
        <div className="flex gap-2">
          {([[-1, 'Выше'], [1, 'Ниже']] as const).map(([dir, label]) => (
            <button
              key={label} type="button"
              onClick={() => void run(() => saveGoals(moveGoal(goals, initial.id, dir, now())))}
              className="min-h-[44px] flex-1 rounded-[14px] border border-line bg-surface text-[15px] text-ink"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {initial && (
        <button
          type="button"
          onClick={() => window.confirm('Удалить цель?') && void run(async () => {
            await saveGoals([deleteGoal(initial, now())])
            onClose()
          })}
          className="min-h-[48px] rounded-[14px] border border-danger text-[16px] font-semibold text-danger"
        >
          Удалить цель
        </button>
      )}
    </Sheet>
  )
}
```

- [ ] **Step 2: `src/ui/GoalsScreen.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getFinanceCategories, getMetrics, listDays, listGoals, listTransactions } from '../db/diary'
import { monthOf, monthRange } from '../domain/dates'
import {
  AREA_LABELS, GOAL_STATE_LABELS, goalDetail, goalProgress, goalsOfMonth, progressPercent,
  type GoalState, type ProgressData,
} from '../domain/goals'
import type { Goal, Meta } from '../domain/types'
import { MonthHeader } from './financeUi'
import GoalSheet from './GoalSheet'
import { useLogicalToday } from './useLogicalToday'

const CHIP: Record<GoalState | 'claude', string> = {
  within: 'bg-accent/15 text-ink',
  done: 'bg-accent text-accent-ink',
  progress: 'bg-line text-ink',
  over: 'bg-imp-optional/25 text-ink',
  missed: 'bg-danger/15 text-danger',
  claude: 'border border-dashed border-muted/60 text-muted',
}
const BAR: Record<GoalState, string> = {
  within: 'bg-imp-useful',
  progress: 'bg-imp-useful',
  done: 'bg-accent',
  over: 'bg-imp-optional',
  missed: 'bg-imp-optional',
}

export default function GoalsScreen({ meta }: { meta: Meta }) {
  const today = useLogicalToday(meta.boundaryHour)
  const [month, setMonth] = useState(() => monthOf(today))
  const [sheet, setSheet] = useState<Goal | 'new' | null>(null)
  const [from, to] = monthRange(month)
  const goals = useLiveQuery(() => listGoals(month), [month])
  const transactions = useLiveQuery(() => listTransactions(from, to), [from, to])
  const days = useLiveQuery(() => listDays(from, to), [from, to])
  const financeCategories = useLiveQuery(getFinanceCategories)
  const metricDefinitions = useLiveQuery(getMetrics)
  if (!goals || !transactions || !days || !financeCategories || !metricDefinitions) return null

  const data: ProgressData = { transactions, financeCategories, days, metricDefinitions }
  const list = goalsOfMonth(goals, month)

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-6">
      <MonthHeader overline="Цели" month={month} onChange={setMonth} />
      {list.length === 0 && (
        <p className="rounded-[20px] border border-dashed border-line p-5 text-center text-[15px] leading-[1.45] text-muted">
          Целей на этот месяц нет. Запишите 2–4 цели своими словами — в конце месяца Claude сверит их с записями.
        </p>
      )}
      {list.map((g) => {
        const p = goalProgress(g, data, today)
        return (
          <button
            key={g.id} type="button" onClick={() => setSheet(g)}
            className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface px-4 py-3.5 text-left shadow-card"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">{AREA_LABELS[g.area]}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${CHIP[p ? p.state : 'claude']}`}>
                {p ? GOAL_STATE_LABELS[p.state] : 'сверит Claude'}
              </span>
            </span>
            <span className="text-[16px] leading-snug font-semibold">{g.text}</span>
            {p && (
              <span className="block h-2 w-full overflow-hidden rounded bg-line">
                <span className={`block h-full rounded ${BAR[p.state]}`} style={{ width: `${progressPercent(p)}%` }} />
              </span>
            )}
            <span className="text-[13px] text-muted">{goalDetail(g, p, metricDefinitions)}</span>
          </button>
        )
      })}
      <button
        type="button" onClick={() => setSheet('new')}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-muted/60 text-[16px] font-semibold text-accent"
      >
        + Добавить цель
      </button>
      {sheet && (
        <GoalSheet
          initial={sheet === 'new' ? null : sheet} month={month} goals={goals} data={data} today={today}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Проверка**

Run: `npm test && npm run build`
Expected: PASS; build без ошибок.

- [ ] **Step 4: Commit**

```bash
git add src/ui
git commit -m "feat: Goals tab with progress cards and goal form with optional target

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Пять вкладок и строка трат в «Итоге»

**Files:**
- Modify: `src/ui/TabBar.tsx`, `src/App.tsx`, `src/ui/SummaryScreen.tsx`

**Interfaces:**
- Consumes: `FinanceScreen`, `GoalsScreen` (Task 3, 4); `listTransactions`, `dayTotals` (`expenseCount`, Task 1), `formatMoney`.
- Produces: `Tab = 'summary' | 'finance' | 'goals' | 'calendar' | 'settings'`; `SummaryScreen({ meta, onOpenFinance })`.

- [ ] **Step 1: `src/ui/TabBar.tsx`**

```ts
export type Tab = 'summary' | 'finance' | 'goals' | 'calendar' | 'settings'
```

`TABS` — пять вкладок по порядку (иконки «Финансы» и «Цели» — из макета):

```tsx
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'summary', label: 'Итог', icon: icon(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>) },
  { id: 'finance', label: 'Финансы', icon: icon(<><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18M16 15h2" /></>) },
  { id: 'goals', label: 'Цели', icon: icon(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></>) },
  { id: 'calendar', label: 'Календарь', icon: icon(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>) },
  { id: 'settings', label: 'Настройки', icon: icon(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>) },
]
```

В `<nav>`: `grid-cols-3` → `grid-cols-5`, `px-3` → `px-1.5`.

- [ ] **Step 2: `src/App.tsx`** — импорты `FinanceScreen`, `GoalsScreen`; в `<main>`:

```tsx
        {tab === 'summary' && <SummaryScreen meta={meta} onOpenFinance={() => setTab('finance')} />}
        {tab === 'finance' && <FinanceScreen meta={meta} />}
        {tab === 'goals' && <GoalsScreen meta={meta} />}
        {tab === 'calendar' && <CalendarScreen meta={meta} />}
        {tab === 'settings' && <SettingsScreen meta={meta} />}
```

- [ ] **Step 3: `src/ui/SummaryScreen.tsx`** — импорты `listTransactions` (из `'../db/diary'`), `dayTotals`
(`'../domain/finance'`), `formatMoney` (`'../domain/money'`); компонент после `StreakChip`:

```tsx
/** Траты сегодня — для вечерней сверки с банком; доход не показываем: он месячный. */
function TodayExpenses({ today, onOpen }: { today: string; onOpen: () => void }) {
  const txs = useLiveQuery(() => listTransactions(today, today), [today])
  if (!txs) return null
  const t = dayTotals(txs, today)
  return (
    <button
      type="button" onClick={onOpen}
      className="flex min-h-[56px] items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-2.5 text-left shadow-card"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18M16 15h2" />
        </svg>
      </span>
      <span className="flex-1 text-[15px] font-semibold">
        {t.expenseCount > 0 ? (
          <>Сегодня: траты {formatMoney(t.expense)} <span className="font-medium text-muted">({t.expenseCount})</span></>
        ) : (
          'Сегодня трат нет'
        )}
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" className="text-muted" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
    </button>
  )
}
```

Сигнатура экрана — `export default function SummaryScreen({ meta, onOpenFinance }: { meta: Meta; onOpenFinance: () => void })`;
перед `<DayForm …>`: `<TodayExpenses today={today} onOpen={onOpenFinance} />`.

- [ ] **Step 4: Проверка в браузере** (навык `run` или вручную)

Run: `npm test && npm run build`, затем `npm run dev`, открыть http://localhost:5173/diary-app/ в окне 414×896
(DevTools → iPhone 11), светлая и тёмная схема:
- пять вкладок, активная — акцентом; «Итог» — строка «Сегодня трат нет» под датой;
- «Финансы»: «+» → лист, поле суммы в фокусе → `350` → «Кафе и доставка» → лист закрылся, «Сегодня, …» с операцией,
  «Траты по важности» 100 % «Можно без этого», «По категориям» — одна строка;
- `0`, `12,345`, `1 250 ₽` → ошибка под суммой, ничего не сохранено;
- «Доход» → `80000` → «Зарплата»: доход и «Отложено» в карточке, операция «+80 000 ₽» акцентом, в «Итоге» доход не виден;
- тап по операции → «Сохранить» с новой суммой без смены категории; смена дня на вчера; «Удалить операцию»;
- комментарий из двух строк (вставить с переносом) сохраняется одной строкой;
- шесть категорий трат → «Ещё 1 категория» / «Свернуть»; прошлый месяц — «операций нет», стрелка «вперёд» на
  текущем месяце неактивна;
- «Итог»: «Сегодня: траты 350 ₽ (1)» → тап открывает «Финансы»;
- «Цели»: «Целей нет»; добавить цель без измерения → метка «сверит Claude»; «Кафе не больше 6 000» → «в рамках»,
  «350 из 6 000 ₽ · можно ещё 5 650 ₽»; «Привычка» без подходящих метрик — подсказка; добавить метрику «Спорт» (да/нет)
  в «Настройках» → цель «не меньше 12» → «в процессе»; «Выше/Ниже», «Удалить цель»; следующий месяц — пусто, можно добавить;
- «Настройки» → граница дня 23:00 (если сейчас позже 23:00 — иначе выбрать час больше текущего) → «Итог» и новая
  операция относятся ко вчерашнему дню; вернуть 06:00.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: five-tab navigation and today's expenses line on Summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: «Настройки» → «Категории»

**Files:**
- Create: `src/ui/CategoriesSettings.tsx`
- Modify: `src/ui/SettingsScreen.tsx`

**Interfaces:**
- Consumes: `getFinanceCategories`, `saveFinanceCategories`, `activeCategories`, `sortCategories`, `createCategory`,
  `updateCategory`, `moveCategory`, `setCategoryArchived`, `nextImportance` (Task 1), `IMPORTANCES`,
  `IMPORTANCE_LABELS`; `IconButton` (Task 2), `ImpDot`, `Segmented`, `now`.
- Produces: `CategoriesSettings()` (default export).

- [ ] **Step 1: `src/ui/CategoriesSettings.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getFinanceCategories, saveFinanceCategories } from '../db/diary'
import {
  IMPORTANCES, IMPORTANCE_LABELS, activeCategories, createCategory, moveCategory, nextImportance, setCategoryArchived,
  sortCategories, updateCategory,
} from '../domain/finance'
import type { FinanceCategory, FinanceKind, Importance } from '../domain/types'
import { errorText } from './errors'
import { ImpDot, Segmented, now } from './financeUi'
import { Card } from './MetricCards'
import { IconButton } from './MetricsSettings'

const KINDS: { value: FinanceKind; label: string }[] = [
  { value: 'expense', label: 'Траты' },
  { value: 'income', label: 'Доходы' },
]
const field = 'min-h-[44px] rounded-[14px] border border-line bg-bg px-3.5 text-[16px] text-ink outline-none'

export default function CategoriesSettings() {
  const all = useLiveQuery(getFinanceCategories)
  const [kind, setKind] = useState<FinanceKind>('expense')
  const [name, setName] = useState('')
  const [importance, setImportance] = useState<Importance>('useful')
  const [error, setError] = useState<string | null>(null)
  if (!all) return null

  const active = activeCategories(all, kind)
  const archived = sortCategories(all).filter((c) => c.kind === kind && c.archived)
  const save = (changed: FinanceCategory[]) => {
    if (!changed.length) return
    saveFinanceCategories(changed).then(() => setError(null), (e) => setError(`Не сохранилось: ${errorText(e)}`))
  }
  const add = () => {
    try {
      save([createCategory({ kind, name, importance }, all, now())])
      setName('')
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <Card title="Категории">
      <Segmented label="Вид категорий" options={KINDS} value={kind} onChange={setKind} />
      {kind === 'expense' && (
        <p className="text-[13px] leading-[1.4] text-muted">
          Тап по важности меняет уровень. Категорию нельзя удалить — только убрать в архив, история остаётся.
        </p>
      )}
      <ul className="flex flex-col">
        {active.map((c, i) => (
          <li key={c.key} className="flex items-center gap-1 border-b border-line py-1 last:border-b-0">
            <input
              key={c.name} defaultValue={c.name} aria-label="Название категории"
              onBlur={(e) => {
                const renamed = updateCategory(c, { name: e.target.value }, now())
                if (renamed) save([renamed])
                else e.target.value = c.name
              }}
              className="min-h-[40px] min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none"
            />
            {c.importance && (
              <button
                type="button" aria-label={`Важность: ${IMPORTANCE_LABELS[c.importance]}. Сменить`}
                onClick={() => {
                  const changed = updateCategory(c, { importance: nextImportance(c.importance!) }, now())
                  if (changed) save([changed])
                }}
                className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 text-[12px] whitespace-nowrap text-ink"
              >
                <ImpDot importance={c.importance} className="size-2" />{IMPORTANCE_LABELS[c.importance]}
              </button>
            )}
            <IconButton label="Выше" disabled={i === 0} onClick={() => save(moveCategory(all, c.key, -1, now()))}>
              <path d="M12 19V5M6 11l6-6 6 6" />
            </IconButton>
            <IconButton label="В архив" onClick={() => save([setCategoryArchived(c, true, all, now())])}>
              <rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" />
            </IconButton>
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <span className="text-[13px] font-semibold text-muted">В архиве — не видны при вводе, суммы в итогах остаются</span>
          {archived.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2">
              <span className="text-[16px] text-muted">{c.name}</span>
              <button
                type="button" onClick={() => save([setCategoryArchived(c, false, all, now())])}
                className="min-h-[44px] px-2 text-[15px] font-semibold text-accent"
              >
                Вернуть
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <input
          value={name} onChange={(e) => setName(e.target.value)} className={field}
          placeholder={kind === 'expense' ? 'Новая категория, например «Книги»' : 'Новый источник, например «Кешбэк»'}
        />
        {kind === 'expense' && (
          <select value={importance} onChange={(e) => setImportance(e.target.value as Importance)} aria-label="Важность" className={field}>
            {IMPORTANCES.map((i) => <option key={i} value={i}>{IMPORTANCE_LABELS[i]}</option>)}
          </select>
        )}
        <button
          type="button" disabled={!name.trim()} onClick={add}
          className="min-h-[48px] rounded-[14px] bg-accent text-[17px] font-semibold text-accent-ink disabled:opacity-40"
        >
          Добавить
        </button>
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </Card>
  )
}
```

- [ ] **Step 2: `src/ui/SettingsScreen.tsx`** — импорт `CategoriesSettings`; сразу после `<MetricsSettings />`:
`<CategoriesSettings />`.

- [ ] **Step 3: Проверка в браузере** (414×896)

Run: `npm test && npm run build`, `npm run dev`:
- «Настройки» → «Категории»: 11 трат с метками важности; тап по метке «Кафе и доставка» → «Необходимо» → в
  «Финансах» точка и полоса этой категории стали тёмной оливой, «Траты по важности» пересчитались;
- «Выше», переименование (сохраняется по уходу из поля), «В архив» → категории нет в сетке ввода, сумма в
  «Финансах» осталась; «Вернуть»;
- «Доходы» → 4 источника без меток важности; добавить «Кешбэк» → появился в сетке ввода дохода.

- [ ] **Step 4: Commit**

```bash
git add src/ui
git commit -m "feat: finance categories management in Settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Версия 1.2.0, проверка на iPhone, публикация

**Files:**
- Modify: `package.json` (`"version": "1.2.0"`), `CLAUDE.md`
- Create: `docs/phase2-results.md`

- [ ] **Step 1: Версия** — `package.json`: `"version": "1.2.0"`.

- [ ] **Step 2: `CLAUDE.md`**
  - «Экраны MVP» → «Экраны»: «Нижняя панель: **Итог** (… + строка трат за сегодня) · **Финансы** (месяц: доход,
    траты, отложено, траты по важности и категориям, операции по дням, быстрый ввод «+») · **Цели** (цели месяца,
    прогресс измеримых) · **Календарь** · **Настройки** (метрики, категории, граница дня, экспорт/импорт).»
  - «Текущее состояние»: строку про часть 1 заменить на
    `- [ДД.ММ.2026] Фаза 2: финансы и цели — версия 1.2.0 (спецификация docs/superpowers/specs/2026-10-14-finance-goals-design.md,
    планы …-finance-goals-data.md и …-finance-goals-screens.md), проверка на iPhone — docs/phase2-results.md.
    Дальше — процедура ежемесячного разбора в сессии LIFE (читает backup.json).`

- [ ] **Step 3: `docs/phase2-results.md`**

```markdown
# Фаза 2 — проверка финансов и целей на iPhone

Модель iPhone: iPhone 11  ·  Версия iOS: 26.7.1  ·  Дата: __.__.2026  ·  Проверена версия 1.2.0

Новая версия применяется не сразу: закройте приложение из переключателя и откройте **два раза**; в «Настройках»
внизу должно быть «Дневник 1.2.0».

| # | Проверка | Как делать | Результат |
|---|---|---|---|
| 1 | Обновление без потерь | Открыть дважды: версия 1.2.0, пять вкладок; старые дни в «Календаре» и метрики на месте | |
| 2 | Быстрый ввод | «Финансы» → «+» → **клавиатура открылась сама** → сумма → категория → операция в «Сегодня». Засечь время | |
| 3 | Ошибка суммы | Ввести `0` → категория → ошибка, ничего не сохранено | |
| 4 | Доход | «+» → «Доход» → сумма → «Зарплата» → «Доход» и «Отложено» в карточке | |
| 5 | Правка и удаление | Тап по операции → новая сумма → «Сохранить»; сменить день; «Удалить операцию» | |
| 6 | Итог | Строка «Сегодня: траты … (N)» под датой; тап открывает «Финансы»; дохода в строке нет | |
| 7 | Важность | «Настройки» → «Категории» → тап по метке → цвета и доли в «Финансах» пересчитались | |
| 8 | Цели | Цель без измерения («сверит Claude»), «Кафе не больше …» (прогресс), привычка «не меньше N дней» | |
| 9 | Экспорт | Экспорт в zip → на ПК: в `entries_….md` строки «Траты: …», раздел «# Цели — …»; в `backup.json` `"formatVersion": 2` | |
| 10 | Авиарежим | Включить авиарежим → ввод траты и цели работают | |
| 11 | Тёмная тема | Точки важности и полосы читаются, кнопка «+» видна | |
```

- [ ] **Step 4: Итоговая проверка**

Run: `npm test && npm run build`
Expected: все тесты PASS, сборка без ошибок.

- [ ] **Step 5: Commit**

```bash
git add package.json CLAUDE.md docs/phase2-results.md
git commit -m "chore: release 1.2.0 with Phase 2 iPhone checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Публикация — только после подтверждения**

Спросить пользователя: «Всё готово. Слить ветку в `main` и отправить на GitHub? Это обновит приложение на iPhone».
После «да»:

```bash
git switch main
git merge --ff-only phase2-finance-goals
npm test && npm run build
git push
git branch -d phase2-finance-goals
```

Expected: GitHub Actions публикует сайт; на iPhone после двух перезапусков — «Дневник 1.2.0». Пользователь проходит
`docs/phase2-results.md`; результаты вносятся в таблицу отдельным коммитом `docs: record Phase 2 iPhone results` и push.
