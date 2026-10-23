import Dexie, { type EntityTable } from 'dexie'
import type {
  Circle, DayRecord, EntryRecord, FinanceCategory, Goal, MetricDefinition, PeopleEvent, Person, PersonLink, PersonNote,
  PhotoRecord, Sphere, Transaction,
} from '../domain/types'

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
  people: EntityTable<Person, 'id'>
  personNotes: EntityTable<PersonNote, 'id'>
  events: EntityTable<PeopleEvent, 'id'>
  spheres: EntityTable<Sphere, 'key'>
  circles: EntityTable<Circle, 'key'>
  personLinks: EntityTable<PersonLink, 'id'>
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

// Модуль «Люди». Круги по умолчанию засевает initDb — и в новой базе, и в обновлённой.
db.version(4)
  .stores({
    people: 'id, updatedAt',
    personNotes: 'id, personId, day, eventId, updatedAt',
    events: 'id, day, updatedAt',
    spheres: 'key',
    circles: 'key',
    personLinks: 'id, a, b',
  })
  .upgrade((tx) => tx.table('meta').put({ key: 'schemaVersion', value: 4 }))
