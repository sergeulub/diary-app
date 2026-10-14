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
