import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from './finance'
import {
  EMPTY_TARGET_FORM, allowedAggregates, createGoal, deleteGoal, formFromTarget, formatGoalValue, goalDetail,
  goalProgress, goalsOfMonth, isGoalTarget, moveGoal, progressPercent, targetFromForm, updateGoal,
  type GoalProgress, type ProgressData,
} from './goals'
import { DEFAULT_METRICS } from './metrics'
import { T0, dayRec, goalRec, photoRec, reviewRec, txRec } from './testFixtures'
import type { GoalTarget, MetricDefinition } from './types'

const NOW = '2026-11-02T21:00:00.000+03:00'
const habit = { archived: false, primary: false, createdAt: T0, updatedAt: T0 }
const defs: MetricDefinition[] = [
  ...DEFAULT_METRICS,
  { key: 'm1', name: 'Спорт', type: 'bool', order: 5, ...habit },
  { key: 'm2', name: 'Чтение', type: 'number', unit: 'мин', order: 6, ...habit },
]
const data = (patch: Partial<ProgressData> = {}): ProgressData => ({
  transactions: [], financeCategories: DEFAULT_CATEGORIES, days: [], metricDefinitions: defs, entries: [], photos: [], ...patch,
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
    ['разборы', { kind: 'reviews', op: 'ge', value: 12 }, true],
    ['разборы — дробь', { kind: 'reviews', op: 'ge', value: 1.5 }, false],
    ['разборы — меньше нуля', { kind: 'reviews', op: 'ge', value: -1 }, false],
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
  it('≤ без данных: в течение месяца — «в процессе», после — «не выполнено», а не «выполнено»', () => {
    const boredom = goalRec('2026-11', { target: { kind: 'metric', metricKey: 'boredom', aggregate: 'avg', op: 'le', value: 2 } })
    expect(goalProgress(boredom, data(), '2026-11-10')?.state).toBe('progress')
    expect(goalProgress(boredom, data(), '2026-12-01')).toEqual({ value: null, target: 2, remaining: null, state: 'missed' })
  })
  it('разборы: непустые живые разборы месяца', () => {
    const goal = goalRec('2026-11', { target: { kind: 'reviews', op: 'ge', value: 12 } })
    const photoOnly = reviewRec('2026-11-05')
    const entries = [
      reviewRec('2026-11-01', { text: 'Йогурт' }),
      reviewRec('2026-11-02', { verdict: 'Работает' }),
      photoOnly,
      reviewRec('2026-11-06'), // пустой
      reviewRec('2026-11-07', { text: 'Кофе', deletedAt: NOW }),
      reviewRec('2026-10-31', { text: 'Чипсы' }),
    ]
    const photos = [photoRec(photoOnly.id)]
    expect(goalProgress(goal, data({ entries, photos }), '2026-11-17')).toEqual({ value: 3, target: 12, remaining: 9, state: 'progress' })
  })
})

describe('formatGoalValue', () => {
  it.each<[GoalTarget, number | null, string]>([
    [{ kind: 'finance', measure: 'expense', op: 'le', value: 0 }, 320000, '3 200 ₽'],
    [{ kind: 'metric', metricKey: 'm1', aggregate: 'count', op: 'ge', value: 0 }, 3, '3 дня'],
    [{ kind: 'metric', metricKey: 'm2', aggregate: 'sum', op: 'ge', value: 0 }, 75, '75 мин'],
    [{ kind: 'metric', metricKey: 'mood', aggregate: 'avg', op: 'ge', value: 0 }, 3.456, '3,5'],
    [{ kind: 'metric', metricKey: 'mood', aggregate: 'avg', op: 'ge', value: 0 }, null, 'нет данных'],
    [{ kind: 'reviews', op: 'ge', value: 12 }, 5, '5 разборов'],
    [{ kind: 'reviews', op: 'ge', value: 12 }, 1, '1 разбор'],
  ])('%j, %s → «%s»', (target, value, text) => {
    expect(formatGoalValue(target, value, defs)).toBe(text)
  })
})

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
    const reviews = goalRec('2026-11', { target: { kind: 'reviews', op: 'ge', value: 12 } })
    expect(goalDetail(reviews, p(5, 12, 7, 'progress'), defs)).toBe('5 из 12 разборов · осталось 7')
    expect(goalDetail(reviews, p(12, 12, 0, 'done'), defs)).toBe('12 из 12 разборов')
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
    expect(() => targetFromForm(form({ measure: 'reviews', value: '2,5' }))).toThrow('Введите число, например 12')
  })
  it('formFromTarget → targetFromForm возвращает то же измерение', () => {
    const targets: GoalTarget[] = [
      { kind: 'finance', measure: 'expense', filter: { categoryKey: 'cafe' }, op: 'le', value: 600050 },
      { kind: 'finance', measure: 'expense', filter: { importance: 'need' }, op: 'le', value: 100000 },
      { kind: 'finance', measure: 'saved', op: 'ge', value: 3000000 },
      { kind: 'metric', metricKey: 'm2', aggregate: 'sum', op: 'ge', value: 600 },
      { kind: 'metric', metricKey: 'mood', aggregate: 'avg', op: 'ge', value: 3.5 },
      { kind: 'reviews', op: 'ge', value: 12 },
    ]
    for (const t of targets) expect(targetFromForm(formFromTarget(t))).toEqual(t)
    expect(formFromTarget(undefined)).toEqual(EMPTY_TARGET_FORM)
  })
})
