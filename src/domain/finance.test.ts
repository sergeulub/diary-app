import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CATEGORIES, activeCategories, categoriesByUse, createCategory, createTransaction, dayTotals,
  netSaved,
  deleteTransaction, groupByDay, importanceShares, monthSummary, moveCategory, nextImportance, savingsBalance,
  setCategoryArchived, updateCategory, updateTransaction,
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
  it('updateTransaction: явный undefined в патче не затирает поля', () => {
    const t = txRec('2026-11-02', { amount: 45000, note: 'кофе' })
    const u = updateTransaction(t, { amount: undefined, day: undefined, categoryKey: undefined, note: undefined }, NOW)
    expect(u).toMatchObject({ amount: 45000, day: '2026-11-02', categoryKey: 'groceries', note: 'кофе', updatedAt: NOW })
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

  it('доход, траты; без операций накоплений «отложено» = 0', () => {
    expect([s.income, s.expense, s.saved]).toEqual([5_000_000, 260000, 0])
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
  it('dayTotals — живые операции дня', () => {
    expect(dayTotals(txs, '2026-11-02')).toEqual({ income: 0, expense: 125000, expenseCount: 2 })
    expect(dayTotals(txs, '2026-11-04')).toEqual({ income: 0, expense: 0, expenseCount: 0 })
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

describe('накопления', () => {
  const ops = [
    txRec('2026-11-02', { kind: 'income', categoryKey: 'salary', amount: 5_000_000 }),
    txRec('2026-11-03', { amount: 260000 }),
    txRec('2026-11-05', { kind: 'save', categoryKey: '', amount: 1_000_000 }),
    txRec('2026-11-07', { kind: 'withdraw', categoryKey: '', amount: 300000 }),
    txRec('2026-10-20', { kind: 'save', categoryKey: '', amount: 500000 }),
    txRec('2026-11-08', { kind: 'save', categoryKey: '', amount: 999, deletedAt: T0 }),
  ]
  it('«Отложено» месяца — отложил минус взял, доход и траты без накоплений', () => {
    const s = monthSummary(ops, cats, '2026-11')
    expect([s.income, s.expense, s.saved]).toEqual([5_000_000, 260000, 700000])
    expect(s.byImportance.need + s.byImportance.useful + s.byImportance.optional).toBe(260000)
    expect(s.expenseByCategory.map((c) => c.key)).not.toContain('')
    expect(s.incomeByCategory.map((c) => c.key)).not.toContain('')
  })
  it('взял больше, чем отложил, — отрицательно', () => {
    const take = [txRec('2026-11-07', { kind: 'withdraw', categoryKey: '', amount: 300 })]
    expect(monthSummary(take, cats, '2026-11').saved).toBe(-300)
    expect(savingsBalance(take)).toBe(-300)
  })
  it('баланс за всё время без удалённых', () => expect(savingsBalance(ops)).toBe(1_200_000))
  it('netSaved — отложил минус взял по переданному списку', () => {
    expect(netSaved(ops.filter((t) => t.day.startsWith('2026-11')))).toBe(700000)
  })
  it('правка операции накоплений сохраняет вид и пустую категорию', () => {
    const t = createTransaction({ kind: 'withdraw', amount: 300000, categoryKey: '', day: '2026-11-07', note: 'ремонт' }, T0)
    const u = updateTransaction(t, { amount: 250000, categoryKey: '', day: '2026-11-06', note: '' }, NOW)
    expect(u).toMatchObject({ id: t.id, kind: 'withdraw', categoryKey: '', amount: 250000, day: '2026-11-06', updatedAt: NOW })
    expect('note' in u).toBe(false)
  })
  it('сумма трат дня и группы без накоплений', () => {
    const day = [txRec('2026-11-05', { amount: 100 }), txRec('2026-11-05', { kind: 'save', categoryKey: '', amount: 5000 })]
    expect(dayTotals(day, '2026-11-05')).toEqual({ income: 0, expense: 100, expenseCount: 1 })
    expect(groupByDay(day, '2026-11')[0]).toMatchObject({ expense: 100, income: 0 })
    expect(groupByDay(day, '2026-11')[0].items).toHaveLength(2)
  })
  it('createTransaction: у накоплений категория пустая, у трат обязательна', () => {
    expect(createTransaction({ kind: 'save', amount: 100, categoryKey: 'x', day: '2026-11-05' }, T0).categoryKey).toBe('')
    expect(() => createTransaction({ kind: 'expense', amount: 100, categoryKey: '', day: '2026-11-05' }, T0))
      .toThrow('Не выбрана категория')
  })
})
