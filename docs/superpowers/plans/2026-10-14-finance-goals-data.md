# Финансы и цели, часть 1 — данные и логика. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** добавить в дневник финансы (доходы и траты по категориям с важностью) и цели на месяц с измерением —
схему `diary` v2, чистую логику, экспорт и импорт `formatVersion: 2` — без экранов.

**Architecture:** новые чистые модули `src/domain/money.ts`, `finance.ts`, `goals.ts` с тестами рядом; Dexie
`version(2)` добавляет таблицы `financeCategories`, `transactions`, `goals`; `src/db/diary.ts` получает функции
доступа; `DiarySnapshot`, `backup.json` и Markdown экспорта расширяются. UI не меняется (часть 2 — после макетов).

**Tech Stack:** TypeScript, Dexie 4, fflate, Vitest + `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-10-14-finance-goals-design.md` (дополняет
`docs/superpowers/specs/2026-10-06-diary-mvp-design.md`).

## Global Constraints
- Работа в ветке `phase2-finance-goals`. **Push в `main` запрещён** (push = деплой на телефон); публикация — после
  части 2, версией 1.2.0.
- Схема меняется только добавлением `db.version(2)`; `db.version(1)` не редактировать.
- Доступ к IndexedDB — только из `src/db/`; логика — в `src/domain/` без DOM.
- Все суммы — **целые копейки**, валюта одна (₽). Предел операции — 100 000 000 ₽ (`MAX_AMOUNT = 10_000_000_000`).
- Важность: `need` «Необходимо», `useful` «Полезно», `optional` «Можно без этого» — только у категорий трат.
- Сферы целей: `finance` Финансы, `work` Работа, `study` Учёба, `health` Здоровье, `relations` Отношения, `other` Другое.
- Метки времени — ISO 8601 со смещением (`isoWithOffset`); сравнение — только `isLater` / `Date.parse`.
- У операций и целей: `id` (UUID), `createdAt`, `updatedAt`, `deletedAt` (мягкое удаление); у категорий —
  `createdAt`, `updatedAt`, `archived` (удаления нет).
- Стартовые категории засеваются с меткой `SEED_TIME` (как метрики), чтобы бэкап побеждал засев.
- Экспорт: `formatVersion: 2`; файлы `formatVersion` 1 импортируются; > 2 — отказ с понятным сообщением.
- Имена файлов в zip — латиницей; тексты — на русском.
- Коммиты на английском, последняя строка — `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Операция, чья категория заархивирована или отсутствует** (удалена из бэкапа, импорт без неё). Ожидание: сумма
   остаётся в итогах месяца, имя — ключ, важность — «Полезно». Тесты в Task 2 (`monthSummary`).
2. **Неоднозначный ввод суммы** («12,345», «1e3», «−5», «1 250 ₽», «0,00»). Ожидание: понятная ошибка, а не
   тихая неверная сумма. Тесты в Task 1.
3. **Телефон с базой v1 и записями открывает новую версию.** Ожидание: дни и метрики на месте, категории засеяны,
   `schemaVersion` = 2. Тест апгрейда в Task 4.
4. **Удалённые операции и цели.** Ожидание: не входят в итоги, прогресс и Markdown, но остаются в `backup.json`
   (иначе удаление не переносится импортом). Тесты в Task 2, 3, 5, 6.
5. **День только с тратами (без текста и метрик) или день, где после экспорта изменилась только трата.** Ожидание:
   попадает в Markdown. Тест в Task 6.

---

### Task 0: Ветка

- [ ] **Step 1: Создать ветку от чистого `main`**

```bash
git status --short   # пусто
git switch -c phase2-finance-goals
```

---

### Task 1: Типы, деньги, месяц

**Files:**
- Modify: `src/domain/types.ts` (добавить в конец)
- Create: `src/domain/money.ts`, `src/domain/money.test.ts`
- Modify: `src/domain/dates.ts`, `src/domain/dates.test.ts`, `src/domain/ru.ts`, `src/domain/ru.test.ts`

**Interfaces:**
- Produces: типы `FinanceKind`, `Importance`, `FinanceCategory`, `Transaction`, `GoalArea`, `GoalOp`,
  `GoalAggregate`, `GoalTarget`, `Goal`; `MAX_AMOUNT`, `parseAmount(input: string): number`,
  `formatAmount(kopecks: number): string`, `formatMoney(kopecks: number): string`; `monthOf(day: string): string`;
  `monthName(month: string): string`.

- [ ] **Step 1: Добавить типы в конец `src/domain/types.ts`** (`DiarySnapshot` пока не трогать — Task 5)

```ts
export type FinanceKind = 'expense' | 'income'
/** Важность категории трат: необходимо / полезно / можно без этого. */
export type Importance = 'need' | 'useful' | 'optional'

export interface FinanceCategory {
  key: string
  kind: FinanceKind
  name: string
  /** Только у категорий трат. */
  importance?: Importance
  order: number
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  /** Логический день ГГГГ-ММ-ДД. */
  day: string
  /** Совпадает с kind категории. */
  kind: FinanceKind
  /** Целые копейки, > 0. */
  amount: number
  categoryKey: string
  note?: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type GoalArea = 'finance' | 'work' | 'study' | 'health' | 'relations' | 'other'
export type GoalOp = 'le' | 'ge'
export type GoalAggregate = 'count' | 'sum' | 'avg'

export type GoalTarget =
  | {
      kind: 'finance'
      measure: 'expense' | 'income' | 'saved'
      /** categoryKey — для expense и income; importance — только для expense; у saved фильтра нет. */
      filter?: { categoryKey: string } | { importance: Importance }
      op: GoalOp
      /** Копейки. */
      value: number
    }
  | { kind: 'metric'; metricKey: string; aggregate: GoalAggregate; op: GoalOp; value: number }

export interface Goal {
  id: string
  /** ГГГГ-ММ */
  month: string
  text: string
  area: GoalArea
  target?: GoalTarget
  order: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
```

- [ ] **Step 2: Написать падающие тесты `src/domain/money.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { MAX_AMOUNT, formatAmount, formatMoney, parseAmount } from './money'

describe('parseAmount', () => {
  it.each<[string, number]>([
    ['450', 45000],
    ['1 250,50', 125050],
    ['1250.5', 125050],
    [' 99,9 ', 9990],
    ['1 000', 100000],
    ['0,01', 1],
    ['100000000', MAX_AMOUNT],
  ])('«%s» → %i копеек', (input, kopecks) => {
    expect(parseAmount(input)).toBe(kopecks)
  })
  it.each(['', 'abc', '-5', '12,345', '1e3', '1,2,3', '1 250 ₽'])('«%s» — не сумма', (input) => {
    expect(() => parseAmount(input)).toThrow('Введите сумму, например 1 250 или 99,90')
  })
  it.each(['0', '0,00'])('«%s» — ноль отклоняется', (input) => {
    expect(() => parseAmount(input)).toThrow('Сумма должна быть больше нуля')
  })
  it('больше 100 000 000 ₽ отклоняется', () => {
    expect(() => parseAmount('100000000,01')).toThrow('Слишком большая сумма')
  })
})

describe('formatMoney', () => {
  it.each<[number, string]>([
    [125050, '1 250,50 ₽'],
    [125000, '1 250 ₽'],
    [5, '0,05 ₽'],
    [100000000, '1 000 000 ₽'],
    [-125000, '−1 250 ₽'],
    [0, '0 ₽'],
  ])('%i → «%s»', (kopecks, text) => {
    expect(formatMoney(kopecks)).toBe(text)
  })
  it('formatAmount — без знака рубля', () => {
    expect(formatAmount(80000)).toBe('800')
  })
})
```

Добавить в `src/domain/dates.test.ts` (импорт `monthOf` из `./dates`):

```ts
describe('monthOf', () => {
  it('месяц дня', () => {
    expect(monthOf('2026-11-05')).toBe('2026-11')
  })
})
```

Добавить в `src/domain/ru.test.ts` (импорт `monthName` из `./ru`):

```ts
describe('monthName', () => {
  it('месяц строчными с годом', () => {
    expect(monthName('2026-11')).toBe('ноябрь 2026')
    expect(monthName('2027-01')).toBe('январь 2027')
  })
})
```

- [ ] **Step 3: Запустить — падают**

Run: `npx vitest run src/domain/money.test.ts src/domain/dates.test.ts src/domain/ru.test.ts`
Expected: FAIL — нет модуля `./money`, нет экспортов `monthOf`, `monthName`.

- [ ] **Step 4: Реализовать**

`src/domain/money.ts`:

```ts
/** Предел одной операции: 100 000 000 ₽ в копейках. */
export const MAX_AMOUNT = 10_000_000_000

const AMOUNT_RE = /^(\d+)(?:[.,](\d{1,2}))?$/

/** «1 250,50» → 125050 копеек. Пробелы игнорируются, запятая и точка — десятичный разделитель. */
export function parseAmount(input: string): number {
  const m = AMOUNT_RE.exec(input.replace(/[\s  ]/g, ''))
  if (!m) throw new Error('Введите сумму, например 1 250 или 99,90')
  const amount = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  if (amount <= 0) throw new Error('Сумма должна быть больше нуля')
  if (amount > MAX_AMOUNT) throw new Error('Слишком большая сумма')
  return amount
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** 125050 → «1 250,50», 125000 → «1 250», −5000 → «−50». */
export function formatAmount(kopecks: number): string {
  const sign = kopecks < 0 ? '−' : ''
  const abs = Math.abs(kopecks)
  const kop = abs % 100
  return `${sign}${group(Math.floor(abs / 100))}${kop ? `,${String(kop).padStart(2, '0')}` : ''}`
}

export const formatMoney = (kopecks: number) => `${formatAmount(kopecks)} ₽`
```

В `src/domain/dates.ts` добавить:

```ts
/** Месяц дня: 2026-11-05 → 2026-11. */
export const monthOf = (day: string) => day.slice(0, 7)
```

В `src/domain/ru.ts` добавить:

```ts
/** 2026-11 → «ноябрь 2026». */
export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return monthTitle(y, m - 1).toLowerCase()
}
```

- [ ] **Step 5: Запустить — проходят; весь набор зелёный**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain
git commit -m "feat: finance and goal types, money parsing and formatting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Категории, операции, итоги месяца

**Files:**
- Create: `src/domain/finance.ts`, `src/domain/finance.test.ts`
- Modify: `src/domain/testFixtures.ts`

**Interfaces:**
- Consumes: типы Task 1; `MAX_AMOUNT` (`./money`); `monthOf`, `addDays` (`./dates`); `SEED_TIME` (`./metrics`).
- Produces:
  - `IMPORTANCE_LABELS: Record<Importance, string>`, `IMPORTANCES: Importance[]`, `DEFAULT_CATEGORIES: FinanceCategory[]`
  - `sortCategories(cats)`, `activeCategories(cats, kind)`
  - `createCategory(input: { kind; name; importance? }, existing, now): FinanceCategory`
  - `updateCategory(cat, patch: { name?; importance? }, now): FinanceCategory | null`
  - `moveCategory(cats, key, dir: -1 | 1, now): FinanceCategory[]`
  - `setCategoryArchived(cat, archived, cats, now): FinanceCategory`
  - `createTransaction(input: TransactionInput, now): Transaction`,
    `updateTransaction(tx, patch: TransactionPatch, now)`, `deleteTransaction(tx, now)`
  - `liveTransactions(txs)`, `categoryOf(tx, cats)`, `totalsByCategory(txs, cats): CategoryTotal[]`
  - `monthSummary(txs, cats, month): MonthSummary`, `dayTotals(txs, day)`, `categoriesByUse(txs, cats, kind, today)`
  - фикстура `txRec(day, patch?)` в `testFixtures.ts`

- [ ] **Step 1: Фикстура в `src/domain/testFixtures.ts`**

```ts
import type { DayRecord, Transaction } from './types'

let seq = 0

/** Трата 100 ₽ «Продукты»; id уникален в пределах прогона. */
export function txRec(day: string, patch: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${++seq}`, day, kind: 'expense', amount: 10000, categoryKey: 'groceries',
    createdAt: T0, updatedAt: T0, deletedAt: null, ...patch,
  }
}
```

(импорт `DayRecord` уже есть — объединить в одну строку `import type { DayRecord, Transaction } from './types'`.)

- [ ] **Step 2: Написать падающие тесты `src/domain/finance.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CATEGORIES, activeCategories, categoriesByUse, createCategory, createTransaction, dayTotals,
  deleteTransaction, monthSummary, moveCategory, setCategoryArchived, updateCategory, updateTransaction,
} from './finance'
import { SEED_TIME } from './metrics'
import { T0, txRec } from './testFixtures'

const NOW = '2026-11-02T21:00:00.000+03:00'
const cats = DEFAULT_CATEGORIES

describe('стартовые категории', () => {
  it('11 трат с важностью и 4 дохода без неё, метка засева, ключи уникальны', () => {
    const expense = activeCategories(cats, 'expense')
    const income = activeCategories(cats, 'income')
    expect(expense.map((c) => c.name)).toEqual([
      'Продукты', 'Жильё и связь', 'Транспорт', 'Здоровье', 'Кафе и доставка', 'Развлечения',
      'Учёба', 'Спорт', 'Одежда', 'Подарки', 'Другое',
    ])
    expect(expense.every((c) => c.importance)).toBe(true)
    expect(income.map((c) => c.name)).toEqual(['Зарплата', 'Подработка', 'Подарки и переводы', 'Другое'])
    expect(income.some((c) => 'importance' in c)).toBe(false)
    expect(cats.every((c) => c.updatedAt === SEED_TIME)).toBe(true)
    expect(new Set(cats.map((c) => c.key)).size).toBe(cats.length)
  })
})

describe('категории', () => {
  it('createCategory: трата — в конец своего вида, ключ c_…, важность по умолчанию «Полезно»', () => {
    const c = createCategory({ kind: 'expense', name: '  Книги ' }, cats, NOW)
    expect(c).toMatchObject({
      kind: 'expense', name: 'Книги', importance: 'useful', order: 12, archived: false, createdAt: NOW, updatedAt: NOW,
    })
    expect(c.key).toMatch(/^c_[0-9a-f]{8}$/)
  })
  it('createCategory: доход без важности', () => {
    const c = createCategory({ kind: 'income', name: 'Кешбэк', importance: 'need' }, cats, NOW)
    expect('importance' in c).toBe(false)
    expect(c.order).toBe(5)
  })
  it('пустое название — ошибка', () => {
    expect(() => createCategory({ kind: 'expense', name: '  ' }, cats, NOW)).toThrow('Пустое название категории')
  })
  it('updateCategory меняет имя и важность; без изменений — null', () => {
    const cafe = cats.find((c) => c.key === 'cafe')!
    expect(updateCategory(cafe, { importance: 'useful' }, NOW)).toMatchObject({
      importance: 'useful', name: 'Кафе и доставка', updatedAt: NOW,
    })
    expect(updateCategory(cafe, { name: ' Кафе и доставка ', importance: 'optional' }, NOW)).toBeNull()
    expect(updateCategory(cafe, { name: '' }, NOW)).toBeNull()
  })
  it('updateCategory у дохода игнорирует важность', () => {
    const salary = cats.find((c) => c.key === 'salary')!
    expect(updateCategory(salary, { importance: 'need' }, NOW)).toBeNull()
  })
  it('moveCategory двигает среди активных своего вида и перенумеровывает', () => {
    expect(moveCategory(cats, 'housing', -1, NOW).map((c) => [c.key, c.order])).toEqual([['housing', 1], ['groceries', 2]])
    expect(moveCategory(cats, 'salary', -1, NOW)).toEqual([])
  })
  it('setCategoryArchived: архив скрывает из активных, возврат — в конец', () => {
    const archived = setCategoryArchived(cats[0], true, cats, NOW)
    const list = cats.map((c) => (c.key === archived.key ? archived : c))
    expect(activeCategories(list, 'expense').map((c) => c.key)).not.toContain('groceries')
    expect(setCategoryArchived(archived, false, list, NOW).order).toBe(12)
  })
})

describe('операции', () => {
  it('createTransaction: UUID, метки, комментарий обрезается, пустой не сохраняется', () => {
    const t = createTransaction({ kind: 'expense', amount: 45000, categoryKey: 'cafe', day: '2026-11-02', note: '  кофе ' }, NOW)
    expect(t).toMatchObject({
      day: '2026-11-02', kind: 'expense', amount: 45000, categoryKey: 'cafe', note: 'кофе',
      createdAt: NOW, updatedAt: NOW, deletedAt: null,
    })
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/)
    const blank = createTransaction({ kind: 'expense', amount: 1, categoryKey: 'cafe', day: '2026-11-02', note: '  ' }, NOW)
    expect('note' in blank).toBe(false)
  })
  it.each([0, -100, 12.5, 10_000_000_001])('сумма %s копеек отклоняется', (amount) => {
    expect(() => createTransaction({ kind: 'expense', amount, categoryKey: 'cafe', day: '2026-11-02' }, NOW)).toThrow(
      'Недопустимая сумма',
    )
  })
  it('updateTransaction меняет поля и метку, пустой комментарий удаляет', () => {
    const t = txRec('2026-11-02', { note: 'кофе' })
    const u = updateTransaction(t, { amount: 30000, day: '2026-11-01', note: '' }, NOW)
    expect(u).toMatchObject({ id: t.id, amount: 30000, day: '2026-11-01', createdAt: T0, updatedAt: NOW })
    expect('note' in u).toBe(false)
  })
  it('deleteTransaction — мягкое удаление', () => {
    expect(deleteTransaction(txRec('2026-11-02'), NOW)).toMatchObject({ deletedAt: NOW, updatedAt: NOW })
  })
})

describe('итоги', () => {
  const txs = [
    txRec('2026-11-01', { kind: 'income', categoryKey: 'salary', amount: 5_000_000 }),
    txRec('2026-11-02', { categoryKey: 'groceries', amount: 80000 }),
    txRec('2026-11-02', { categoryKey: 'cafe', amount: 45000 }),
    txRec('2026-11-03', { categoryKey: 'cafe', amount: 30000 }),
    txRec('2026-11-03', { categoryKey: 'study', amount: 100000 }),
    txRec('2026-11-04', { categoryKey: 'groceries', amount: 99999, deletedAt: NOW }), // удалена
    txRec('2026-10-31', { categoryKey: 'groceries', amount: 70000 }), // другой месяц
    txRec('2026-11-05', { categoryKey: 'c_gone', amount: 5000 }), // категории нет в списке
  ]
  const s = monthSummary(txs, cats, '2026-11')

  it('доход, траты, отложено', () => {
    expect([s.income, s.expense, s.saved]).toEqual([5_000_000, 260000, 4_740_000])
  })
  it('траты по важности; неизвестная категория — «Полезно»', () => {
    expect(s.byImportance).toEqual({ need: 80000, useful: 105000, optional: 75000 })
  })
  it('по категориям — по убыванию суммы, неизвестная — по ключу', () => {
    expect(s.expenseByCategory.map((c) => [c.name, c.amount, c.count])).toEqual([
      ['Учёба', 100000, 1], ['Продукты', 80000, 1], ['Кафе и доставка', 75000, 2], ['c_gone', 5000, 1],
    ])
    expect(s.incomeByCategory.map((c) => c.name)).toEqual(['Зарплата'])
  })
  it('архивная категория остаётся в итогах', () => {
    const archived = cats.map((c) => (c.key === 'cafe' ? { ...c, archived: true } : c))
    expect(monthSummary(txs, archived, '2026-11').byImportance.optional).toBe(75000)
  })
  it('траты больше дохода — отрицательное «отложено»', () => {
    expect(monthSummary([txRec('2026-11-02', { amount: 100 })], cats, '2026-11').saved).toBe(-100)
  })
  it('dayTotals — живые операции дня', () => {
    expect(dayTotals(txs, '2026-11-02')).toEqual({ income: 0, expense: 125000, count: 2 })
    expect(dayTotals(txs, '2026-11-04')).toEqual({ income: 0, expense: 0, count: 0 })
  })
})

describe('categoriesByUse', () => {
  it('частые — первыми, при равенстве — по order; старше 90 дней и удалённые не считаются', () => {
    const txs = [
      txRec('2026-11-02', { categoryKey: 'cafe' }),
      txRec('2026-11-01', { categoryKey: 'cafe' }),
      txRec('2026-10-20', { categoryKey: 'transport' }),
      txRec('2026-08-01', { categoryKey: 'fun' }),
      txRec('2026-08-01', { categoryKey: 'fun' }),
      txRec('2026-08-01', { categoryKey: 'fun' }),
      txRec('2026-11-02', { categoryKey: 'gifts', deletedAt: NOW }),
    ]
    const keys = categoriesByUse(txs, cats, 'expense', '2026-11-02').map((c) => c.key)
    expect(keys.slice(0, 4)).toEqual(['cafe', 'transport', 'groceries', 'housing'])
    expect(keys).toHaveLength(11)
  })
})
```

- [ ] **Step 3: Запустить — падают**

Run: `npx vitest run src/domain/finance.test.ts`
Expected: FAIL — нет модуля `./finance`.

- [ ] **Step 4: Реализовать `src/domain/finance.ts`**

```ts
import { addDays, monthOf } from './dates'
import { SEED_TIME } from './metrics'
import { MAX_AMOUNT } from './money'
import type { FinanceCategory, FinanceKind, Importance, Transaction } from './types'

export const IMPORTANCE_LABELS: Record<Importance, string> = {
  need: 'Необходимо',
  useful: 'Полезно',
  optional: 'Можно без этого',
}
export const IMPORTANCES: Importance[] = ['need', 'useful', 'optional']

const seed = { archived: false, createdAt: SEED_TIME, updatedAt: SEED_TIME }
const expense = (key: string, name: string, importance: Importance, order: number): FinanceCategory =>
  ({ key, kind: 'expense', name, importance, order, ...seed })
const income = (key: string, name: string, order: number): FinanceCategory => ({ key, kind: 'income', name, order, ...seed })

export const DEFAULT_CATEGORIES: FinanceCategory[] = [
  expense('groceries', 'Продукты', 'need', 1),
  expense('housing', 'Жильё и связь', 'need', 2),
  expense('transport', 'Транспорт', 'need', 3),
  expense('health', 'Здоровье', 'need', 4),
  expense('cafe', 'Кафе и доставка', 'optional', 5),
  expense('fun', 'Развлечения', 'optional', 6),
  expense('study', 'Учёба', 'useful', 7),
  expense('sport', 'Спорт', 'useful', 8),
  expense('clothes', 'Одежда', 'useful', 9),
  expense('gifts', 'Подарки', 'useful', 10),
  expense('other', 'Другое', 'useful', 11),
  income('salary', 'Зарплата', 1),
  income('sidejob', 'Подработка', 2),
  income('giftsIn', 'Подарки и переводы', 3),
  income('otherIn', 'Другое', 4),
]

export function sortCategories(cats: FinanceCategory[]): FinanceCategory[] {
  return [...cats].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
}

export function activeCategories(cats: FinanceCategory[], kind: FinanceKind): FinanceCategory[] {
  return sortCategories(cats).filter((c) => c.kind === kind && !c.archived)
}

const maxOrder = (cats: FinanceCategory[], kind: FinanceKind) =>
  Math.max(0, ...cats.filter((c) => c.kind === kind).map((c) => c.order))

export function createCategory(
  input: { kind: FinanceKind; name: string; importance?: Importance },
  existing: FinanceCategory[],
  now: string,
): FinanceCategory {
  const name = input.name.trim()
  if (!name) throw new Error('Пустое название категории')
  let key: string
  do key = `c_${crypto.randomUUID().slice(0, 8)}`
  while (existing.some((c) => c.key === key))
  return {
    key,
    kind: input.kind,
    name,
    ...(input.kind === 'expense' ? { importance: input.importance ?? 'useful' } : {}),
    order: maxOrder(existing, input.kind) + 1,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
}

/** Пустое имя игнорируется; важность — только у трат. Нечего менять — null. */
export function updateCategory(
  cat: FinanceCategory,
  patch: { name?: string; importance?: Importance },
  now: string,
): FinanceCategory | null {
  const name = patch.name?.trim() || cat.name
  const importance = cat.kind === 'expense' ? (patch.importance ?? cat.importance) : undefined
  if (name === cat.name && importance === cat.importance) return null
  return { ...cat, name, ...(importance ? { importance } : {}), updatedAt: now }
}

/** Меняет местами с соседом среди активных того же вида и перенумеровывает их 1…N. Возвращает только изменённые. */
export function moveCategory(cats: FinanceCategory[], key: string, dir: -1 | 1, now: string): FinanceCategory[] {
  const cat = cats.find((c) => c.key === key)
  if (!cat) return []
  const active = activeCategories(cats, cat.kind)
  const i = active.findIndex((c) => c.key === key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= active.length) return []
  const reordered = [...active]
  ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
  return reordered.flatMap((c, idx) => (c.order === idx + 1 ? [] : [{ ...c, order: idx + 1, updatedAt: now }]))
}

export function setCategoryArchived(
  cat: FinanceCategory,
  archived: boolean,
  cats: FinanceCategory[],
  now: string,
): FinanceCategory {
  return { ...cat, archived, updatedAt: now, ...(archived ? {} : { order: maxOrder(cats, cat.kind) + 1 }) }
}

export interface TransactionInput {
  kind: FinanceKind
  amount: number
  categoryKey: string
  day: string
  note?: string
}

export type TransactionPatch = Partial<Omit<TransactionInput, 'kind'>>

function checkAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new Error('Недопустимая сумма')
}

export function createTransaction(input: TransactionInput, now: string): Transaction {
  checkAmount(input.amount)
  const note = input.note?.trim()
  return {
    id: crypto.randomUUID(),
    day: input.day,
    kind: input.kind,
    amount: input.amount,
    categoryKey: input.categoryKey,
    ...(note ? { note } : {}),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

export function updateTransaction(tx: Transaction, patch: TransactionPatch, now: string): Transaction {
  if (patch.amount !== undefined) checkAmount(patch.amount)
  const next: Transaction = { ...tx, ...patch, updatedAt: now }
  const note = next.note?.trim()
  if (note) next.note = note
  else delete next.note
  return next
}

export function deleteTransaction(tx: Transaction, now: string): Transaction {
  return { ...tx, deletedAt: now, updatedAt: now }
}

export const liveTransactions = (txs: Transaction[]) => txs.filter((t) => !t.deletedAt)

/** Категория операции; если её нет в списке — имя по ключу, у трат важность «Полезно». */
export function categoryOf(
  tx: Pick<Transaction, 'categoryKey' | 'kind'>,
  cats: FinanceCategory[],
): Pick<FinanceCategory, 'key' | 'name' | 'importance'> {
  const found = cats.find((c) => c.key === tx.categoryKey)
  if (found) return found
  return { key: tx.categoryKey, name: tx.categoryKey, ...(tx.kind === 'expense' ? { importance: 'useful' as const } : {}) }
}

export interface CategoryTotal {
  key: string
  name: string
  importance?: Importance
  amount: number
  count: number
}

/** Суммы по категориям, по убыванию суммы, при равенстве — по имени. */
export function totalsByCategory(txs: Transaction[], cats: FinanceCategory[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>()
  for (const tx of txs) {
    const c = categoryOf(tx, cats)
    const total = map.get(c.key) ?? {
      key: c.key, name: c.name, ...(c.importance ? { importance: c.importance } : {}), amount: 0, count: 0,
    }
    total.amount += tx.amount
    total.count++
    map.set(c.key, total)
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ru'))
}

export interface MonthSummary {
  income: number
  expense: number
  /** income − expense, может быть < 0. */
  saved: number
  byImportance: Record<Importance, number>
  expenseByCategory: CategoryTotal[]
  incomeByCategory: CategoryTotal[]
}

const sum = (txs: Transaction[]) => txs.reduce((s, t) => s + t.amount, 0)

export function monthSummary(txs: Transaction[], cats: FinanceCategory[], month: string): MonthSummary {
  const inMonth = liveTransactions(txs).filter((t) => monthOf(t.day) === month)
  const expenses = inMonth.filter((t) => t.kind === 'expense')
  const incomes = inMonth.filter((t) => t.kind === 'income')
  const byImportance: Record<Importance, number> = { need: 0, useful: 0, optional: 0 }
  for (const t of expenses) byImportance[categoryOf(t, cats).importance ?? 'useful'] += t.amount
  const income = sum(incomes)
  const expense = sum(expenses)
  return {
    income,
    expense,
    saved: income - expense,
    byImportance,
    expenseByCategory: totalsByCategory(expenses, cats),
    incomeByCategory: totalsByCategory(incomes, cats),
  }
}

export function dayTotals(txs: Transaction[], day: string): { income: number; expense: number; count: number } {
  const ofDay = liveTransactions(txs).filter((t) => t.day === day)
  return {
    income: sum(ofDay.filter((t) => t.kind === 'income')),
    expense: sum(ofDay.filter((t) => t.kind === 'expense')),
    count: ofDay.length,
  }
}

/** Активные категории вида по частоте за 90 дней по today включительно; при равенстве — по order. */
export function categoriesByUse(
  txs: Transaction[],
  cats: FinanceCategory[],
  kind: FinanceKind,
  today: string,
): FinanceCategory[] {
  const from = addDays(today, -89)
  const uses = new Map<string, number>()
  for (const t of liveTransactions(txs)) {
    if (t.kind === kind && t.day >= from && t.day <= today) uses.set(t.categoryKey, (uses.get(t.categoryKey) ?? 0) + 1)
  }
  return activeCategories(cats, kind).sort((a, b) => (uses.get(b.key) ?? 0) - (uses.get(a.key) ?? 0))
}
```

- [ ] **Step 5: Запустить — проходят**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain
git commit -m "feat: finance categories with importance, transactions and month summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Цели и прогресс

**Files:**
- Create: `src/domain/goals.ts`, `src/domain/goals.test.ts`
- Modify: `src/domain/testFixtures.ts`

**Interfaces:**
- Consumes: Task 1 (типы, `monthOf`, `formatMoney`), Task 2 (`IMPORTANCES`, `categoryOf`, `liveTransactions`,
  `DEFAULT_CATEGORIES`), `plural` (`./ru`).
- Produces:
  - `AREA_LABELS`, `AREAS`, `GoalState`, `GOAL_STATE_LABELS`, `allowedAggregates(type: MetricType)`
  - `isMonth(x): x is string`, `isGoalTarget(x): x is GoalTarget`
  - `createGoal(input: { month; text; area; target? }, existing: Goal[], now): Goal`
  - `updateGoal(goal, patch: { text?; area?; target?: GoalTarget | null }, now): Goal`, `deleteGoal(goal, now)`
  - `goalsOfMonth(goals, month): Goal[]`, `moveGoal(goals, id, dir, now): Goal[]`
  - `ProgressData { transactions; financeCategories; days; metricDefinitions }` (ему удовлетворяет `DiarySnapshot`)
  - `goalProgress(goal, data, today): GoalProgress | null`; `GoalProgress { value: number | null; target: number; remaining: number | null; state: GoalState }`
  - `formatGoalValue(target, value, defs): string`
  - фикстура `goalRec(month, patch?)`

- [ ] **Step 1: Фикстура в `src/domain/testFixtures.ts`** (тип `Goal` добавить в импорт)

```ts
/** Цель без измерения, сфера «Другое». */
export function goalRec(month: string, patch: Partial<Goal> = {}): Goal {
  return {
    id: `goal-${++seq}`, month, text: 'Цель', area: 'other', order: 1,
    createdAt: T0, updatedAt: T0, deletedAt: null, ...patch,
  }
}
```

- [ ] **Step 2: Написать падающие тесты `src/domain/goals.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from './finance'
import {
  allowedAggregates, createGoal, deleteGoal, formatGoalValue, goalProgress, goalsOfMonth, isGoalTarget, moveGoal,
  updateGoal, type ProgressData,
} from './goals'
import { DEFAULT_METRICS } from './metrics'
import { T0, dayRec, goalRec, txRec } from './testFixtures'
import type { GoalTarget, MetricDefinition } from './types'

const NOW = '2026-11-02T21:00:00.000+03:00'
const habit = { archived: false, primary: false, createdAt: T0, updatedAt: T0 }
const defs: MetricDefinition[] = [
  ...DEFAULT_METRICS,
  { key: 'm1', name: 'Спорт', type: 'bool', order: 5, ...habit },
  { key: 'm2', name: 'Чтение', type: 'number', unit: 'мин', order: 6, ...habit },
]
const data = (patch: Partial<ProgressData> = {}): ProgressData => ({
  transactions: [], financeCategories: DEFAULT_CATEGORIES, days: [], metricDefinitions: defs, ...patch,
})

describe('isGoalTarget', () => {
  it.each<[string, unknown, boolean]>([
    ['траты по категории', { kind: 'finance', measure: 'expense', filter: { categoryKey: 'cafe' }, op: 'le', value: 500000 }, true],
    ['траты по важности', { kind: 'finance', measure: 'expense', filter: { importance: 'optional' }, op: 'le', value: 1000000 }, true],
    ['отложено без фильтра', { kind: 'finance', measure: 'saved', op: 'ge', value: 1500000 }, true],
    ['привычка — дни', { kind: 'metric', metricKey: 'm1', aggregate: 'count', op: 'ge', value: 12 }, true],
    ['отложено с фильтром', { kind: 'finance', measure: 'saved', filter: { categoryKey: 'cafe' }, op: 'ge', value: 1 }, false],
    ['доход по важности', { kind: 'finance', measure: 'income', filter: { importance: 'need' }, op: 'ge', value: 1 }, false],
    ['дробные копейки', { kind: 'finance', measure: 'expense', op: 'le', value: 10.5 }, false],
    ['неизвестное условие', { kind: 'metric', metricKey: 'm1', aggregate: 'count', op: 'eq', value: 1 }, false],
    ['неизвестный агрегат', { kind: 'metric', metricKey: 'm1', aggregate: 'max', op: 'ge', value: 1 }, false],
    ['не объект', 'Кафе ≤ 5000', false],
  ])('%s', (_, x, ok) => {
    expect(isGoalTarget(x)).toBe(ok)
  })
})

describe('allowedAggregates', () => {
  it('да/нет — дни, число — сумма и среднее, шкала — среднее, время — ничего', () => {
    expect(allowedAggregates('bool')).toEqual(['count'])
    expect(allowedAggregates('number')).toEqual(['sum', 'avg'])
    expect(allowedAggregates('scale')).toEqual(['avg'])
    expect(allowedAggregates('time')).toEqual([])
  })
})

describe('цели: создание и правка', () => {
  it('createGoal: UUID, обрезанный текст, порядок — в конец живых целей месяца', () => {
    const existing = [goalRec('2026-11', { order: 1 }), goalRec('2026-11', { order: 2, deletedAt: NOW }), goalRec('2026-12', { order: 5 })]
    const g = createGoal({ month: '2026-11', text: '  Закончить курс по SQL ', area: 'study' }, existing, NOW)
    expect(g).toMatchObject({
      month: '2026-11', text: 'Закончить курс по SQL', area: 'study', order: 2, createdAt: NOW, updatedAt: NOW, deletedAt: null,
    })
    expect(g.id).toMatch(/^[0-9a-f-]{36}$/)
    expect('target' in g).toBe(false)
  })
  it('пустой текст, неверный месяц или измерение — ошибка', () => {
    expect(() => createGoal({ month: '2026-11', text: ' ', area: 'other' }, [], NOW)).toThrow('Пустая цель')
    expect(() => createGoal({ month: '2026-13', text: 'x', area: 'other' }, [], NOW)).toThrow('Неверный месяц')
    const bad = { kind: 'metric' } as unknown as GoalTarget
    expect(() => createGoal({ month: '2026-11', text: 'x', area: 'other', target: bad }, [], NOW)).toThrow('Неверное измерение цели')
  })
  it('updateGoal: null убирает измерение', () => {
    const g = goalRec('2026-11', { target: { kind: 'finance', measure: 'saved', op: 'ge', value: 100 } })
    const u = updateGoal(g, { text: ' Отложить ', target: null }, NOW)
    expect(u).toMatchObject({ id: g.id, text: 'Отложить', updatedAt: NOW })
    expect('target' in u).toBe(false)
  })
  it('goalsOfMonth: удалённые и чужие месяцы не видны, по порядку', () => {
    const a = goalRec('2026-11', { order: 2 })
    const b = goalRec('2026-11', { order: 1 })
    const list = [a, b, goalRec('2026-12'), deleteGoal(goalRec('2026-11'), NOW)]
    expect(goalsOfMonth(list, '2026-11').map((g) => g.id)).toEqual([b.id, a.id])
  })
  it('moveGoal меняет местами в пределах месяца', () => {
    const a = goalRec('2026-11', { order: 1 })
    const b = goalRec('2026-11', { order: 2 })
    expect(moveGoal([a, b], b.id, -1, NOW).map((g) => [g.id, g.order])).toEqual([[b.id, 1], [a.id, 2]])
  })
})

describe('goalProgress', () => {
  const txs = [
    txRec('2026-11-02', { categoryKey: 'cafe', amount: 320000 }),
    txRec('2026-11-03', { categoryKey: 'fun', amount: 100000 }),
    txRec('2026-11-03', { categoryKey: 'groceries', amount: 500000 }),
    txRec('2026-11-04', { categoryKey: 'cafe', amount: 900000, deletedAt: NOW }),
    txRec('2026-10-30', { categoryKey: 'cafe', amount: 700000 }),
    txRec('2026-11-01', { kind: 'income', categoryKey: 'salary', amount: 5_000_000 }),
  ]
  const cafe = goalRec('2026-11', {
    target: { kind: 'finance', measure: 'expense', filter: { categoryKey: 'cafe' }, op: 'le', value: 500000 },
  })

  it('без измерения — null', () => {
    expect(goalProgress(goalRec('2026-11'), data(), '2026-11-10')).toBeNull()
  })
  it('≤ в течение месяца — «в рамках», остаток можно потратить', () => {
    expect(goalProgress(cafe, data({ transactions: txs }), '2026-11-10')).toEqual({
      value: 320000, target: 500000, remaining: 180000, state: 'within',
    })
  })
  it('≤ после конца месяца — «выполнено»; превышение — «перерасход»', () => {
    expect(goalProgress(cafe, data({ transactions: txs }), '2026-12-01')?.state).toBe('done')
    const over = [...txs, txRec('2026-11-20', { categoryKey: 'cafe', amount: 200000 })]
    expect(goalProgress(cafe, data({ transactions: over }), '2026-11-21')).toMatchObject({
      value: 520000, remaining: -20000, state: 'over',
    })
  })
  it('по важности и «отложено»', () => {
    const optional = goalRec('2026-11', {
      target: { kind: 'finance', measure: 'expense', filter: { importance: 'optional' }, op: 'le', value: 1000000 },
    })
    expect(goalProgress(optional, data({ transactions: txs }), '2026-11-10')?.value).toBe(420000)
    const saved = goalRec('2026-11', { target: { kind: 'finance', measure: 'saved', op: 'ge', value: 4_000_000 } })
    expect(goalProgress(saved, data({ transactions: txs }), '2026-11-10')).toEqual({
      value: 4_080_000, target: 4_000_000, remaining: 0, state: 'done',
    })
  })
  it('≥ не набрано — «в процессе», после конца месяца — «не выполнено»', () => {
    const sport = goalRec('2026-11', { target: { kind: 'metric', metricKey: 'm1', aggregate: 'count', op: 'ge', value: 12 } })
    const days = [
      dayRec('2026-11-01', { metrics: { m1: true } }),
      dayRec('2026-11-02', { metrics: { m1: false } }),
      dayRec('2026-11-03', { metrics: { m1: true }, deletedAt: NOW }),
      dayRec('2026-10-31', { metrics: { m1: true } }),
    ]
    expect(goalProgress(sport, data({ days }), '2026-11-15')).toEqual({ value: 1, target: 12, remaining: 11, state: 'progress' })
    expect(goalProgress(sport, data({ days }), '2026-12-01')?.state).toBe('missed')
  })
  it('сумма и среднее по метрикам; нет данных для среднего — null', () => {
    const days = [
      dayRec('2026-11-01', { metrics: { m2: 30, mood: 4 } }),
      dayRec('2026-11-02', { metrics: { m2: 45, mood: 3 } }),
      dayRec('2026-11-03', { text: 'без метрик' }),
    ]
    const reading = goalRec('2026-11', { target: { kind: 'metric', metricKey: 'm2', aggregate: 'sum', op: 'ge', value: 600 } })
    expect(goalProgress(reading, data({ days }), '2026-11-03')?.value).toBe(75)
    const mood = goalRec('2026-11', { target: { kind: 'metric', metricKey: 'mood', aggregate: 'avg', op: 'ge', value: 3.5 } })
    expect(goalProgress(mood, data({ days }), '2026-11-03')).toEqual({ value: 3.5, target: 3.5, remaining: 0, state: 'done' })
    expect(goalProgress(mood, data(), '2026-11-03')).toEqual({ value: null, target: 3.5, remaining: null, state: 'progress' })
  })
})

describe('formatGoalValue', () => {
  it.each<[GoalTarget, number | null, string]>([
    [{ kind: 'finance', measure: 'expense', op: 'le', value: 0 }, 320000, '3 200 ₽'],
    [{ kind: 'metric', metricKey: 'm1', aggregate: 'count', op: 'ge', value: 0 }, 3, '3 дня'],
    [{ kind: 'metric', metricKey: 'm2', aggregate: 'sum', op: 'ge', value: 0 }, 75, '75 мин'],
    [{ kind: 'metric', metricKey: 'mood', aggregate: 'avg', op: 'ge', value: 0 }, 3.456, '3,5'],
    [{ kind: 'metric', metricKey: 'mood', aggregate: 'avg', op: 'ge', value: 0 }, null, 'нет данных'],
  ])('%j, %s → «%s»', (target, value, text) => {
    expect(formatGoalValue(target, value, defs)).toBe(text)
  })
})
```

- [ ] **Step 3: Запустить — падают**

Run: `npx vitest run src/domain/goals.test.ts`
Expected: FAIL — нет модуля `./goals`.

- [ ] **Step 4: Реализовать `src/domain/goals.ts`**

```ts
import { monthOf } from './dates'
import { IMPORTANCES, categoryOf, liveTransactions } from './finance'
import { formatMoney } from './money'
import { plural } from './ru'
import type {
  DayRecord, FinanceCategory, Goal, GoalAggregate, GoalArea, GoalTarget, Importance, MetricDefinition, MetricType,
  Transaction,
} from './types'

export const AREA_LABELS: Record<GoalArea, string> = {
  finance: 'Финансы',
  work: 'Работа',
  study: 'Учёба',
  health: 'Здоровье',
  relations: 'Отношения',
  other: 'Другое',
}
export const AREAS = Object.keys(AREA_LABELS) as GoalArea[]

export type GoalState = 'progress' | 'done' | 'within' | 'over' | 'missed'
export const GOAL_STATE_LABELS: Record<GoalState, string> = {
  progress: 'в процессе',
  done: 'выполнено',
  within: 'в рамках',
  over: 'перерасход',
  missed: 'не выполнено',
}

/** Какие агрегаты допустимы для типа метрики; время не измеряется. */
export function allowedAggregates(type: MetricType): GoalAggregate[] {
  switch (type) {
    case 'bool':
      return ['count']
    case 'number':
      return ['sum', 'avg']
    case 'scale':
      return ['avg']
    case 'time':
      return []
  }
}

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export const isMonth = (x: unknown): x is string => typeof x === 'string' && MONTH_RE.test(x)

/** Структурная проверка измерения цели — для создания и импорта. */
export function isGoalTarget(x: unknown): x is GoalTarget {
  if (!isObj(x) || (x.op !== 'le' && x.op !== 'ge') || typeof x.value !== 'number' || !Number.isFinite(x.value)) return false
  if (x.kind === 'finance') {
    if (!Number.isInteger(x.value) || !['expense', 'income', 'saved'].includes(x.measure as string)) return false
    if (x.filter === undefined) return true
    if (x.measure === 'saved' || !isObj(x.filter)) return false
    const f = x.filter
    if (typeof f.categoryKey === 'string') return f.categoryKey !== '' && f.importance === undefined
    return x.measure === 'expense' && f.categoryKey === undefined && IMPORTANCES.includes(f.importance as Importance)
  }
  if (x.kind === 'metric') {
    return typeof x.metricKey === 'string' && x.metricKey !== '' && ['count', 'sum', 'avg'].includes(x.aggregate as string)
  }
  return false
}

/** Живые цели месяца по порядку. */
export function goalsOfMonth(goals: Goal[], month: string): Goal[] {
  return goals
    .filter((g) => g.month === month && !g.deletedAt)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
}

export function createGoal(
  input: { month: string; text: string; area: GoalArea; target?: GoalTarget },
  existing: Goal[],
  now: string,
): Goal {
  const text = input.text.trim()
  if (!text) throw new Error('Пустая цель')
  if (!isMonth(input.month)) throw new Error('Неверный месяц')
  if (input.target !== undefined && !isGoalTarget(input.target)) throw new Error('Неверное измерение цели')
  const order = Math.max(0, ...goalsOfMonth(existing, input.month).map((g) => g.order)) + 1
  return {
    id: crypto.randomUUID(),
    month: input.month,
    text,
    area: input.area,
    ...(input.target ? { target: input.target } : {}),
    order,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

/** target: null убирает измерение. */
export function updateGoal(
  goal: Goal,
  patch: { text?: string; area?: GoalArea; target?: GoalTarget | null },
  now: string,
): Goal {
  const text = patch.text?.trim() || goal.text
  if (patch.target && !isGoalTarget(patch.target)) throw new Error('Неверное измерение цели')
  const { target: oldTarget, ...rest } = goal
  const target = patch.target === undefined ? oldTarget : patch.target ?? undefined
  return { ...rest, text, area: patch.area ?? goal.area, ...(target ? { target } : {}), updatedAt: now }
}

export function deleteGoal(goal: Goal, now: string): Goal {
  return { ...goal, deletedAt: now, updatedAt: now }
}

/** Меняет местами с соседом среди живых целей месяца и перенумеровывает 1…N. Возвращает только изменённые. */
export function moveGoal(goals: Goal[], id: string, dir: -1 | 1, now: string): Goal[] {
  const goal = goals.find((g) => g.id === id)
  if (!goal) return []
  const list = goalsOfMonth(goals, goal.month)
  const i = list.findIndex((g) => g.id === id)
  const j = i + dir
  if (j < 0 || j >= list.length) return []
  const reordered = [...list]
  ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
  return reordered.flatMap((g, idx) => (g.order === idx + 1 ? [] : [{ ...g, order: idx + 1, updatedAt: now }]))
}

export interface ProgressData {
  transactions: Transaction[]
  financeCategories: FinanceCategory[]
  days: DayRecord[]
  metricDefinitions: MetricDefinition[]
}

export interface GoalProgress {
  /** null — данных для среднего нет. */
  value: number | null
  target: number
  /** ≥: сколько осталось набрать (не < 0); ≤: сколько ещё можно (< 0 — перерасход). */
  remaining: number | null
  state: GoalState
}

function measure(month: string, t: GoalTarget, data: ProgressData): number | null {
  if (t.kind === 'finance') {
    const txs = liveTransactions(data.transactions).filter((x) => monthOf(x.day) === month)
    const total = (kind: 'expense' | 'income') =>
      txs
        .filter((x) => x.kind === kind)
        .filter((x) => {
          if (!t.filter) return true
          if ('categoryKey' in t.filter) return x.categoryKey === t.filter.categoryKey
          return (categoryOf(x, data.financeCategories).importance ?? 'useful') === t.filter.importance
        })
        .reduce((s, x) => s + x.amount, 0)
    return t.measure === 'saved' ? total('income') - total('expense') : total(t.measure)
  }
  const values = data.days
    .filter((d) => !d.deletedAt && monthOf(d.day) === month)
    .map((d) => d.metrics[t.metricKey])
  if (t.aggregate === 'count') return values.filter((v) => v === true).length
  const numbers = values.filter((v): v is number => typeof v === 'number')
  const total = numbers.reduce((s, v) => s + v, 0)
  if (t.aggregate === 'sum') return total
  return numbers.length ? total / numbers.length : null
}

/** today — ГГГГ-ММ-ДД; месяц цели закончился, если today в более позднем месяце. Цель без измерения — null. */
export function goalProgress(goal: Goal, data: ProgressData, today: string): GoalProgress | null {
  if (!goal.target) return null
  const value = measure(goal.month, goal.target, data)
  const target = goal.target.value
  const ended = monthOf(today) > goal.month
  if (goal.target.op === 'ge') {
    const done = value !== null && value >= target
    return {
      value, target,
      remaining: value === null ? null : Math.max(0, target - value),
      state: done ? 'done' : ended ? 'missed' : 'progress',
    }
  }
  const over = value !== null && value > target
  return {
    value, target,
    remaining: value === null ? null : target - value,
    state: over ? 'over' : ended ? 'done' : 'within',
  }
}

const decimal = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

export function formatGoalValue(target: GoalTarget, value: number | null, defs: MetricDefinition[]): string {
  if (value === null) return 'нет данных'
  if (target.kind === 'finance') return formatMoney(value)
  if (target.aggregate === 'count') return `${value} ${plural(value, ['день', 'дня', 'дней'])}`
  const unit = defs.find((d) => d.key === target.metricKey)?.unit
  const num = decimal(value)
  return unit ? `${num} ${unit}` : num
}
```

- [ ] **Step 5: Запустить — проходят**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain
git commit -m "feat: monthly goals with optional finance or metric target and progress

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Схема v2 и доступ к данным

**Files:**
- Modify: `src/db/database.ts`, `src/db/diary.ts`, `src/db/diary.test.ts`

**Interfaces:**
- Consumes: типы Task 1, `DEFAULT_CATEGORIES`, `sortCategories` (Task 2), фикстуры `txRec`, `goalRec`.
- Produces (в `src/db/diary.ts`):
  - `getFinanceCategories(): Promise<FinanceCategory[]>` (отсортированы), `saveFinanceCategories(cats): Promise<void>`
  - `saveTransaction(tx): Promise<void>`, `listTransactions(from, to): Promise<Transaction[]>` (включительно, с удалёнными)
  - `saveGoals(goals): Promise<void>`, `listGoals(month): Promise<Goal[]>` (с удалёнными)
  - `meta.schemaVersion` = 2

- [ ] **Step 1: Написать падающие тесты в `src/db/diary.test.ts`**

Импорты дополнить: `import Dexie from 'dexie'`, `DEFAULT_CATEGORIES` из `'../domain/finance'`,
`T0, dayRec, goalRec, txRec` из `'../domain/testFixtures'`, новые функции из `'./diary'`.
В существующем тесте `initDb` заменить ожидание `schemaVersion: 1` на `schemaVersion: 2`. Добавить:

```ts
describe('финансы и цели в базе', () => {
  it('initDb засевает категории один раз и не затирает правки', async () => {
    expect(await getFinanceCategories()).toHaveLength(DEFAULT_CATEGORIES.length)
    await saveFinanceCategories([{ ...DEFAULT_CATEGORIES[0], name: 'Еда' }])
    await initDb()
    const cats = await getFinanceCategories()
    expect(cats).toHaveLength(DEFAULT_CATEGORIES.length)
    expect(cats.find((c) => c.key === 'groceries')?.name).toBe('Еда')
  })
  it('операции: выборка по дням включительно, удалённые остаются в базе', async () => {
    const a = txRec('2026-10-31')
    const b = txRec('2026-11-01')
    const c = txRec('2026-11-30', { deletedAt: T0 })
    const d = txRec('2026-12-01')
    for (const t of [a, b, c, d]) await saveTransaction(t)
    expect((await listTransactions('2026-11-01', '2026-11-30')).map((t) => t.id).sort()).toEqual([b.id, c.id].sort())
  })
  it('цели: выборка по месяцу', async () => {
    const a = goalRec('2026-11')
    await saveGoals([a, goalRec('2026-12')])
    expect(await listGoals('2026-11')).toEqual([a])
  })
})

describe('апгрейд базы v1 → v2', () => {
  it('сохраняет дни, метрики и настройки, засевает категории, ставит schemaVersion 2', async () => {
    await db.delete()
    const v1 = new Dexie('diary')
    v1.version(1).stores({ days: 'day, updatedAt', metricDefinitions: 'key', entries: 'id, day, updatedAt', meta: 'key' })
    await v1.open()
    const day = dayRec('2026-10-05', { metrics: { mood: 4 }, text: 'До обновления' })
    await v1.table('days').put(day)
    await v1.table('metricDefinitions').bulkPut(DEFAULT_METRICS)
    await v1.table('meta').bulkPut([
      { key: 'boundaryHour', value: 4 }, { key: 'lastExportAt', value: null }, { key: 'schemaVersion', value: 1 },
    ])
    v1.close()

    await db.open()
    await initDb()
    expect(await getDay('2026-10-05')).toEqual(day)
    expect(await getMetrics()).toHaveLength(4)
    expect(await getMeta()).toEqual({ boundaryHour: 4, lastExportAt: null, schemaVersion: 2 })
    expect(await getFinanceCategories()).toHaveLength(DEFAULT_CATEGORIES.length)
  })
})
```

- [ ] **Step 2: Запустить — падают**

Run: `npx vitest run src/db/diary.test.ts`
Expected: FAIL — нет экспортов `getFinanceCategories` и др., `schemaVersion` = 1.

- [ ] **Step 3: Реализовать**

`src/db/database.ts` — тип базы и версия 2 (версию 1 не трогать):

```ts
import Dexie, { type EntityTable } from 'dexie'
import type { DayRecord, EntryRecord, FinanceCategory, Goal, MetricDefinition, Transaction } from '../domain/types'
```

```ts
export const db = new Dexie('diary') as Dexie & {
  days: EntityTable<DayRecord, 'day'>
  metricDefinitions: EntityTable<MetricDefinition, 'key'>
  entries: EntityTable<EntryRecord, 'id'>
  meta: EntityTable<MetaRow, 'key'>
  financeCategories: EntityTable<FinanceCategory, 'key'>
  transactions: EntityTable<Transaction, 'id'>
  goals: EntityTable<Goal, 'id'>
}
```

После блока `db.version(1)…`:

```ts
// Финансы и цели. Новая база получает schemaVersion 2 из DEFAULT_META; существующая — здесь.
db.version(2)
  .stores({
    financeCategories: 'key',
    transactions: 'id, day, updatedAt',
    goals: 'id, month, updatedAt',
  })
  .upgrade((tx) => tx.table('meta').put({ key: 'schemaVersion', value: 2 }))
```

`src/db/diary.ts`:
- `DEFAULT_META` — `schemaVersion: 2`.
- импорт `DEFAULT_CATEGORIES, sortCategories` из `'../domain/finance'`, типы `FinanceCategory, Goal, Transaction`.
- `initDb`: транзакция по `db.metricDefinitions, db.meta, db.financeCategories`, и внутри после засева метрик:

```ts
    if ((await db.financeCategories.count()) === 0) await db.financeCategories.bulkAdd(DEFAULT_CATEGORIES)
```

- новые функции после `saveMetrics`:

```ts
export async function getFinanceCategories(): Promise<FinanceCategory[]> {
  return sortCategories(await db.financeCategories.toArray())
}

export async function saveFinanceCategories(cats: FinanceCategory[]): Promise<void> {
  await db.financeCategories.bulkPut(cats)
}

export async function saveTransaction(tx: Transaction): Promise<void> {
  await db.transactions.put(tx)
}

/** Операции с from по to включительно, вместе с удалёнными: отбирает домен. */
export async function listTransactions(from: string, to: string): Promise<Transaction[]> {
  return db.transactions.where('day').between(from, to, true, true).toArray()
}

export async function saveGoals(goals: Goal[]): Promise<void> {
  await db.goals.bulkPut(goals)
}

/** Цели месяца вместе с удалёнными: отбирает домен (goalsOfMonth). */
export async function listGoals(month: string): Promise<Goal[]> {
  return db.goals.where('month').equals(month).toArray()
}
```

- [ ] **Step 4: Запустить — проходят; сборка без ошибок**

Run: `npm test && npm run build`
Expected: PASS; build без ошибок типов.

- [ ] **Step 5: Commit**

```bash
git add src/db
git commit -m "feat: diary schema v2 with finance categories, transactions and goals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Бэкап v2 — снимок, `backup.json`, импорт

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/exportFormat.ts`, `src/domain/importFormat.ts`, `src/db/diary.ts`
- Test: `src/domain/importFormat.test.ts`, `src/domain/exportFormat.test.ts`, `src/db/diary.test.ts`

**Interfaces:**
- Consumes: Task 1–4.
- Produces: `DiarySnapshot` с полями `financeCategories`, `transactions`, `goals`; `FORMAT_VERSION = 2`;
  `ImportPlan` с частями `financeCategories`, `transactions`, `goals`; `planImport(current: Pick<DiarySnapshot,
  'days' | 'metricDefinitions' | 'entries' | 'financeCategories' | 'transactions' | 'goals'>, incoming)`.

- [ ] **Step 1: Расширить снимок — `src/domain/types.ts`**

```ts
export interface DiarySnapshot {
  metricDefinitions: MetricDefinition[]
  days: DayRecord[]
  entries: EntryRecord[]
  financeCategories: FinanceCategory[]
  transactions: Transaction[]
  goals: Goal[]
  meta: Meta
}
```

- [ ] **Step 2: Обновить существующие тесты под v2 и написать новые падающие**

`src/domain/importFormat.test.ts`:
- хелпер `snapshot` — добавить `financeCategories: [], transactions: [], goals: []`;
- тест «будущая formatVersion»: `formatVersion: 3` и ожидание `/более новой версией приложения \(формат 3\)/`;
- в «экспорт → импорт» `planImport({ days: [], metricDefinitions: [], entries: [] }, …)` →
  `planImport({ days: [], metricDefinitions: [], entries: [], financeCategories: [], transactions: [], goals: [] }, …)`
  (вынести в константу `EMPTY`).

Добавить (импорты: `DEFAULT_CATEGORIES` из `'./finance'`, `goalRec, txRec` из `'./testFixtures'`):

```ts
const EMPTY = { days: [], metricDefinitions: [], entries: [], financeCategories: [], transactions: [], goals: [] }

describe('бэкап v2: финансы и цели', () => {
  const cafeGoal = goalRec('2026-11', {
    area: 'finance', text: 'Кафе ≤ 5 000 ₽',
    target: { kind: 'finance', measure: 'expense', filter: { categoryKey: 'cafe' }, op: 'le', value: 500000 },
  })
  const s = snapshot({
    financeCategories: DEFAULT_CATEGORIES,
    transactions: [
      txRec('2026-11-02', { categoryKey: 'cafe', amount: 45000, note: 'кофе' }),
      txRec('2026-11-03', { amount: 1000, deletedAt: '2026-11-03T10:00:00.000+03:00' }),
    ],
    goals: [cafeGoal],
  })

  it('экспорт → импорт в пустой дневник возвращает категории, операции (с удалёнными) и цели', () => {
    const zip = buildExportZip(s, new Date(2026, 10, 3, 22)).bytes
    const plan = planImport(EMPTY, parseImport(extractBackupJson(zip)))
    expect(plan.financeCategories.put).toEqual(DEFAULT_CATEGORIES)
    expect(plan.transactions.put).toEqual(s.transactions)
    expect(plan.goals.put).toEqual([cafeGoal])
  })
  it('файл формата 1 без новых массивов читается с пустыми', () => {
    const v1 = { ...JSON.parse(json(snapshot())), formatVersion: 1 }
    delete v1.financeCategories
    delete v1.transactions
    delete v1.goals
    const backup = parseImport(JSON.stringify(v1))
    expect([backup.financeCategories, backup.transactions, backup.goals]).toEqual([[], [], []])
  })
  it.each<[string, Record<string, unknown>]>([
    ['нулевая сумма', { amount: 0 }],
    ['дробные копейки', { amount: 10.5 }],
    ['неверный вид', { kind: 'refund' }],
    ['неверная дата', { day: '2026-11-31x' }],
  ])('операция: %s — отказ с номером', (_, patch) => {
    const raw = JSON.parse(json(snapshot({ transactions: [txRec('2026-11-02')] })))
    Object.assign(raw.transactions[0], patch)
    expect(() => parseImport(JSON.stringify(raw))).toThrow('Операция №1: не хватает полей или они неверного типа')
  })
  it('категория трат без важности — отказ; у дохода важность отбрасывается', () => {
    const noImportance = { ...DEFAULT_CATEGORIES[0] }
    delete noImportance.importance
    expect(() => parseImport(json(snapshot({ financeCategories: [noImportance] })))).toThrow('Категория №1')
    const salary = { ...DEFAULT_CATEGORIES.find((c) => c.key === 'salary')!, importance: 'need' as const }
    expect('importance' in parseImport(json(snapshot({ financeCategories: [salary] }))).financeCategories[0]).toBe(false)
  })
  it('цель с неверным измерением или месяцем — отказ', () => {
    const badTarget = goalRec('2026-11', { target: { kind: 'finance', measure: 'saved', filter: { categoryKey: 'cafe' }, op: 'ge', value: 1 } })
    expect(() => parseImport(json(snapshot({ goals: [badTarget] })))).toThrow('Цель №1')
    expect(() => parseImport(json(snapshot({ goals: [goalRec('2026-13')] })))).toThrow('Цель №1')
  })
  it('слияние операций по id: свежая правка побеждает; сводка называет операции и цели', () => {
    const old = txRec('2026-11-02', { amount: 1000, updatedAt: '2026-11-02T10:00:00.000+03:00' })
    const edited = { ...old, amount: 2000, updatedAt: '2026-11-02T12:00:00.000+03:00' }
    const plan = planImport(
      snapshot({ transactions: [old] }),
      parseImport(json(snapshot({ transactions: [edited, txRec('2026-11-03')], goals: [goalRec('2026-11')] }))),
    )
    expect(plan.transactions.put.map((t) => t.amount)).toEqual([2000, 10000])
    expect(describeImport(plan)).toBe(
      'Дней: будет добавлено 0, обновлено 0. Метрик: будет добавлено 0, обновлено 0. ' +
        'Операций: будет добавлено 1, обновлено 1. Целей: будет добавлено 1, обновлено 0.',
    )
  })
})
```

`src/domain/exportFormat.test.ts`, блок `buildExportZip`: в объект `snapshot` добавить
`financeCategories: [], transactions: [], goals: []`; ожидание `backup.formatVersion` — `2`; добавить проверки:

```ts
    expect(backup.financeCategories).toEqual([])
    expect(backup.transactions).toEqual([])
    expect(backup.goals).toEqual([])
```

`src/db/diary.test.ts`, в `describe('экспорт → чистая база → импорт')` добавить
(импорты: `createTransaction` из `'../domain/finance'`, `createGoal` из `'../domain/goals'`):

```ts
  it('возвращает категории, операции и цели', async () => {
    const stamp = isoWithOffset(at(5))
    await saveFinanceCategories([{ ...(await getFinanceCategories())[0], name: 'Еда', updatedAt: stamp }])
    const tx = createTransaction({ kind: 'expense', amount: 45000, categoryKey: 'cafe', day: '2026-10-05', note: 'кофе' }, stamp)
    await saveTransaction(tx)
    const goal = createGoal({ month: '2026-11', text: 'Отложить 15 000 ₽', area: 'finance',
      target: { kind: 'finance', measure: 'saved', op: 'ge', value: 1_500_000 } }, [], stamp)
    await saveGoals([goal])
    const backup = parseImport(JSON.stringify(buildBackup(await exportSnapshot(), isoWithOffset(at(6)))))
    await freshDb()
    await applyImport(planImport(await exportSnapshot(), backup))
    expect(await listTransactions('2026-10-01', '2026-10-31')).toEqual([tx])
    expect(await listGoals('2026-11')).toEqual([goal])
    expect((await getFinanceCategories()).find((c) => c.key === 'groceries')?.name).toBe('Еда')
  })
```

- [ ] **Step 3: Запустить — падают**

Run: `npm test`
Expected: FAIL — `formatVersion` 1, нет новых частей плана, новые массивы не читаются.

- [ ] **Step 4: Реализовать**

`src/domain/exportFormat.ts`:

```ts
export const FORMAT_VERSION = 2
```

```ts
export function buildBackup(s: DiarySnapshot, exportedAt: string): Backup {
  return {
    formatVersion: FORMAT_VERSION,
    exportedAt,
    metricDefinitions: s.metricDefinitions,
    days: s.days,
    entries: s.entries,
    financeCategories: s.financeCategories,
    transactions: s.transactions,
    goals: s.goals,
    meta: s.meta,
  }
}
```

`src/domain/importFormat.ts` — импорты дополнить:

```ts
import { IMPORTANCES } from './finance'
import { AREAS, isGoalTarget, isMonth } from './goals'
import { MAX_AMOUNT } from './money'
import type {
  DayRecord, DiarySnapshot, EntryRecord, FaceKind, FinanceCategory, FinanceKind, Goal, GoalArea, Importance, Meta,
  MetricDefinition, MetricType, MetricValue, Transaction,
} from './types'
```

Парсеры (после `parseEntry`):

```ts
const KINDS: FinanceKind[] = ['expense', 'income']
const isDeletedAt = (x: unknown) => x === null || x === undefined || isStamp(x)

function parseCategory(x: unknown, i: number): FinanceCategory {
  if (
    !isObj(x) || !isStr(x.key) || !x.key || !KINDS.includes(x.kind as FinanceKind) || !isStr(x.name) ||
    typeof x.order !== 'number' || !isStamp(x.createdAt) || !isStamp(x.updatedAt) ||
    (x.kind === 'expense' && !IMPORTANCES.includes(x.importance as Importance))
  ) {
    throw new ImportError(`Категория №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    key: x.key,
    kind: x.kind as FinanceKind,
    name: x.name,
    ...(x.kind === 'expense' ? { importance: x.importance as Importance } : {}),
    order: x.order,
    archived: x.archived === true,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
  }
}

function parseTransaction(x: unknown, i: number): Transaction {
  if (
    !isObj(x) || !isStr(x.id) || !x.id || !isStr(x.day) || !DAY_RE.test(x.day) || !KINDS.includes(x.kind as FinanceKind) ||
    typeof x.amount !== 'number' || !Number.isInteger(x.amount) || x.amount <= 0 || x.amount > MAX_AMOUNT ||
    !isStr(x.categoryKey) || !x.categoryKey || (x.note !== undefined && !isStr(x.note)) ||
    !isStamp(x.createdAt) || !isStamp(x.updatedAt) || !isDeletedAt(x.deletedAt)
  ) {
    throw new ImportError(`Операция №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    id: x.id,
    day: x.day,
    kind: x.kind as FinanceKind,
    amount: x.amount,
    categoryKey: x.categoryKey,
    ...(isStr(x.note) ? { note: x.note } : {}),
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
    deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

function parseGoal(x: unknown, i: number): Goal {
  if (
    !isObj(x) || !isStr(x.id) || !x.id || !isMonth(x.month) || !isStr(x.text) || !AREAS.includes(x.area as GoalArea) ||
    (x.target !== undefined && !isGoalTarget(x.target)) || typeof x.order !== 'number' ||
    !isStamp(x.createdAt) || !isStamp(x.updatedAt) || !isDeletedAt(x.deletedAt)
  ) {
    throw new ImportError(`Цель №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    id: x.id,
    month: x.month,
    text: x.text,
    area: x.area as GoalArea,
    ...(isGoalTarget(x.target) ? { target: x.target } : {}),
    order: x.order,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
    deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
```

В `parseImport` возвращаемый объект — порядок полей как у `buildBackup`:

```ts
  return {
    formatVersion: raw.formatVersion,
    exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : '',
    metricDefinitions,
    days: raw.days.map((d, i) => parseDayRecord(d, i, defs)),
    entries: list(raw.entries).map(parseEntry),
    financeCategories: list(raw.financeCategories).map(parseCategory),
    transactions: list(raw.transactions).map(parseTransaction),
    goals: list(raw.goals).map(parseGoal),
    meta: parseMeta(raw.meta),
  }
```

План, размер, сводка:

```ts
export interface ImportPlan {
  days: MergePart<DayRecord>
  metricDefinitions: MergePart<MetricDefinition>
  entries: MergePart<EntryRecord>
  financeCategories: MergePart<FinanceCategory>
  transactions: MergePart<Transaction>
  goals: MergePart<Goal>
}

export function planImport(
  current: Pick<DiarySnapshot, 'days' | 'metricDefinitions' | 'entries' | 'financeCategories' | 'transactions' | 'goals'>,
  incoming: Backup,
): ImportPlan {
  return {
    days: mergeBy(current.days, incoming.days, (d) => d.day),
    metricDefinitions: mergeBy(current.metricDefinitions, incoming.metricDefinitions, (d) => d.key),
    entries: mergeBy(current.entries, incoming.entries, (e) => e.id),
    financeCategories: mergeBy(current.financeCategories, incoming.financeCategories, (c) => c.key),
    transactions: mergeBy(current.transactions, incoming.transactions, (t) => t.id),
    goals: mergeBy(current.goals, incoming.goals, (g) => g.id),
  }
}

export function importSize(plan: ImportPlan): number {
  return Object.values(plan).reduce((n, part: MergePart<unknown>) => n + part.put.length, 0)
}

const describePart = (label: string, p: MergePart<unknown>) =>
  `${label}: будет добавлено ${p.added}, обновлено ${p.updated}.`

export function describeImport(plan: ImportPlan): string {
  if (importSize(plan) === 0) return 'Нечего импортировать: всё это уже есть в дневнике.'
  const parts = [describePart('Дней', plan.days), describePart('Метрик', plan.metricDefinitions)]
  const extra: [string, MergePart<unknown>][] = [
    ['Категорий', plan.financeCategories], ['Операций', plan.transactions], ['Целей', plan.goals],
  ]
  for (const [label, p] of extra) if (p.put.length) parts.push(describePart(label, p))
  return parts.join(' ')
}
```

`src/db/diary.ts`:

```ts
export async function exportSnapshot(): Promise<DiarySnapshot> {
  const tables = [db.days, db.metricDefinitions, db.entries, db.meta, db.financeCategories, db.transactions, db.goals]
  return db.transaction('r', tables, async () => ({
    metricDefinitions: await db.metricDefinitions.toArray(),
    days: await db.days.toArray(),
    entries: await db.entries.toArray(),
    financeCategories: await db.financeCategories.toArray(),
    transactions: await db.transactions.toArray(),
    goals: await db.goals.toArray(),
    meta: await getMeta(),
  }))
}

export async function applyImport(plan: ImportPlan): Promise<void> {
  const tables = [db.days, db.metricDefinitions, db.entries, db.financeCategories, db.transactions, db.goals]
  await db.transaction('rw', tables, async () => {
    await db.days.bulkPut(plan.days.put)
    await db.metricDefinitions.bulkPut(plan.metricDefinitions.put)
    await db.entries.bulkPut(plan.entries.put)
    await db.financeCategories.bulkPut(plan.financeCategories.put)
    await db.transactions.bulkPut(plan.transactions.put)
    await db.goals.bulkPut(plan.goals.put)
  })
}
```

- [ ] **Step 5: Запустить — проходят; сборка без ошибок**

Run: `npm test && npm run build`
Expected: PASS; `src/ui/DataSettings.tsx` компилируется без правок (`planImport(await exportSnapshot(), backup)`).

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: backup format 2 with finance categories, transactions and goals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Markdown экспорта — операции дня и цели месяца

**Files:**
- Modify: `src/domain/exportFormat.ts`, `src/domain/exportFormat.test.ts`

**Interfaces:**
- Consumes: Task 2 (`liveTransactions`, `totalsByCategory`), Task 3 (`goalsOfMonth`, `goalProgress`,
  `formatGoalValue`, `AREA_LABELS`, `GOAL_STATE_LABELS`), Task 1 (`formatAmount`, `formatMoney`, `monthOf`,
  `monthName`), `logicalDay`.
- Produces (сигнатуры меняются):
  - `selectChangedDays(s: DiarySnapshot): string[]`
  - `financeLines(txs: Transaction[], cats: FinanceCategory[]): string[]`
  - `goalsSection(s: DiarySnapshot, month: string, today: string): string`
  - `renderMarkdown(s: DiarySnapshot, days: string[], today: string): string`
  - `buildExportZip(s, now)` — сигнатура прежняя.

- [ ] **Step 1: Переписать тесты `selectChangedDays` и `renderMarkdown`, добавить новые**

В `src/domain/exportFormat.test.ts` импорты: `buildExportZip, metricsLine, renderMarkdown, selectChangedDays` из
`'./exportFormat'`, `DEFAULT_CATEGORIES` из `'./finance'`, `T0, dayRec, goalRec, txRec` из `'./testFixtures'`.
Над блоками добавить:

```ts
const snap = (patch: Partial<DiarySnapshot> = {}): DiarySnapshot => ({
  metricDefinitions: defs, days: [], entries: [], financeCategories: DEFAULT_CATEGORIES, transactions: [], goals: [],
  meta: { boundaryHour: 6, lastExportAt: null, schemaVersion: 2 }, ...patch,
})
const since = (lastExportAt: string) => ({ boundaryHour: 6, lastExportAt, schemaVersion: 2 })
```

Заменить `describe('selectChangedDays')` целиком:

```ts
describe('selectChangedDays', () => {
  const days = [
    dayRec('2026-10-03', { text: 'старый', updatedAt: '2026-10-03T22:00:00.000+03:00' }),
    dayRec('2026-10-05', { text: 'новый', updatedAt: '2026-10-05T22:00:00.000+03:00' }),
    dayRec('2026-10-04', { text: 'тоже новый', updatedAt: '2026-10-05T21:00:00.000+03:00' }),
    dayRec('2026-10-06', { updatedAt: '2026-10-06T22:00:00.000+03:00' }), // пустой
  ]
  it('первый экспорт — все заполненные дни по возрастанию даты', () => {
    expect(selectChangedDays(snap({ days }))).toEqual(['2026-10-03', '2026-10-04', '2026-10-05'])
  })
  it('только изменённые после прошлого экспорта', () => {
    expect(selectChangedDays(snap({ days, meta: since('2026-10-04T12:00:00.000+03:00') }))).toEqual(['2026-10-04', '2026-10-05'])
  })
  it('смещения сравниваются по моменту времени', () => {
    const mixed = [
      dayRec('2026-10-05', { text: 'a', updatedAt: '2026-10-05T19:45:00.000-01:00' }), // 20:45 UTC — после
      dayRec('2026-10-06', { text: 'b', updatedAt: '2026-10-06T00:10:00.000+05:00' }), // 19:10 UTC — до
    ]
    expect(selectChangedDays(snap({ days: mixed, meta: since('2026-10-05T23:30:00.000+03:00') }))).toEqual(['2026-10-05'])
  })
  it('день попадает, если изменилась только его операция; день только с операциями — тоже', () => {
    const s = snap({
      days,
      transactions: [
        txRec('2026-10-03', { updatedAt: '2026-10-06T10:00:00.000+03:00' }), // старый день, новая трата
        txRec('2026-10-07', { updatedAt: '2026-10-07T10:00:00.000+03:00' }), // день без записи
        txRec('2026-10-08', { updatedAt: '2026-10-08T10:00:00.000+03:00', deletedAt: '2026-10-08T10:00:00.000+03:00' }),
      ],
      meta: since('2026-10-05T23:00:00.000+03:00'),
    })
    expect(selectChangedDays(s)).toEqual(['2026-10-03', '2026-10-07'])
  })
})
```

Заменить `describe('renderMarkdown')` целиком:

```ts
describe('renderMarkdown', () => {
  it('блок дня: заголовок, метрики, пустая строка, текст', () => {
    const s = snap({ days: [dayRec('2026-10-06', { metrics: full, text: '  Гулял по парку.  ' })] })
    expect(renderMarkdown(s, ['2026-10-06'], '2026-10-06')).toBe(
      '## 2026-10-06, вторник\n' +
        'Настроение: 4/5 (хорошо) · Скука: 2/5 · Сон: 23:40–07:10 (7 ч 30 мин)\n' +
        '\n' +
        'Гулял по парку.\n',
    )
  })
  it('дни разделены пустой строкой; без метрик — сразу текст', () => {
    const s = snap({ days: [dayRec('2026-10-05', { text: 'Один' }), dayRec('2026-10-06', { metrics: { mood: 3 } })] })
    expect(renderMarkdown(s, ['2026-10-05', '2026-10-06'], '2026-10-06')).toBe(
      '## 2026-10-05, понедельник\n\nОдин\n\n## 2026-10-06, вторник\nНастроение: 3/5 (нормально)\n',
    )
  })
  it('нет изменённых дней — понятная строка', () => {
    expect(renderMarkdown(snap(), [], '2026-10-06')).toBe('Изменённых дней с прошлого экспорта нет.\n')
  })
  it('доходы и траты после метрик: по убыванию суммы, комментарии в скобках, удалённые не выводятся', () => {
    const s = snap({
      days: [dayRec('2026-11-02', { metrics: { mood: 4 }, text: 'Обычный день' })],
      transactions: [
        txRec('2026-11-02', { kind: 'income', categoryKey: 'salary', amount: 5_000_000 }),
        txRec('2026-11-02', { categoryKey: 'groceries', amount: 80000 }),
        txRec('2026-11-02', { categoryKey: 'cafe', amount: 30000, note: 'кофе с Машей' }),
        txRec('2026-11-02', { categoryKey: 'cafe', amount: 15000, note: 'обед' }),
        txRec('2026-11-02', { categoryKey: 'fun', amount: 99900, deletedAt: T0 }),
      ],
    })
    expect(renderMarkdown(s, ['2026-11-02'], '2026-11-02')).toBe(
      '## 2026-11-02, понедельник\n' +
        'Настроение: 4/5 (хорошо)\n' +
        'Доходы: 50 000 ₽ — Зарплата 50 000\n' +
        'Траты: 1 250 ₽ — Продукты 800 · Кафе и доставка 450 (кофе с Машей, обед)\n' +
        '\n' +
        'Обычный день\n',
    )
  })
  it('день только с операциями', () => {
    const s = snap({ transactions: [txRec('2026-11-03', { categoryKey: 'transport', amount: 6000 })] })
    expect(renderMarkdown(s, ['2026-11-03'], '2026-11-03')).toBe('## 2026-11-03, вторник\nТраты: 60 ₽ — Транспорт 60\n')
  })
  it('в начале — цели месяцев файла с прогрессом у измеримых; удалённые не выводятся', () => {
    const s = snap({
      days: [dayRec('2026-10-31', { text: 'Хеллоуин' }), dayRec('2026-11-02', { text: 'Понедельник' })],
      transactions: [txRec('2026-11-02', { categoryKey: 'cafe', amount: 320000 })],
      goals: [
        goalRec('2026-11', {
          area: 'finance', order: 1, text: 'Тратить на кафе\nне больше 5 000 ₽',
          target: { kind: 'finance', measure: 'expense', filter: { categoryKey: 'cafe' }, op: 'le', value: 500000 },
        }),
        goalRec('2026-11', { area: 'study', order: 2, text: 'Закончить курс по SQL' }),
        goalRec('2026-11', { area: 'work', order: 3, text: 'Удалённая', deletedAt: T0 }),
      ],
    })
    expect(renderMarkdown(s, ['2026-10-31', '2026-11-02'], '2026-11-02')).toBe(
      '# Цели — ноябрь 2026\n' +
        '- [Финансы] Тратить на кафе не больше 5 000 ₽ — сейчас 3 200 ₽, в рамках\n' +
        '- [Учёба] Закончить курс по SQL\n' +
        '\n' +
        '## 2026-10-31, суббота\n\nХеллоуин\n' +
        '\n' +
        '## 2026-11-02, понедельник\nТраты: 3 200 ₽ — Кафе и доставка 3 200\n\nПонедельник\n',
    )
  })
})
```

В `describe('buildExportZip')` объект `snapshot` заменить на `snap({ days: [...те же два дня...] })`, а тест
«нет изменений» — на `snap({ days: snapshot.days, meta: since('2026-10-06T23:00:00.000+03:00') })`.

- [ ] **Step 2: Запустить — падают**

Run: `npx vitest run src/domain/exportFormat.test.ts`
Expected: FAIL — `selectChangedDays`/`renderMarkdown` со старыми сигнатурами, нет строк операций и целей.

- [ ] **Step 3: Реализовать в `src/domain/exportFormat.ts`**

Импорты:

```ts
import { strToU8, zipSync } from 'fflate'
import { isLater, isoWithOffset, monthOf } from './dates'
import { liveTransactions, totalsByCategory } from './finance'
import { AREA_LABELS, GOAL_STATE_LABELS, formatGoalValue, goalProgress, goalsOfMonth } from './goals'
import { formatDate, logicalDay } from './logicalDay'
import { SCALE_LABELS, isDayFilled, sortMetrics } from './metrics'
import { formatAmount, formatMoney } from './money'
import { monthName, weekdayName } from './ru'
import { formatDuration, sleepDuration } from './sleep'
import type { DayRecord, DiarySnapshot, FinanceCategory, MetricDefinition, MetricValue, Transaction } from './types'
```

Заменить `selectChangedDays`:

```ts
/**
 * Дни для Markdown: после прошлого экспорта (первый — все) изменилась запись дня или любая его операция,
 * и в дне есть что показать — заполненная запись или живые операции. По возрастанию даты.
 */
export function selectChangedDays(s: DiarySnapshot): string[] {
  const since = s.meta.lastExportAt
  const changed = (x: { updatedAt: string }) => since === null || isLater(x.updatedAt, since)
  const candidates = new Set([...s.days.filter(changed).map((d) => d.day), ...s.transactions.filter(changed).map((t) => t.day)])
  const records = new Map(s.days.map((d) => [d.day, d]))
  const withLive = new Set(liveTransactions(s.transactions).map((t) => t.day))
  return [...candidates]
    .filter((day) => {
      const rec = records.get(day)
      return (rec !== undefined && isDayFilled(rec)) || withLive.has(day)
    })
    .sort()
}
```

Добавить после `metricsLine`:

```ts
const KIND_TITLES = { income: 'Доходы', expense: 'Траты' } as const

/** «Доходы: …» и «Траты: …» дня; категории по убыванию суммы, комментарии в скобках. */
export function financeLines(txs: Transaction[], cats: FinanceCategory[]): string[] {
  const lines: string[] = []
  for (const kind of ['income', 'expense'] as const) {
    const ofKind = liveTransactions(txs).filter((t) => t.kind === kind)
    if (!ofKind.length) continue
    const total = ofKind.reduce((s, t) => s + t.amount, 0)
    const parts = totalsByCategory(ofKind, cats).map((c) => {
      const notes = ofKind.filter((t) => t.categoryKey === c.key && t.note).map((t) => t.note)
      return `${c.name} ${formatAmount(c.amount)}${notes.length ? ` (${notes.join(', ')})` : ''}`
    })
    lines.push(`${KIND_TITLES[kind]}: ${formatMoney(total)} — ${parts.join(' · ')}`)
  }
  return lines
}

/** Раздел «# Цели — ноябрь 2026»; у месяца без живых целей — пустая строка. */
export function goalsSection(s: DiarySnapshot, month: string, today: string): string {
  const goals = goalsOfMonth(s.goals, month)
  if (!goals.length) return ''
  const lines = goals.map((g) => {
    const text = g.text.trim().replace(/\s*\n\s*/g, ' ')
    const p = goalProgress(g, s, today)
    const status = p && g.target
      ? ` — сейчас ${formatGoalValue(g.target, p.value, s.metricDefinitions)}, ${GOAL_STATE_LABELS[p.state]}`
      : ''
    return `- [${AREA_LABELS[g.area]}] ${text}${status}`
  })
  return `# Цели — ${monthName(month)}\n${lines.join('\n')}\n`
}
```

Заменить `renderMarkdown`:

```ts
export function renderMarkdown(s: DiarySnapshot, days: string[], today: string): string {
  if (days.length === 0) return 'Изменённых дней с прошлого экспорта нет.\n'
  const records = new Map(s.days.map((d) => [d.day, d]))
  const goals = [...new Set(days.map(monthOf))].map((m) => goalsSection(s, m, today)).filter(Boolean)
  const blocks = days.map((day) => {
    const rec: DayRecord | undefined = records.get(day)
    const live = rec && !rec.deletedAt ? rec : undefined
    const lines = [`## ${day}, ${weekdayName(day)}`]
    const metrics = live ? metricsLine(live, s.metricDefinitions) : ''
    if (metrics) lines.push(metrics)
    lines.push(...financeLines(s.transactions.filter((t) => t.day === day), s.financeCategories))
    const text = live?.text.trim() ?? ''
    if (text) lines.push('', text)
    return lines.join('\n') + '\n'
  })
  return [...goals, ...blocks].join('\n')
}
```

Заменить `buildExportZip`:

```ts
export function buildExportZip(s: DiarySnapshot, now: Date): { fileName: string; bytes: Uint8Array } {
  const today = formatDate(now)
  const changed = selectChangedDays(s)
  const from = changed[0] ?? today
  const to = changed[changed.length - 1] ?? today
  const backup = buildBackup(s, isoWithOffset(now))
  const bytes = zipSync({
    'backup.json': strToU8(JSON.stringify(backup, null, 2)),
    [`entries_${from}_${to}.md`]: strToU8(renderMarkdown(s, changed, logicalDay(now, s.meta.boundaryHour))),
  })
  return { fileName: `diary-${today}.zip`, bytes }
}
```

- [ ] **Step 4: Запустить — проходят; сборка без ошибок**

Run: `npm test && npm run build`
Expected: PASS; build без ошибок (`noUnusedLocals`: убедиться, что не осталось неиспользуемых импортов).

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat: export markdown with daily income/expense lines and monthly goals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Документация и итоговая проверка

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-06-diary-mvp-design.md` (§7, одна строка)

- [ ] **Step 1: `CLAUDE.md`**
  - Заголовок «Модель данных v1» → «Модель данных v2»; в таблицу добавить строки:

```markdown
| `financeCategories` | `key`, `kind` (expense / income), `name`, `importance` (need / useful / optional, только траты), `order`, `archived` |
| `transactions` | `id`, `day`, `kind`, `amount` (копейки), `categoryKey`, `note`, `createdAt`, `updatedAt`, `deletedAt` |
| `goals` | `id`, `month` (ГГГГ-ММ), `text`, `area`, `target` (измерение, необязательно), `order`, метки, `deletedAt` |
```

  - Правило 5 (экспорт): дописать «Сейчас `formatVersion: 2` (финансы и цели). Ежемесячный разбор в LIFE читает
    `backup.json`: Markdown содержит только изменённое с прошлого экспорта.»
  - В «Текущее состояние» добавить строку:
    `- [ДД.ММ.2026] Фаза 2, часть 1: финансы и цели — данные, логика, экспорт v2 (спецификация
    `docs/superpowers/specs/2026-10-14-finance-goals-design.md`), ветка `phase2-finance-goals`, не опубликовано.
    Дальше — макеты «Финансы» и «Цели» в Claude Design, затем экраны.`

- [ ] **Step 2: Спецификация MVP, §7** — в конец раздела добавить строку:
  `> С версии 1.2.0 — formatVersion 2: см. docs/superpowers/specs/2026-10-14-finance-goals-design.md §5.`

- [ ] **Step 3: Полная проверка**

Run: `npm test && npm run build`
Expected: все тесты PASS, сборка без ошибок.

- [ ] **Step 4: Commit (без push)**

```bash
git add CLAUDE.md docs
git commit -m "docs: data model v2 and export format 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline main..HEAD
```
