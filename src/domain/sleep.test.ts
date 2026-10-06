import { describe, expect, it } from 'vitest'
import { formatDuration, sleepDuration } from './sleep'

describe('sleepDuration', () => {
  it('через полночь: 23:40 → 07:10 = 7 ч 30 мин', () => {
    expect(sleepDuration('23:40', '07:10')).toBe(450)
  })
  it('после полуночи в тот же день', () => {
    expect(sleepDuration('00:30', '08:00')).toBe(450)
  })
  it('«Встал» = «Лёг» — целые сутки (правило «Встал ≤ Лёг»)', () => {
    expect(sleepDuration('22:00', '22:00')).toBe(24 * 60)
  })
  it('нет одного из значений или мусор — null', () => {
    expect(sleepDuration('23:40', undefined)).toBeNull()
    expect(sleepDuration(undefined, '07:10')).toBeNull()
    expect(sleepDuration('25:00', '07:10')).toBeNull()
    expect(sleepDuration(4, '07:10')).toBeNull()
  })
})

describe('formatDuration', () => {
  it.each([
    [450, '7 ч 30 мин'],
    [480, '8 ч'],
    [45, '45 мин'],
    [1440, '24 ч'],
  ])('%i → %s', (min, text) => {
    expect(formatDuration(min)).toBe(text)
  })
})
