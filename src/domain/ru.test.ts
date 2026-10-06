import { afterEach, describe, expect, it } from 'vitest'
import { formatDateTime, formatDayTitle, monthTitle, plural, weekdayName } from './ru'

const DAYS: [string, string, string] = ['день', 'дня', 'дней']

describe('plural', () => {
  it.each([
    [0, 'дней'], [1, 'день'], [2, 'дня'], [4, 'дня'], [5, 'дней'], [11, 'дней'], [12, 'дней'],
    [14, 'дней'], [21, 'день'], [22, 'дня'], [101, 'день'], [111, 'дней'],
  ])('%i → %s', (n, form) => {
    expect(plural(n, DAYS)).toBe(form)
  })
})

describe('подписи дат', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('день недели', () => {
    expect(weekdayName('2026-10-06')).toBe('вторник')
    expect(weekdayName('2026-10-11')).toBe('воскресенье')
  })
  it('заголовок «Итога»', () => {
    expect(formatDayTitle('2026-10-06')).toBe('Вторник, 6 октября')
    expect(formatDayTitle('2027-01-01')).toBe('Пятница, 1 января')
  })
  it('заголовок месяца', () => {
    expect(monthTitle(2026, 9)).toBe('Октябрь 2026')
  })
  it('дата и время экспорта по местному времени', () => {
    process.env.TZ = 'Europe/Moscow'
    expect(formatDateTime('2026-10-06T22:15:00.000+03:00')).toBe('6 октября 2026, 22:15')
    expect(formatDateTime('2026-10-06T19:05:00.000+00:00')).toBe('6 октября 2026, 22:05')
  })
})
