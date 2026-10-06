import { afterEach, describe, expect, it } from 'vitest'
import { addDays, isLater, isoWithOffset, parseDay } from './dates'

const originalTz = process.env.TZ
afterEach(() => {
  process.env.TZ = originalTz
})

describe('isoWithOffset', () => {
  it.each([
    ['Europe/Moscow', Date.UTC(2026, 9, 6, 19, 15), '2026-10-06T22:15:00.000+03:00'],
    ['Asia/Kolkata', Date.UTC(2026, 9, 6, 16, 45), '2026-10-06T22:15:00.000+05:30'],
    ['America/New_York', Date.UTC(2026, 9, 7, 2, 15), '2026-10-06T22:15:00.000-04:00'],
  ])('в поясе %s пишет местное время и смещение', (tz, utc, expected) => {
    process.env.TZ = tz
    const iso = isoWithOffset(new Date(utc))
    expect(iso).toBe(expected)
    expect(Date.parse(iso)).toBe(utc)
  })
})

describe('parseDay / addDays', () => {
  it('parseDay даёт полдень местного времени', () => {
    const d = parseDay('2026-10-06')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 6, 12])
  })
  it('переходит через год и февраль', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(addDays('2026-10-06', -6)).toBe('2026-09-30')
  })
  it('не сбивается в день перехода на летнее время', () => {
    process.env.TZ = 'Europe/Berlin'
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-03-30', -1)).toBe('2026-03-29')
  })
})

describe('isLater', () => {
  const lastExport = '2026-10-05T23:30:00.000+03:00' // 20:30 UTC
  it('строкой меньше, но по времени позже', () => {
    expect(isLater('2026-10-05T19:45:00.000-01:00', lastExport)).toBe(true) // 20:45 UTC
  })
  it('строкой больше, но по времени раньше', () => {
    expect(isLater('2026-10-06T00:10:00.000+05:00', lastExport)).toBe(false) // 19:10 UTC
  })
  it('одинаковый момент — не позже', () => {
    expect(isLater('2026-10-05T20:30:00.000+00:00', lastExport)).toBe(false)
  })
})
