import type { DayRecord, Transaction } from './types'

export const T0 = '2026-10-01T22:00:00.000+03:00'

export function dayRec(day: string, patch: Partial<DayRecord> = {}): DayRecord {
  return { day, id: `id-${day}`, metrics: {}, text: '', createdAt: T0, updatedAt: T0, deletedAt: null, ...patch }
}

let seq = 0

/** Трата 100 ₽ «Продукты»; id уникален в пределах прогона. */
export function txRec(day: string, patch: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${++seq}`, day, kind: 'expense', amount: 10000, categoryKey: 'groceries',
    createdAt: T0, updatedAt: T0, deletedAt: null, ...patch,
  }
}
