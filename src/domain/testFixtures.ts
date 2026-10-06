import type { DayRecord } from './types'

export const T0 = '2026-10-01T22:00:00.000+03:00'

export function dayRec(day: string, patch: Partial<DayRecord> = {}): DayRecord {
  return { day, id: `id-${day}`, metrics: {}, text: '', createdAt: T0, updatedAt: T0, deletedAt: null, ...patch }
}
