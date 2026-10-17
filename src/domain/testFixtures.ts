import type { DayRecord, EntryRecord, Goal, PhotoRecord, Transaction } from './types'

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

/** Цель без измерения, сфера «Другое». */
export function goalRec(month: string, patch: Partial<Goal> = {}): Goal {
  return {
    id: `goal-${++seq}`, month, text: 'Цель', area: 'other', order: 1,
    createdAt: T0, updatedAt: T0, deletedAt: null, ...patch,
  }
}

/** Пустой разбор дня. */
export function reviewRec(day: string, patch: Partial<EntryRecord> = {}): EntryRecord {
  return {
    id: `entry-${++seq}`, day, kind: 'review', text: '', verdict: '', change: '',
    createdAt: T0, updatedAt: T0, deletedAt: null, ...patch,
  }
}

/** Живое фото записи из трёх байтов. */
export function photoRec(entryId: string, patch: Partial<PhotoRecord> = {}): PhotoRecord {
  return {
    id: `photo-${++seq}`, entryId, day: '2026-10-17', type: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]),
    createdAt: T0, updatedAt: T0, deletedAt: null, ...patch,
  }
}
