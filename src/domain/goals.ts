import { monthOf } from './dates'
import { IMPORTANCES, categoryOf, liveTransactions } from './finance'
import { formatAmount, formatMoney, parseAmount } from './money'
import { plural } from './ru'
import type {
  DayRecord, FinanceCategory, Goal, GoalAggregate, GoalArea, GoalOp, GoalTarget, Importance, MetricDefinition, MetricType,
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
  if (i < 0 || j < 0 || j >= list.length) return []
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

/**
 * today — ГГГГ-ММ-ДД; месяц цели закончился, если today в более позднем месяце. Цель без измерения — null.
 * Нет данных (среднее без единого значения) — «в процессе», после конца месяца — «не выполнено».
 */
export function goalProgress(goal: Goal, data: ProgressData, today: string): GoalProgress | null {
  if (!goal.target) return null
  const value = measure(goal.month, goal.target, data)
  const target = goal.target.value
  const ended = monthOf(today) > goal.month
  if (value === null) return { value, target, remaining: null, state: ended ? 'missed' : 'progress' }
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
