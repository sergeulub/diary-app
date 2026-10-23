import type { PersonFields } from './people'
import type { Contact, ContactType, PersonNote, PersonNoteKind } from './types'

/** Ошибка файла изменений с текстом для пользователя. */
export class PatchError extends Error {}

/** Поля карточки из файла: сферы и круг — по названию. */
export type PersonInput = Partial<Omit<PersonFields, 'sphereKeys' | 'circleKey'>> & { spheres?: string[]; circle?: string }
export type NoteInput = Partial<Pick<PersonNote, 'day' | 'occasion' | 'talk' | 'life' | 'agreements' | 'original'>>

export type PatchOp =
  | { op: 'createPerson'; tempId: string; person: PersonInput & { name: string } }
  | { op: 'updatePerson'; id: string; baseUpdatedAt: string; set: PersonInput }
  | { op: 'updateNote'; id: string; baseUpdatedAt: string; set: NoteInput }
  | { op: 'addNote'; personId: string; note: NoteInput & { kind: PersonNoteKind; day: string } }
  | { op: 'upsertDiaryNote'; personId: string; day: string; talk: string }
  | { op: 'mergePeople'; fromId: string; intoId: string; baseUpdatedAt: { from: string; into: string } }
  | { op: 'linkPeople'; a: string; b: string }
  | { op: 'renameSphere'; name: string; newName: string }
  | { op: 'mergeSpheres'; from: string; into: string }

export interface PeoplePatch {
  kind: 'people-patch'
  patchVersion: number
  id: string
  createdAt: string
  basedOnExportAt: string
  summary: string
  ops: PatchOp[]
}

const PATCH_VERSION = 1
/** tempId нового человека и ссылки на него начинаются с new-. */
export const isTempId = (s: string) => s.startsWith('new-')

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string'
const isId = (x: unknown): x is string => isStr(x) && x.trim() !== ''
const isStamp = (x: unknown): x is string => isStr(x) && !Number.isNaN(Date.parse(x))
const optStr = (x: unknown) => x === undefined || isStr(x)
const isStrList = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr)
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const isDay = (x: unknown): x is string => isStr(x) && DAY_RE.test(x)
const CONTACT_TYPES: ContactType[] = ['phone', 'telegram', 'email', 'linkedin', 'other']
const isContact = (x: unknown): x is Contact => isObj(x) && CONTACT_TYPES.includes(x.type as ContactType) && isStr(x.value)

const PERSON_TEXT = ['name', 'company', 'position', 'about', 'canHelp', 'iCanHelp', 'personal', 'circle'] as const
const NOTE_TEXT = ['occasion', 'talk', 'life', 'agreements', 'original'] as const

/** Только известные поля нужного типа; лишние отбрасываются. */
function personInput(x: unknown): PersonInput | null {
  if (
    !isObj(x) || !PERSON_TEXT.every((k) => optStr(x[k])) || (isStr(x.name) && !x.name.trim()) ||
    !(x.aliases === undefined || isStrList(x.aliases)) || !(x.spheres === undefined || isStrList(x.spheres)) ||
    !(x.contacts === undefined || (Array.isArray(x.contacts) && x.contacts.every(isContact))) ||
    !(x.archived === undefined || typeof x.archived === 'boolean')
  ) return null
  const out: PersonInput = {}
  for (const k of PERSON_TEXT) if (isStr(x[k])) out[k] = x[k]
  if (isStrList(x.aliases)) out.aliases = x.aliases
  if (isStrList(x.spheres)) out.spheres = x.spheres
  if (Array.isArray(x.contacts)) out.contacts = x.contacts.filter(isContact).map((c) => ({ type: c.type, value: c.value }))
  if (typeof x.archived === 'boolean') out.archived = x.archived
  return out
}

function noteInput(x: unknown): NoteInput | null {
  if (!isObj(x) || !NOTE_TEXT.every((k) => optStr(x[k])) || !(x.day === undefined || isDay(x.day))) return null
  const out: NoteInput = {}
  for (const k of NOTE_TEXT) if (isStr(x[k])) out[k] = x[k]
  if (isDay(x.day)) out.day = x.day
  return out
}

/** Операция нужной формы или null; неизвестная op — PatchError. */
function parseOp(x: unknown, i: number): PatchOp | null {
  if (!isObj(x) || !isStr(x.op)) return null
  switch (x.op) {
    case 'createPerson': {
      const person = personInput(x.person)
      return isStr(x.tempId) && person && isStr(person.name) ? { op: x.op, tempId: x.tempId, person: { ...person, name: person.name } } : null
    }
    case 'updatePerson': {
      const set = personInput(x.set)
      return isId(x.id) && isStamp(x.baseUpdatedAt) && set ? { op: x.op, id: x.id, baseUpdatedAt: x.baseUpdatedAt, set } : null
    }
    case 'updateNote': {
      const set = noteInput(x.set)
      return isId(x.id) && isStamp(x.baseUpdatedAt) && set ? { op: x.op, id: x.id, baseUpdatedAt: x.baseUpdatedAt, set } : null
    }
    case 'addNote': {
      const note = noteInput(x.note)
      const kind = isObj(x.note) ? x.note.kind : undefined
      return isId(x.personId) && note && isDay(note.day) && (kind === 'meeting' || kind === 'diary')
        ? { op: x.op, personId: x.personId, note: { ...note, kind, day: note.day } }
        : null
    }
    case 'upsertDiaryNote':
      return isId(x.personId) && isDay(x.day) && isStr(x.talk) ? { op: x.op, personId: x.personId, day: x.day, talk: x.talk } : null
    case 'mergePeople': {
      const base = x.baseUpdatedAt
      return isId(x.fromId) && isId(x.intoId) && isObj(base) && isStamp(base.from) && isStamp(base.into)
        ? { op: x.op, fromId: x.fromId, intoId: x.intoId, baseUpdatedAt: { from: base.from, into: base.into } }
        : null
    }
    case 'linkPeople':
      return isId(x.a) && isId(x.b) ? { op: x.op, a: x.a, b: x.b } : null
    case 'renameSphere':
      return isId(x.name) && isId(x.newName) ? { op: x.op, name: x.name, newName: x.newName } : null
    case 'mergeSpheres':
      return isId(x.from) && isId(x.into) ? { op: x.op, from: x.from, into: x.into } : null
    default:
      throw new PatchError(`Изменение №${i + 1}: неизвестная операция «${x.op}»`)
  }
}

/** Ссылки на человека, где допустим tempId нового. */
function personRefs(op: PatchOp): string[] {
  if (op.op === 'addNote' || op.op === 'upsertDiaryNote') return [op.personId]
  if (op.op === 'linkPeople') return [op.a, op.b]
  return []
}

const readJson = (json: string): unknown => JSON.parse(json.replace(/^﻿/, ''))

export function isPeoplePatchJson(json: string): boolean {
  try {
    const raw = readJson(json)
    return isObj(raw) && raw.kind === 'people-patch'
  } catch {
    return false
  }
}

export function parsePeoplePatch(json: string): PeoplePatch {
  let raw: unknown
  try {
    raw = readJson(json)
  } catch {
    throw new PatchError('Это не файл изменений: не JSON')
  }
  if (!isObj(raw) || raw.kind !== 'people-patch') throw new PatchError('Это не файл изменений: нет kind')
  if (typeof raw.patchVersion !== 'number' || raw.patchVersion > PATCH_VERSION) {
    throw new PatchError(
      `Файл сделан более новой версией (patchVersion ${String(raw.patchVersion)}). Обновите дневник и откройте файл снова.`,
    )
  }
  if (!isId(raw.id) || !isStamp(raw.createdAt) || !isStamp(raw.basedOnExportAt) || !Array.isArray(raw.ops)) {
    throw new PatchError('Файл изменений повреждён: не хватает полей')
  }
  const ops = raw.ops.map((x, i) => {
    const op = parseOp(x, i)
    if (!op) throw new PatchError(`Изменение №${i + 1}: не хватает полей или они неверного типа`)
    return op
  })
  const temps = new Set<string>()
  ops.forEach((op, i) => {
    if (op.op !== 'createPerson') return
    if (!isTempId(op.tempId) || temps.has(op.tempId)) throw new PatchError(`Изменение №${i + 1}: нет нового человека «${op.tempId}»`)
    temps.add(op.tempId)
  })
  ops.forEach((op, i) => {
    const missing = personRefs(op).find((ref) => isTempId(ref) && !temps.has(ref))
    if (missing) throw new PatchError(`Изменение №${i + 1}: нет нового человека «${missing}»`)
  })
  return {
    kind: 'people-patch', patchVersion: raw.patchVersion, id: raw.id, createdAt: raw.createdAt,
    basedOnExportAt: raw.basedOnExportAt, summary: isStr(raw.summary) ? raw.summary : '', ops,
  }
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

/** Id формата UUID, выведенный из seed: повторное применение файла не плодит записи. */
export function derivedId(seed: string): string {
  const hex = [0, 1, 2, 3].map((k) => fnv1a(`${seed}#${k}`)).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
