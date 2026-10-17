import Dexie, { type EntityTable } from 'dexie'
import type { DayRecord, EntryRecord, FinanceCategory, Goal, MetricDefinition, PhotoRecord, Transaction } from '../domain/types'

export interface MetaRow {
  key: string
  value: unknown
}

/** Единственное место, где открывается IndexedDB. Импортировать только внутри src/db/. */
export const db = new Dexie('diary') as Dexie & {
  days: EntityTable<DayRecord, 'day'>
  metricDefinitions: EntityTable<MetricDefinition, 'key'>
  entries: EntityTable<EntryRecord, 'id'>
  meta: EntityTable<MetaRow, 'key'>
  financeCategories: EntityTable<FinanceCategory, 'key'>
  transactions: EntityTable<Transaction, 'id'>
  goals: EntityTable<Goal, 'id'>
  photos: EntityTable<PhotoRecord, 'id'>
}

// Схема меняется только добавлением db.version(2).stores(...).upgrade(...); версию 1 после релиза не править.
db.version(1).stores({
  days: 'day, updatedAt',
  metricDefinitions: 'key',
  entries: 'id, day, updatedAt',
  meta: 'key',
})

// Финансы и цели. Новая база получает schemaVersion 2 из DEFAULT_META; существующая — здесь.
db.version(2)
  .stores({
    financeCategories: 'key',
    transactions: 'id, day, updatedAt',
    goals: 'id, month, updatedAt',
  })
  .upgrade((tx) => tx.table('meta').put({ key: 'schemaVersion', value: 2 }))

// Разборы насмотренности: строки entries с kind 'review' (таблица уже есть) и их фото.
db.version(3)
  .stores({ photos: 'id, entryId, day, updatedAt' })
  .upgrade((tx) => tx.table('meta').put({ key: 'schemaVersion', value: 3 }))
