import { DEFAULT_CIRCLES } from './people'
import type {
  DayRecord, EntryRecord, Goal, PeopleData, PeopleEvent, Person, PersonLink, PersonNote, PhotoRecord, Sphere, Transaction,
} from './types'

export const T0 = '2026-10-01T22:00:00.000+03:00'

/** Модуль «Люди» без данных — для снимков в тестах экспорта и импорта. */
export const EMPTY_PEOPLE: PeopleData = { people: [], personNotes: [], events: [], spheres: [], circles: [], personLinks: [] }

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

/** Человек «Иван Петров» без остальных полей — «не дополнено». */
export function personRec(patch: Partial<Person> = {}): Person {
  return {
    id: `person-${++seq}`, name: 'Иван Петров', aliases: [], company: '', position: '', about: '', sphereKeys: [],
    circleKey: '', canHelp: '', iCanHelp: '', personal: '', contacts: [], archived: false,
    createdAt: T0, updatedAt: T0, deletedAt: null, ...patch,
  }
}

/** Пустая встреча 25 октября. */
export function noteRec(personId: string, patch: Partial<PersonNote> = {}): PersonNote {
  return {
    id: `note-${++seq}`, personId, kind: 'meeting', day: '2026-10-25', occasion: '', eventId: '', talk: '', life: '',
    agreements: '', original: '', patchId: '', createdAt: T0, updatedAt: T0, deletedAt: null, ...patch,
  }
}

export function eventRec(patch: Partial<PeopleEvent> = {}): PeopleEvent {
  return {
    id: `event-${++seq}`, day: '2026-10-25', title: 'Встреча клуба', topic: '',
    createdAt: T0, updatedAt: T0, deletedAt: null, ...patch,
  }
}

export function sphereRec(key: string, name: string, patch: Partial<Sphere> = {}): Sphere {
  return { key, name, createdAt: T0, updatedAt: T0, deletedAt: null, ...patch }
}

export function linkRec(a: string, b: string, patch: Partial<PersonLink> = {}): PersonLink {
  return { id: `link-${++seq}`, a, b, createdAt: T0, updatedAt: T0, deletedAt: null, ...patch }
}

/** Живое фото записи из трёх байтов. */
export function photoRec(entryId: string, patch: Partial<PhotoRecord> = {}): PhotoRecord {
  return {
    id: `photo-${++seq}`, entryId, day: '2026-10-17', type: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]),
    createdAt: T0, updatedAt: T0, deletedAt: null, ...patch,
  }
}

/** Пример из ТЗ Б4 — все девять операций. */
export function samplePatch(): Record<string, unknown> & { ops: Record<string, unknown>[] } {
  return {
    kind: 'people-patch', patchVersion: 1, id: 'patch-1',
    createdAt: '2026-10-26T12:00:00+03:00', basedOnExportAt: '2026-10-25T23:10:00+03:00',
    summary: 'Разбор 19–25.10: 1 заметка, 1 запись из дневника, 1 объединение',
    ops: [
      { op: 'createPerson', tempId: 'new-1', person: { name: 'Олег Белов', company: 'Луч', spheres: ['аналитика'], circle: 'Однокурсник / друг' } },
      { op: 'updatePerson', id: 'ivan', baseUpdatedAt: T0, set: { position: 'Управляющий партнёр', spheres: ['консалтинг'] } },
      { op: 'updateNote', id: 'note-ivan', baseUpdatedAt: T0, set: { talk: 'О стажировке', life: 'Подкаст', agreements: 'Резюме' } },
      { op: 'addNote', personId: 'new-1', note: { kind: 'meeting', day: '2026-10-20', occasion: 'кофе', talk: 'Об аналитике' } },
      { op: 'upsertDiaryNote', personId: 'ivan', day: '2026-10-18', talk: 'Ходили в кино' },
      { op: 'mergePeople', fromId: 'dima', intoId: 'dmitry', baseUpdatedAt: { from: T0, into: T0 } },
      { op: 'linkPeople', a: 'new-1', b: 'ivan' },
      { op: 'renameSphere', name: 'Консалтинг', newName: 'консалтинг' },
      { op: 'mergeSpheres', from: 'консалт', into: 'консалтинг' },
    ],
  }
}

/** Телефон к моменту файла samplePatch: всё не менялось после выгрузки. */
export function patchData(): PeopleData {
  return {
    ...EMPTY_PEOPLE,
    people: [
      personRec({ id: 'ivan', name: 'Иван Петров', position: 'Партнёр' }),
      personRec({ id: 'dima', name: 'Дмитрий', aliases: ['Дима из клуба'] }),
      personRec({ id: 'dmitry', name: 'Дмитрий Соколов' }),
    ],
    personNotes: [noteRec('ivan', { id: 'note-ivan', original: 'Заметка' })],
    spheres: [sphereRec('s-kons', 'консалтинг'), sphereRec('s-konsalt', 'консалт')],
    circles: DEFAULT_CIRCLES,
  }
}
