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
