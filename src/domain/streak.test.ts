import { describe, expect, it } from 'vitest'
import { streak, streakLabel } from './streak'

const set = (...days: string[]) => new Set(days)

describe('streak', () => {
  it('пустой дневник — 0', () => {
    expect(streak(set(), '2026-10-06')).toEqual({ count: 0, todayFilled: false })
  })
  it('первый день — 1', () => {
    expect(streak(set('2026-10-06'), '2026-10-06')).toEqual({ count: 1, todayFilled: true })
  })
  it('сегодня и два дня до — 3, через границу месяца', () => {
    expect(streak(set('2026-09-30', '2026-10-01', '2026-10-02'), '2026-10-02')).toEqual({ count: 3, todayFilled: true })
  })
  it('сегодня пусто — считаем от вчера, серия не обнуляется', () => {
    expect(streak(set('2026-10-04', '2026-10-05'), '2026-10-06')).toEqual({ count: 2, todayFilled: false })
  })
  it('разрыв обрывает серию', () => {
    expect(streak(set('2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06'), '2026-10-06').count).toBe(3)
  })
  it('пустой вчерашний день закончился — серия 0', () => {
    expect(streak(set('2026-10-03', '2026-10-04'), '2026-10-06').count).toBe(0)
  })
  it('будущие дни не считаются', () => {
    expect(streak(set('2026-10-06', '2026-10-07'), '2026-10-06').count).toBe(1)
  })
})

describe('streakLabel', () => {
  it('сегодня заполнено — только число', () => {
    expect(streakLabel({ count: 12, todayFilled: true })).toEqual({ chip: '12 дней', hint: null })
  })
  it('сегодня пусто — подсказка продлить', () => {
    expect(streakLabel({ count: 21, todayFilled: false })).toEqual({
      chip: '21 день', hint: 'Заполни сегодня все метрики и 40+ символов текста, чтобы продлить',
    })
  })
  it('серии нет — подсказка начать', () => {
    expect(streakLabel({ count: 0, todayFilled: false })).toEqual({
      chip: '0 дней', hint: 'Заполни сегодня все метрики и 40+ символов текста, чтобы начать серию',
    })
  })
})
