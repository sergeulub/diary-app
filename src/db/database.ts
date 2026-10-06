import Dexie, { type EntityTable } from 'dexie'
import type { DayRecord, EntryRecord, MetricDefinition } from '../domain/types'

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
}

// Схема меняется только добавлением db.version(2).stores(...).upgrade(...); версию 1 после релиза не править.
db.version(1).stores({
  days: 'day, updatedAt',
  metricDefinitions: 'key',
  entries: 'id, day, updatedAt',
  meta: 'key',
})
