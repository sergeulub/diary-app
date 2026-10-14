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
