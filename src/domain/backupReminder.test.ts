import { describe, expect, it } from 'vitest'
import { needsBackupReminder } from './backupReminder'

const now = new Date('2026-10-13T22:00:00.000+03:00')

describe('needsBackupReminder', () => {
  it('меньше трёх заполненных дней — молчит', () => {
    expect(needsBackupReminder(null, 2, now)).toBe(false)
  })
  it('экспорта не было, а записей ≥ 3 — напоминает', () => {
    expect(needsBackupReminder(null, 3, now)).toBe(true)
  })
  it('ровно 7 дней — ещё рано', () => {
    expect(needsBackupReminder('2026-10-06T22:00:00.000+03:00', 10, now)).toBe(false)
  })
  it('больше 7 дней — напоминает', () => {
    expect(needsBackupReminder('2026-10-06T21:59:00.000+03:00', 10, now)).toBe(true)
  })
  it('смещение экспорта другое — считает по моменту времени', () => {
    // 2026-10-06T19:30Z — 7 дней минус 30 минут
    expect(needsBackupReminder('2026-10-06T20:30:00.000+01:00', 10, now)).toBe(false)
  })
})
