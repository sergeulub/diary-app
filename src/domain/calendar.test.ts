import { describe, expect, it } from 'vitest'
import { dayCellState, monthGrid, shiftMonth } from './calendar'
import { dayRec } from './testFixtures'

describe('monthGrid', () => {
  it('октябрь 2026 начинается с четверга — три пустые ячейки', () => {
    const cells = monthGrid(2026, 9)
    expect(cells.slice(0, 4)).toEqual([null, null, null, '2026-10-01'])
    expect(cells).toHaveLength(35)
    expect(cells.filter(Boolean)).toHaveLength(31)
    expect(cells[33]).toBe('2026-10-31')
    expect(cells[34]).toBeNull()
  })
  it('февраль 2027 ровно в четыре недели', () => {
    const cells = monthGrid(2027, 1)
    expect(cells).toHaveLength(28)
    expect(cells[0]).toBe('2027-02-01')
    expect(cells[27]).toBe('2027-02-28')
  })
  it('месяц с воскресенья — шесть пустых в начале', () => {
    const cells = monthGrid(2026, 2)
    expect(cells.indexOf('2026-03-01')).toBe(6)
  })
})

describe('shiftMonth', () => {
  it('переходит через год в обе стороны', () => {
    expect(shiftMonth({ year: 2026, month0: 11 }, 1)).toEqual({ year: 2027, month0: 0 })
    expect(shiftMonth({ year: 2027, month0: 0 }, -1)).toEqual({ year: 2026, month0: 11 })
  })
})

describe('dayCellState', () => {
  const today = '2026-10-06'
  it('будущее', () => {
    expect(dayCellState('2026-10-07', undefined, today, 'mood')).toEqual({ kind: 'future' })
  })
  it('нет записи или она пустая', () => {
    expect(dayCellState('2026-10-05', undefined, today, 'mood')).toEqual({ kind: 'empty' })
    expect(dayCellState('2026-10-05', dayRec('2026-10-05'), today, 'mood')).toEqual({ kind: 'empty' })
  })
  it('есть настроение — цвет', () => {
    expect(dayCellState(today, dayRec(today, { metrics: { mood: 4 } }), today, 'mood')).toEqual({ kind: 'mood', value: 4 })
  })
  it('заполнен без настроения — точка', () => {
    expect(dayCellState(today, dayRec(today, { text: 'Гулял' }), today, 'mood')).toEqual({ kind: 'filled' })
  })
  it('главная метрика не шкала — точка', () => {
    expect(dayCellState(today, dayRec(today, { metrics: { mood: '23:00' } }), today, 'mood')).toEqual({ kind: 'filled' })
  })
})
