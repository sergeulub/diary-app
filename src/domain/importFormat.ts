import { strFromU8, unzipSync } from 'fflate'
import { isLater } from './dates'
import { FORMAT_VERSION, type Backup } from './exportFormat'
import { validateMetricValue } from './metrics'
import type { DayRecord, DiarySnapshot, EntryRecord, FaceKind, Meta, MetricDefinition, MetricType, MetricValue } from './types'

/** Ошибка импорта с текстом для пользователя. */
export class ImportError extends Error {}

/** Принимает zip экспорта или голый backup.json. */
export function extractBackupJson(bytes: Uint8Array): string {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b // «PK»
  if (!isZip) return strFromU8(bytes)
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new ImportError('Архив повреждён')
  }
  const backup = files['backup.json']
  if (!backup) throw new ImportError('В архиве нет backup.json')
  return strFromU8(backup)
}

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

function parseEntry(x: unknown, i: number): EntryRecord {
  if (
    !isObj(x) || !isStr(x.id) || !isStr(x.day) || !isStr(x.text) || !isStamp(x.createdAt) ||
    !isStamp(x.updatedAt) || !(x.deletedAt === null || x.deletedAt === undefined || isStamp(x.deletedAt))
  ) {
    throw new ImportError(`Запись №${i + 1}: ${BAD_FIELDS}`)
  }
  return {
    id: x.id, day: x.day, text: x.text, createdAt: x.createdAt, updatedAt: x.updatedAt,
    deletedAt: isStamp(x.deletedAt) ? x.deletedAt : null,
  }
}

function parseMeta(x: unknown): Meta {
  const m = isObj(x) ? x : {}
  return {
    boundaryHour: typeof m.boundaryHour === 'number' ? m.boundaryHour : 6,
    lastExportAt: isStamp(m.lastExportAt) ? m.lastExportAt : null,
    schemaVersion: typeof m.schemaVersion === 'number' ? m.schemaVersion : 1,
  }
}

export function parseImport(json: string): Backup {
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
    entries: Array.isArray(raw.entries) ? raw.entries.map(parseEntry) : [],
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

export function planImport(
  current: Pick<DiarySnapshot, 'days' | 'metricDefinitions' | 'entries'>,
  incoming: Backup,
): ImportPlan {
  return {
    days: mergeBy(current.days, incoming.days, (d) => d.day),
    metricDefinitions: mergeBy(current.metricDefinitions, incoming.metricDefinitions, (d) => d.key),
    entries: mergeBy(current.entries, incoming.entries, (e) => e.id),
  }
}

export function importSize(plan: ImportPlan): number {
  return plan.days.put.length + plan.metricDefinitions.put.length + plan.entries.put.length
}

export function describeImport(plan: ImportPlan): string {
  if (importSize(plan) === 0) return 'Нечего импортировать: всё это уже есть в дневнике.'
  const { days, metricDefinitions: m } = plan
  return `Дней: будет добавлено ${days.added}, обновлено ${days.updated}. Метрик: будет добавлено ${m.added}, обновлено ${m.updated}.`
}
