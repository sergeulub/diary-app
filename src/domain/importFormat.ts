import { strFromU8, unzipSync } from 'fflate'
import { isLater } from './dates'
import { FORMAT_VERSION } from './exportFormat'
import { IMPORTANCES, SAVINGS_KINDS, isSavings } from './finance'
import { AREAS, isGoalTarget, isMonth } from './goals'
import { validateMetricValue } from './metrics'
import { MAX_AMOUNT } from './money'
import type {
  Circle, Contact, ContactType, DayRecord, DiarySnapshot, EntryRecord, FaceKind, FinanceCategory, FinanceKind, Goal,
  GoalArea, Importance, Meta, MetricDefinition, MetricType, MetricValue, PeopleEvent, Person, PersonLink, PersonNote,
  PhotoRecord, Sphere, Transaction, TransactionKind,
} from './types'

/** Ошибка импорта с текстом для пользователя. */
export class ImportError extends Error {}

/** Бэкап, прочитанный из файла: весь дневник, фото — с байтами из архива. */
export interface ImportedBackup extends DiarySnapshot {
  formatVersion: number
  exportedAt: string
}

/** Принимает zip экспорта или голый backup.json; files — остальные файлы архива (фото). */
export function extractArchive(bytes: Uint8Array): { json: string; files: Record<string, Uint8Array> } {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b // «PK»
  if (!isZip) return { json: strFromU8(bytes), files: {} }
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new ImportError('Архив повреждён')
  }
  const backup = files['backup.json']
  if (!backup) throw new ImportError('В архиве нет backup.json')
  return { json: strFromU8(backup), files }
}

export const extractBackupJson = (bytes: Uint8Array): string => extractArchive(bytes).json

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string'
const isStamp = (x: unknown): x is string => isStr(x) && !Number.isNaN(Date.parse(x))
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TYPES: MetricType[] = ['scale', 'time', 'number', 'bool']
const BAD_FIELDS = 'не хватает полей или они неверного типа'

function parseMetric(x: unknown, i: number): MetricDefinition {
  const where = `Метрика №${i + 1}`
  if (
    !isObj(x) || !isStr(x.key) || !x.key || !isStr(x.name) || !TYPES.includes(x.type as MetricType) ||
    typeof x.order !== 'number' || !isStamp(x.createdAt) || !isStamp(x.updatedAt) ||
    (x.unit !== undefined && !isStr(x.unit)) ||
    (x.face !== undefined && x.face !== 'mood' && x.face !== 'boredom')
  ) {
    throw new ImportError(`${where}: ${BAD_FIELDS}`)
  }
  return {
    key: x.key,
    name: x.name,
    type: x.type as MetricType,
    ...(isStr(x.unit) ? { unit: x.unit } : {}),
    order: x.order,
    archived: x.archived === true,
    primary: x.primary === true,
    ...(x.face ? { face: x.face as FaceKind } : {}),
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
  }
}

function parseDayRecord(x: unknown, i: number, defs: Map<string, MetricDefinition>): DayRecord {
  if (!isObj(x) || !isStr(x.day) || !DAY_RE.test(x.day)) throw new ImportError(`День №${i + 1}: неверная дата`)
  const where = `День ${x.day}`
  if (
    !isStr(x.id) || !isObj(x.metrics) || !isStr(x.text) || !isStamp(x.createdAt) || !isStamp(x.updatedAt) ||
    !(x.deletedAt === null || x.deletedAt === undefined || isStamp(x.deletedAt)) ||
    !(x.completedAt === undefined || isStamp(x.completedAt))
  ) {
    throw new ImportError(`${where}: ${BAD_FIELDS}`)
  }
  const metrics: Record<string, MetricValue> = {}
  for (const [key, value] of Object.entries(x.metrics)) {
    const def = defs.get(key)
    const ok = def ? validateMetricValue(def, value) : ['number', 'string', 'boolean'].includes(typeof value)
    if (!ok) throw new ImportError(`${where}: недопустимое значение «${def?.name ?? key}»`)
    metrics[key] = value as MetricValue
  }
  return {
    day: x.day,
    id: x.id,
    metrics,
    text: x.text,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
    deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
    ...(isStamp(x.completedAt) ? { completedAt: x.completedAt } : {}),
  }
}

const optStr = (x: unknown) => x === undefined || isStr(x)

function parseEntry(x: unknown, i: number): EntryRecord {
  if (
    !isObj(x) || !isStr(x.id) || !isStr(x.day) || !isStr(x.text) || !isStamp(x.createdAt) ||
    !isStamp(x.updatedAt) || !(x.deletedAt === null || x.deletedAt === undefined || isStamp(x.deletedAt)) ||
    !(x.kind === undefined || x.kind === 'review') || !optStr(x.verdict) || !optStr(x.change)
  ) {
    throw new ImportError(`Запись №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    id: x.id, day: x.day,
    ...(x.kind === 'review' ? { kind: 'review' as const } : {}),
    text: x.text,
    ...(isStr(x.verdict) ? { verdict: x.verdict } : {}),
    ...(isStr(x.change) ? { change: x.change } : {}),
    createdAt: x.createdAt, updatedAt: x.updatedAt,
    deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

/** Живое фото без файла в архиве (импорт голого backup.json) пропускается — null. */
function parsePhoto(x: unknown, i: number, files: Record<string, Uint8Array>): PhotoRecord | null {
  if (
    !isObj(x) || !isStr(x.id) || !x.id || !isStr(x.entryId) || !isStr(x.day) || !DAY_RE.test(x.day) || !isStr(x.type) ||
    !(x.file === null || x.file === undefined || isStr(x.file)) ||
    !isStamp(x.createdAt) || !isStamp(x.updatedAt) || !isDeletedAt(x.deletedAt)
  ) {
    throw new ImportError(`Фото №${i + 1}: ${BAD_FIELDS}`)
  }
  const deletedAt = isStamp(x.deletedAt) ? x.deletedAt : null
  const bytes = deletedAt ? new Uint8Array(0) : isStr(x.file) ? files[x.file] : undefined
  if (!bytes) return null
  return {
    id: x.id, entryId: x.entryId, day: x.day, type: x.type, bytes,
    createdAt: x.createdAt, updatedAt: x.updatedAt, deletedAt,
  }
}

const KINDS: FinanceKind[] = ['expense', 'income']
const TX_KINDS: TransactionKind[] = [...KINDS, ...SAVINGS_KINDS]
const isDeletedAt = (x: unknown) => x === null || x === undefined || isStamp(x)

function parseCategory(x: unknown, i: number): FinanceCategory {
  if (
    !isObj(x) || !isStr(x.key) || !x.key || !KINDS.includes(x.kind as FinanceKind) || !isStr(x.name) ||
    typeof x.order !== 'number' || !isStamp(x.createdAt) || !isStamp(x.updatedAt) ||
    (x.kind === 'expense' && !IMPORTANCES.includes(x.importance as Importance))
  ) {
    throw new ImportError(`Категория №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    key: x.key,
    kind: x.kind as FinanceKind,
    name: x.name,
    ...(x.kind === 'expense' ? { importance: x.importance as Importance } : {}),
    order: x.order,
    archived: x.archived === true,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
  }
}

/** Операции накоплений появились в формате 4: в файлах старше их быть не может. */
function parseTransaction(x: unknown, i: number, formatVersion: number): Transaction {
  if (
    !isObj(x) || !isStr(x.id) || !x.id || !isStr(x.day) || !DAY_RE.test(x.day) ||
    !TX_KINDS.includes(x.kind as TransactionKind) || (formatVersion < 4 && isSavings(x.kind as TransactionKind)) ||
    typeof x.amount !== 'number' || !Number.isInteger(x.amount) || x.amount <= 0 || x.amount > MAX_AMOUNT ||
    !isStr(x.categoryKey) || !x.categoryKey !== isSavings(x.kind as TransactionKind) || (x.note !== undefined && !isStr(x.note)) ||
    !isStamp(x.createdAt) || !isStamp(x.updatedAt) || !isDeletedAt(x.deletedAt)
  ) {
    throw new ImportError(`Операция №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    id: x.id,
    day: x.day,
    kind: x.kind as TransactionKind,
    amount: x.amount,
    categoryKey: x.categoryKey,
    ...(isStr(x.note) ? { note: x.note } : {}),
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
    deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

function parseGoal(x: unknown, i: number): Goal {
  if (
    !isObj(x) || !isStr(x.id) || !x.id || !isMonth(x.month) || !isStr(x.text) || !AREAS.includes(x.area as GoalArea) ||
    (x.target !== undefined && !isGoalTarget(x.target)) || typeof x.order !== 'number' ||
    !isStamp(x.createdAt) || !isStamp(x.updatedAt) || !isDeletedAt(x.deletedAt)
  ) {
    throw new ImportError(`Цель №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    id: x.id,
    month: x.month,
    text: x.text,
    area: x.area as GoalArea,
    ...(isGoalTarget(x.target) ? { target: x.target } : {}),
    order: x.order,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
    deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

const CONTACT_TYPES: ContactType[] = ['phone', 'telegram', 'email', 'linkedin', 'other']
const isStrList = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr)
const isContact = (x: unknown): x is Contact => isObj(x) && CONTACT_TYPES.includes(x.type as ContactType) && isStr(x.value)
const str = (x: unknown) => (isStr(x) ? x : '')
const PERSON_TEXT = ['company', 'position', 'about', 'circleKey', 'canHelp', 'iCanHelp', 'personal'] as const

function parsePerson(x: unknown, i: number): Person {
  if (
    !isObj(x) || !isStr(x.id) || !x.id || !isStr(x.name) || !x.name.trim() || !PERSON_TEXT.every((k) => optStr(x[k])) ||
    !(x.aliases === undefined || isStrList(x.aliases)) || !(x.sphereKeys === undefined || isStrList(x.sphereKeys)) ||
    !(x.contacts === undefined || (Array.isArray(x.contacts) && x.contacts.every(isContact))) ||
    !isStamp(x.createdAt) || !isStamp(x.updatedAt) || !isDeletedAt(x.deletedAt)
  ) {
    throw new ImportError(`Человек №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    id: x.id, name: x.name,
    aliases: isStrList(x.aliases) ? x.aliases : [],
    company: str(x.company), position: str(x.position), about: str(x.about),
    sphereKeys: isStrList(x.sphereKeys) ? x.sphereKeys : [],
    circleKey: str(x.circleKey), canHelp: str(x.canHelp), iCanHelp: str(x.iCanHelp), personal: str(x.personal),
    contacts: Array.isArray(x.contacts) ? x.contacts.filter(isContact).map((c) => ({ type: c.type, value: c.value })) : [],
    archived: x.archived === true,
    createdAt: x.createdAt, updatedAt: x.updatedAt, deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

const NOTE_TEXT = ['occasion', 'eventId', 'talk', 'life', 'agreements', 'original', 'patchId'] as const

function parseNote(x: unknown, i: number): PersonNote {
  if (
    !isObj(x) || !isStr(x.id) || !x.id || !isStr(x.personId) || !x.personId || (x.kind !== 'meeting' && x.kind !== 'diary') ||
    !isStr(x.day) || !DAY_RE.test(x.day) || !NOTE_TEXT.every((k) => optStr(x[k])) ||
    !isStamp(x.createdAt) || !isStamp(x.updatedAt) || !isDeletedAt(x.deletedAt)
  ) {
    throw new ImportError(`Запись о человеке №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    id: x.id, personId: x.personId, kind: x.kind, day: x.day,
    occasion: str(x.occasion), eventId: str(x.eventId), talk: str(x.talk), life: str(x.life),
    agreements: str(x.agreements), original: str(x.original), patchId: str(x.patchId),
    createdAt: x.createdAt, updatedAt: x.updatedAt, deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

function parseEvent(x: unknown, i: number): PeopleEvent {
  if (
    !isObj(x) || !isStr(x.id) || !x.id || !isStr(x.day) || !DAY_RE.test(x.day) || !isStr(x.title) || !optStr(x.topic) ||
    !isStamp(x.createdAt) || !isStamp(x.updatedAt) || !isDeletedAt(x.deletedAt)
  ) {
    throw new ImportError(`Событие №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    id: x.id, day: x.day, title: x.title, topic: str(x.topic),
    createdAt: x.createdAt, updatedAt: x.updatedAt, deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

function parseSphere(x: unknown, i: number): Sphere {
  if (!isObj(x) || !isStr(x.key) || !x.key || !isStr(x.name) || !isStamp(x.createdAt) || !isStamp(x.updatedAt) || !isDeletedAt(x.deletedAt)) {
    throw new ImportError(`Сфера №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    key: x.key, name: x.name,
    createdAt: x.createdAt, updatedAt: x.updatedAt, deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

function parseCircle(x: unknown, i: number): Circle {
  if (
    !isObj(x) || !isStr(x.key) || !x.key || !isStr(x.name) || typeof x.order !== 'number' ||
    !isStamp(x.createdAt) || !isStamp(x.updatedAt) || !isDeletedAt(x.deletedAt)
  ) {
    throw new ImportError(`Круг №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    key: x.key, name: x.name, order: x.order, archived: x.archived === true,
    createdAt: x.createdAt, updatedAt: x.updatedAt, deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

function parseLink(x: unknown, i: number): PersonLink {
  if (
    !isObj(x) || !isStr(x.id) || !x.id || !isStr(x.a) || !x.a || !isStr(x.b) || !x.b || x.a === x.b ||
    !isStamp(x.createdAt) || !isStamp(x.updatedAt) || !isDeletedAt(x.deletedAt)
  ) {
    throw new ImportError(`Связь №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    id: x.id, a: x.a, b: x.b,
    createdAt: x.createdAt, updatedAt: x.updatedAt, deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])

function parseMeta(x: unknown): Meta {
  const m = isObj(x) ? x : {}
  return {
    boundaryHour: typeof m.boundaryHour === 'number' ? m.boundaryHour : 6,
    lastExportAt: isStamp(m.lastExportAt) ? m.lastExportAt : null,
    schemaVersion: typeof m.schemaVersion === 'number' ? m.schemaVersion : 1,
  }
}

export function parseImport(json: string, files: Record<string, Uint8Array> = {}): ImportedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(json.replace(/^﻿/, ''))
  } catch {
    throw new ImportError('Файл не похож на бэкап дневника: это не JSON')
  }
  if (!isObj(raw) || typeof raw.formatVersion !== 'number') {
    throw new ImportError('Файл не похож на бэкап дневника: нет formatVersion')
  }
  if (raw.formatVersion > FORMAT_VERSION) {
    throw new ImportError(
      `Бэкап сделан более новой версией приложения (формат ${raw.formatVersion}). Обновите приложение и повторите импорт.`,
    )
  }
  if (!Array.isArray(raw.days) || !Array.isArray(raw.metricDefinitions)) {
    throw new ImportError('В бэкапе нет списка дней или метрик')
  }
  const metricDefinitions = raw.metricDefinitions.map(parseMetric)
  const defs = new Map(metricDefinitions.map((d) => [d.key, d]))
  return {
    formatVersion: raw.formatVersion,
    exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : '',
    metricDefinitions,
    days: raw.days.map((d, i) => parseDayRecord(d, i, defs)),
    entries: list(raw.entries).map(parseEntry),
    financeCategories: list(raw.financeCategories).map(parseCategory),
    transactions: list(raw.transactions).map((t, i) => parseTransaction(t, i, raw.formatVersion as number)),
    goals: list(raw.goals).map(parseGoal),
    photos: list(raw.photos).flatMap((p, i) => parsePhoto(p, i, files) ?? []),
    // «Люди» появились в формате 5: в файлах старше этих массивов нет — пустые
    people: list(raw.people).map(parsePerson),
    personNotes: list(raw.personNotes).map(parseNote),
    events: list(raw.events).map(parseEvent),
    spheres: list(raw.spheres).map(parseSphere),
    circles: list(raw.circles).map(parseCircle),
    personLinks: list(raw.personLinks).map(parseLink),
    meta: parseMeta(raw.meta),
  }
}

export interface MergePart<T> {
  put: T[]
  added: number
  updated: number
}

export interface ImportPlan {
  days: MergePart<DayRecord>
  metricDefinitions: MergePart<MetricDefinition>
  entries: MergePart<EntryRecord>
  financeCategories: MergePart<FinanceCategory>
  transactions: MergePart<Transaction>
  goals: MergePart<Goal>
  photos: MergePart<PhotoRecord>
  people: MergePart<Person>
  personNotes: MergePart<PersonNote>
  events: MergePart<PeopleEvent>
  spheres: MergePart<Sphere>
  circles: MergePart<Circle>
  personLinks: MergePart<PersonLink>
}

/** Слияние по ключу: нового нет — добавить; в файле свежее `updatedAt` — заменить; иначе оставить своё. */
function mergeBy<T extends { updatedAt: string }>(current: T[], incoming: T[], key: (x: T) => string): MergePart<T> {
  const byKey = new Map(current.map((x) => [key(x), x]))
  const part: MergePart<T> = { put: [], added: 0, updated: 0 }
  for (const item of incoming) {
    const existing = byKey.get(key(item))
    if (!existing) part.added++
    else if (isLater(item.updatedAt, existing.updatedAt)) part.updated++
    else continue
    part.put.push(item)
    byKey.set(key(item), item)
  }
  return part
}

export function planImport(current: Omit<DiarySnapshot, 'meta'>, incoming: ImportedBackup): ImportPlan {
  return {
    days: mergeBy(current.days, incoming.days, (d) => d.day),
    metricDefinitions: mergeBy(current.metricDefinitions, incoming.metricDefinitions, (d) => d.key),
    entries: mergeBy(current.entries, incoming.entries, (e) => e.id),
    financeCategories: mergeBy(current.financeCategories, incoming.financeCategories, (c) => c.key),
    transactions: mergeBy(current.transactions, incoming.transactions, (t) => t.id),
    goals: mergeBy(current.goals, incoming.goals, (g) => g.id),
    photos: mergeBy(current.photos, incoming.photos, (p) => p.id),
    people: mergeBy(current.people, incoming.people, (p) => p.id),
    personNotes: mergeBy(current.personNotes, incoming.personNotes, (n) => n.id),
    events: mergeBy(current.events, incoming.events, (e) => e.id),
    spheres: mergeBy(current.spheres, incoming.spheres, (s) => s.key),
    circles: mergeBy(current.circles, incoming.circles, (c) => c.key),
    personLinks: mergeBy(current.personLinks, incoming.personLinks, (l) => l.id),
  }
}

export function importSize(plan: ImportPlan): number {
  return Object.values(plan).reduce((n, part: MergePart<unknown>) => n + part.put.length, 0)
}

const describePart = (label: string, p: MergePart<unknown>) =>
  `${label}: будет добавлено ${p.added}, обновлено ${p.updated}.`

export function describeImport(plan: ImportPlan): string {
  if (importSize(plan) === 0) return 'Нечего импортировать: всё это уже есть в дневнике.'
  const parts = [describePart('Дней', plan.days), describePart('Метрик', plan.metricDefinitions)]
  const extra: [string, MergePart<unknown>][] = [
    ['Категорий', plan.financeCategories], ['Операций', plan.transactions], ['Целей', plan.goals],
    ['Разборов', plan.entries], ['Фото', plan.photos],
    ['Людей', plan.people], ['Записей о людях', plan.personNotes], ['Событий', plan.events],
  ]
  for (const [label, p] of extra) if (p.put.length) parts.push(describePart(label, p))
  return parts.join(' ')
}
