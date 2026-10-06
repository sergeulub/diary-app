import { afterEach, describe, expect, it } from 'vitest'
import { formatDate, logicalDay } from './logicalDay'

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min)

describe('logicalDay', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('днём возвращает текущую дату', () => {
    expect(logicalDay(at(2026, 10, 6, 10), 6)).toBe('2026-10-06')
  })
  it('05:59 относится к предыдущему дню', () => {
    expect(logicalDay(at(2026, 10, 6, 5, 59), 6)).toBe('2026-10-05')
  })
  it('06:00 — уже новый день', () => {
    expect(logicalDay(at(2026, 10, 6, 6, 0), 6)).toBe('2026-10-06')
  })
  it('после полуночи 1 января — 31 декабря прошлого года', () => {
    expect(logicalDay(at(2027, 1, 1, 0, 30), 6)).toBe('2026-12-31')
  })
  it('1 марта невисокосного года → 28 февраля', () => {
    expect(logicalDay(at(2027, 3, 1, 2), 6)).toBe('2027-02-28')
  })
  it('граница 0 — обычная полночь', () => {
    expect(logicalDay(at(2026, 10, 6, 0, 30), 0)).toBe('2026-10-06')
  })
  it.each(['Europe/Moscow', 'America/New_York', 'Pacific/Auckland', 'Asia/Kolkata'])(
    'считает по местному времени в поясе %s',
    (tz) => {
      process.env.TZ = tz
      expect(logicalDay(at(2026, 10, 6, 1), 6)).toBe('2026-10-05')
      expect(logicalDay(at(2026, 10, 6, 7), 6)).toBe('2026-10-06')
    },
  )
})

describe('formatDate', () => {
  it('дополняет месяц и день нулями', () => {
    expect(formatDate(at(2026, 3, 5, 12))).toBe('2026-03-05')
  })
})
