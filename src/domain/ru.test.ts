import { afterEach, describe, expect, it } from 'vitest'
import { dayGroupTitle, formatDateTime, formatDayTitle, monthName, monthTitle, plural, dayMonth, shortDay, weekdayName } from './ru'

describe('dayGroupTitle', () => {
  it('сегодня, вчера, иначе день недели', () => {
    expect(dayGroupTitle('2026-11-18', '2026-11-18')).toBe('Сегодня, 18 ноября')
    expect(dayGroupTitle('2026-11-17', '2026-11-18')).toBe('Вчера, 17 ноября')
    expect(dayGroupTitle('2026-11-16', '2026-11-18')).toBe('Понедельник, 16 ноября')
  })
})

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

describe('monthName', () => {
  it('месяц строчными с годом', () => {
    expect(monthName('2026-11')).toBe('ноябрь 2026')
    expect(monthName('2027-01')).toBe('январь 2027')
  })
})

describe('shortDay', () => {
  it('число и сокращённый месяц', () => {
    expect(shortDay('2026-10-25')).toBe('25 окт')
    expect(shortDay('2026-05-03')).toBe('3 мая')
    expect(shortDay('2027-01-01')).toBe('1 янв')
  })
})

describe('dayMonth', () => {
  it('число и месяц в родительном падеже', () => {
    expect(dayMonth('2026-10-25')).toBe('25 октября')
    expect(dayMonth('2026-09-01')).toBe('1 сентября')
  })
})
