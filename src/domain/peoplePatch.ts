import {
  CONTACT_LABELS, createNote, createPerson, findByName, foldText, isLive, linkPair, mergeSphere, updateNote, updatePerson,
  type PersonFields,
} from './people'
import type {
  AppliedPatch, Circle, Contact, ContactType, PeopleData, Person, PersonLink, PersonNote, PersonNoteKind, Sphere,
} from './types'

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

export type OpStatus = 'ok' | 'conflict' | 'blocked'

export interface PlannedOp {
  index: number
  op: PatchOp
  status: OpStatus
  reason: string
  /** id или tempId человека — для группировки; '' у операций со сферами. */
  personId: string
  /** «Было» и «станет» по именам полей, строками для показа. */
  before: Record<string, string>
  after: Record<string, string>
  editable: boolean
  /** tempId новых людей, без которых операция не применяется. */
  dependsOn: string[]
}

export interface PatchPlan {
  patch: PeoplePatch
  ops: PlannedOp[]
  alreadyApplied: boolean
}

/** Решение пользователя по операции: галочка и правка (та же форма, что у предложения файла). */
export interface Decision {
  selected: boolean
  set?: Record<string, unknown>
}
export type Decisions = Record<number, Decision>

const GONE = 'Удалён в телефоне — применить нельзя'
const CHANGED = 'Изменена в телефоне после выгрузки'
const EDITABLE = new Set<PatchOp['op']>(['createPerson', 'updatePerson', 'updateNote', 'addNote', 'upsertDiaryNote', 'renameSphere'])

const sameMoment = (a: string, b: string) => Date.parse(a) === Date.parse(b)
const contactsText = (cs: Contact[]) => cs.map((c) => `${CONTACT_LABELS[c.type]} ${c.value}`).join(' · ')

/** Значение поля карточки строкой — так же, как его показывает предпросмотр. */
function personValue(field: string, p: Person, data: PeopleData): string {
  switch (field) {
    case 'aliases': return p.aliases.join(', ')
    case 'spheres': return p.sphereKeys.flatMap((k) => data.spheres.find((s) => s.key === k)?.name ?? []).join(', ')
    case 'circle': return data.circles.find((c) => c.key === p.circleKey)?.name ?? ''
    case 'contacts': return contactsText(p.contacts)
    case 'archived': return p.archived ? 'да' : 'нет'
    default: return String(p[field as keyof Person] ?? '')
  }
}

function inputValue(field: string, value: unknown): string {
  if (field === 'contacts') return contactsText(value as Contact[])
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  return String(value ?? '')
}

const inputText = (input: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(input).filter(([k]) => k !== 'kind').map(([k, v]) => [k, inputValue(k, v)]))

/** Сферы и круг сопоставляются по названию без учёта регистра. */
const sameValue = (field: string, a: string, b: string) =>
  field === 'spheres' || field === 'circle' ? foldText(a) === foldText(b) : a === b
const isNoop = (before: Record<string, string>, after: Record<string, string>) =>
  Object.keys(after).every((k) => sameValue(k, before[k] ?? '', after[k]))

export function planPatch(patch: PeoplePatch, data: PeopleData, applied: AppliedPatch[]): PatchPlan {
  const livePerson = (id: string) => data.people.find((p) => p.id === id && isLive(p))
  const newNames = new Map(patch.ops.flatMap((o) => (o.op === 'createPerson' ? [[o.tempId, o.person.name] as const] : [])))
  const nameOf = (ref: string) => (isTempId(ref) ? newNames.get(ref) : livePerson(ref)?.name) ?? ''
  /** Ссылка на человека: новый из файла — годится, существующий — только живой. */
  const refOk = (ref: string) => isTempId(ref) || !!livePerson(ref)

  const ops = patch.ops.map((op, index): PlannedOp => {
    let status: OpStatus = 'ok'
    let reason = ''
    let personId = ''
    let before: Record<string, string> = {}
    let after: Record<string, string> = {}
    const block = (why: string) => { status = 'blocked'; reason = why }
    const conflict = () => { status = 'conflict'; reason = CHANGED }
    switch (op.op) {
      case 'createPerson':
        personId = op.tempId
        after = inputText(op.person)
        break
      case 'updatePerson': {
        personId = op.id
        after = inputText(op.set)
        const p = livePerson(op.id)
        if (!p) { block(GONE); break }
        before = Object.fromEntries(Object.keys(after).map((k) => [k, personValue(k, p, data)]))
        if (!isNoop(before, after) && !sameMoment(p.updatedAt, op.baseUpdatedAt)) conflict()
        break
      }
      case 'updateNote': {
        after = inputText(op.set)
        const n = data.personNotes.find((x) => x.id === op.id && isLive(x))
        personId = n?.personId ?? ''
        if (!n || !livePerson(n.personId)) { block(GONE); break }
        before = Object.fromEntries(Object.keys(after).map((k) => [k, String(n[k as keyof PersonNote] ?? '')]))
        if (!isNoop(before, after) && n.patchId !== patch.id && !sameMoment(n.updatedAt, op.baseUpdatedAt)) conflict()
        break
      }
      case 'addNote':
        personId = op.personId
        after = inputText(op.note)
        if (!refOk(op.personId)) block(GONE)
        break
      case 'upsertDiaryNote': {
        personId = op.personId
        after = { day: op.day, talk: op.talk }
        if (!refOk(op.personId)) { block(GONE); break }
        const n = data.personNotes.find((x) => x.personId === op.personId && x.kind === 'diary' && x.day === op.day && isLive(x))
        if (!n) break
        before = { day: n.day, talk: n.talk }
        if (n.talk !== op.talk && n.patchId !== patch.id && Date.parse(n.updatedAt) > Date.parse(patch.basedOnExportAt)) conflict()
        break
      }
      case 'mergePeople': {
        personId = op.intoId
        const from = livePerson(op.fromId)
        const into = livePerson(op.intoId)
        if (!from || !into) { block(GONE); break }
        if (from.id === into.id) { block('Нельзя объединить человека с самим собой'); break }
        before = { name: from.name }
        after = { name: into.name }
        if (!sameMoment(from.updatedAt, op.baseUpdatedAt.from) || !sameMoment(into.updatedAt, op.baseUpdatedAt.into)) conflict()
        break
      }
      case 'linkPeople':
        personId = op.a
        after = { a: nameOf(op.a), b: nameOf(op.b) }
        if (!refOk(op.a) || !refOk(op.b)) block(GONE)
        else if (op.a === op.b) block('Нельзя связать человека с самим собой')
        break
      case 'renameSphere': {
        before = { name: op.name }
        after = { name: op.newName }
        const s = findByName(op.name, data.spheres)
        const other = findByName(op.newName, data.spheres)
        if (!s) block(`Сферы «${op.name}» нет`)
        else if (other && other.key !== s.key) block(`Сфера «${op.newName}» уже есть — объедините их`)
        break
      }
      case 'mergeSpheres': {
        before = { name: op.from }
        after = { name: op.into }
        const from = findByName(op.from, data.spheres)
        const into = findByName(op.into, data.spheres)
        if (!from) block(`Сферы «${op.from}» нет`)
        else if (!into) block(`Сферы «${op.into}» нет`)
        else if (from.key === into.key) block(`«${op.from}» и «${op.into}» — одна и та же сфера`)
        break
      }
    }
    const dependsOn = [...new Set(personRefs(op).filter(isTempId))]
    return { index, op, status, reason, personId, before, after, editable: EDITABLE.has(op.op), dependsOn }
  })
  return { patch, ops, alreadyApplied: applied.some((a) => a.id === patch.id) }
}

/** По умолчанию отмечены операции без конфликтов. */
export function defaultDecisions(plan: PatchPlan): Decisions {
  return Object.fromEntries(plan.ops.map((o) => [o.index, { selected: o.status === 'ok' }]))
}

/** Что применится на самом деле: заблокированные — никогда; зависящие от снятого нового человека — нет. */
export function effectiveSelection(plan: PatchPlan, decisions: Decisions): boolean[] {
  const chosen = (o: PlannedOp) => o.status !== 'blocked' && (decisions[o.index]?.selected ?? o.status === 'ok')
  const created = new Set(plan.ops.filter((o) => o.op.op === 'createPerson' && chosen(o)).map((o) => o.personId))
  return plan.ops.map((o) => chosen(o) && o.dependsOn.every((t) => created.has(t)))
}

export interface PatchCounts {
  applied: number
  /** Из применённых — с правкой пользователя. */
  edited: number
  skipped: number
}

export interface PatchResult {
  /** Только созданные и изменённые записи; события файл не трогает. */
  changes: PeopleData
  applied: AppliedPatch
  counts: PatchCounts
}

const MERGED_TEXT = ['company', 'position', 'about', 'canHelp', 'iCanHelp', 'personal'] as const
const uniq = <T>(xs: T[]) => [...new Set(xs)]

/** Рабочая копия таблицы: изменения видны следующим операциям и собираются в результат. */
function table<T>(rows: T[], key: (x: T) => string) {
  const all = new Map(rows.map((x) => [key(x), x]))
  const touched = new Set<string>()
  return {
    get: (k: string) => all.get(k),
    values: () => [...all.values()],
    put: (x: T) => { all.set(key(x), x); touched.add(key(x)) },
    changed: () => [...touched].map((k) => all.get(k)!),
  }
}

/**
 * Применяет выбранные операции по порядку файла. Id создаваемых записей выводятся из id файла и номера операции,
 * поэтому повторное применение перезаписывает, а не дублирует.
 */
export function applyPlan(plan: PatchPlan, decisions: Decisions, data: PeopleData, now: string): PatchResult {
  const { patch } = plan
  const selected = effectiveSelection(plan, decisions)
  const people = table(data.people, (p) => p.id)
  const notes = table(data.personNotes, (n) => n.id)
  const spheres = table(data.spheres, (s) => s.key)
  const circles = table(data.circles, (c) => c.key)
  const links = table(data.personLinks, (l) => l.id)
  const opId = (index: number) => derivedId(`${patch.id}:${index}`)
  const tempIds = new Map(plan.ops.flatMap((o) => (o.op.op === 'createPerson' ? [[o.op.tempId, opId(o.index)] as const] : [])))
  const resolve = (ref: string) => tempIds.get(ref) ?? ref

  const sphereKey = (name: string): string => {
    const found = findByName(name, spheres.values())
    if (found) return found.key
    const key = derivedId(`sphere:${foldText(name.trim())}`)
    const s: Sphere = { key, name: name.trim(), createdAt: spheres.get(key)?.createdAt ?? now, updatedAt: now, deletedAt: null }
    spheres.put(s)
    return key
  }
  const circleKey = (name: string): string => {
    if (!name.trim()) return ''
    const found = findByName(name, circles.values())
    if (found) return found.key
    const key = derivedId(`circle:${foldText(name.trim())}`)
    const order = Math.max(0, ...circles.values().map((c) => c.order)) + 1
    const c: Circle = { key, name: name.trim(), order, archived: false, createdAt: circles.get(key)?.createdAt ?? now, updatedAt: now, deletedAt: null }
    circles.put(c)
    return key
  }
  const toFields = ({ spheres: names, circle, ...rest }: PersonInput): Partial<PersonFields> => ({
    ...rest,
    ...(names ? { sphereKeys: uniq(names.filter((n) => n.trim()).map(sphereKey)) } : {}),
    ...(circle !== undefined ? { circleKey: circleKey(circle) } : {}),
  })
  const noteFields = (n: NoteInput) => ({
    ...(n.day !== undefined ? { day: n.day } : {}),
    ...Object.fromEntries((['occasion', 'talk', 'life', 'agreements', 'original'] as const).flatMap((k) => (n[k] !== undefined ? [[k, n[k]]] : []))),
  })

  const mergeInto = (fromId: string, intoId: string) => {
    const from = people.get(fromId)
    const into = people.get(intoId)
    if (!from || !into || !isLive(from) || !isLive(into)) return
    const texts = Object.fromEntries(MERGED_TEXT.map((k) => {
      const a = into[k].trim()
      const b = from[k].trim()
      return [k, !a ? from[k] : !b || a === b ? into[k] : `${into[k]}\n${from[k]}`]
    }))
    const contacts = [...into.contacts, ...from.contacts]
      .filter((c, i, all) => all.findIndex((x) => x.type === c.type && x.value === c.value) === i)
    people.put({
      ...into, ...texts, contacts,
      aliases: uniq([...into.aliases, ...(from.name !== into.name ? [from.name] : []), ...from.aliases]).filter((a) => a !== into.name),
      sphereKeys: uniq([...into.sphereKeys, ...from.sphereKeys]),
      circleKey: into.circleKey || from.circleKey,
      updatedAt: now,
    })
    people.put({ ...from, deletedAt: now, updatedAt: now })
    for (const n of notes.values()) if (n.personId === fromId) notes.put({ ...n, personId: intoId, updatedAt: now })
    for (const l of links.values()) {
      if (!isLive(l) || (l.a !== fromId && l.b !== fromId)) continue
      const pair = linkPair(intoId, l.a === fromId ? l.b : l.a)
      const dup = pair && links.values().some((x) => x.id !== l.id && isLive(x) && x.a === pair[0] && x.b === pair[1])
      links.put(!pair || dup ? { ...l, deletedAt: now, updatedAt: now } : { ...l, a: pair[0], b: pair[1], updatedAt: now })
    }
  }

  plan.ops.forEach((po, i) => {
    if (!selected[i]) return
    const edit = decisions[po.index]?.set
    const op = po.op
    switch (op.op) {
      case 'createPerson': {
        const input = { ...op.person, ...(edit as PersonInput | undefined) }
        const id = opId(po.index)
        const name = input.name?.trim() ? input.name : op.person.name
        people.put({ ...createPerson({ ...toFields(input), name }, now), id, createdAt: people.get(id)?.createdAt ?? now })
        break
      }
      case 'updatePerson': {
        const p = people.get(op.id)
        if (p && isLive(p)) people.put(updatePerson(p, toFields({ ...op.set, ...(edit as PersonInput | undefined) }), now))
        break
      }
      case 'updateNote': {
        const n = notes.get(op.id)
        if (n && isLive(n)) notes.put({ ...updateNote(n, noteFields({ ...op.set, ...(edit as NoteInput | undefined) }), now), patchId: patch.id })
        break
      }
      case 'addNote': {
        const input = { ...op.note, ...(edit as NoteInput | undefined) }
        const id = opId(po.index)
        const n = createNote(resolve(op.personId), op.note.kind, { ...noteFields(input), day: input.day ?? op.note.day }, now)
        notes.put({ ...n, id, patchId: patch.id, createdAt: notes.get(id)?.createdAt ?? now })
        break
      }
      case 'upsertDiaryNote': {
        const personId = resolve(op.personId)
        const talk = typeof edit?.talk === 'string' ? edit.talk : op.talk
        const existing = notes.values().find((n) => n.personId === personId && n.kind === 'diary' && n.day === op.day && isLive(n))
        if (existing) notes.put({ ...existing, talk, patchId: patch.id, updatedAt: now })
        else notes.put({ ...createNote(personId, 'diary', { day: op.day, talk }, now), id: opId(po.index), patchId: patch.id })
        break
      }
      case 'mergePeople':
        mergeInto(op.fromId, op.intoId)
        break
      case 'linkPeople': {
        const pair = linkPair(resolve(op.a), resolve(op.b))
        if (!pair || links.values().some((l) => isLive(l) && l.a === pair[0] && l.b === pair[1])) break
        const id = derivedId(`link:${pair[0]}:${pair[1]}`)
        const link: PersonLink = { id, a: pair[0], b: pair[1], createdAt: links.get(id)?.createdAt ?? now, updatedAt: now, deletedAt: null }
        links.put(link)
        break
      }
      case 'renameSphere': {
        const s = findByName(op.name, spheres.values())
        const newName = typeof edit?.newName === 'string' && edit.newName.trim() ? edit.newName : op.newName
        if (s) spheres.put({ ...s, name: newName.trim(), updatedAt: now })
        break
      }
      case 'mergeSpheres': {
        const from = findByName(op.from, spheres.values())
        const into = findByName(op.into, spheres.values())
        if (!from || !into || from.key === into.key) break
        for (const p of mergeSphere(from.key, into.key, people.values(), now)) people.put(p)
        spheres.put({ ...from, deletedAt: now, updatedAt: now })
        break
      }
    }
  })

  const applied = selected.filter(Boolean).length
  return {
    changes: {
      people: people.changed(), personNotes: notes.changed(), events: [], spheres: spheres.changed(),
      circles: circles.changed(), personLinks: links.changed(),
    },
    applied: { id: patch.id, appliedAt: now, basedOnExportAt: patch.basedOnExportAt },
    counts: {
      applied,
      edited: plan.ops.filter((o, i) => selected[i] && decisions[o.index]?.set).length,
      skipped: plan.ops.length - applied,
    },
  }
}
