import Dexie from 'dexie'
import { isoWithOffset } from '../domain/dates'
import type { ImportPlan } from '../domain/importFormat'
import { DEFAULT_CATEGORIES, sortCategories } from '../domain/finance'
import { logicalDay } from '../domain/logicalDay'
import { DEFAULT_METRICS, isDayComplete, isDayFilled, sortMetrics } from '../domain/metrics'
import {
  applyReviewPatch, createPhoto, createReview, deletePhoto, deleteReview, livePhotos, reviewsOfDay, type ReviewPatch,
} from '../domain/reviews'
import type {
  DayRecord, DiarySnapshot, EntryRecord, FinanceCategory, Goal, Meta, MetricDefinition, MetricValue, PhotoRecord,
  Transaction,
} from '../domain/types'
import { db } from './database'

const DEFAULT_META: Meta = { boundaryHour: 6, lastExportAt: null, schemaVersion: 3 }

export async function initDb(): Promise<void> {
  await db.transaction('rw', db.metricDefinitions, db.meta, db.financeCategories, async () => {
    if ((await db.metricDefinitions.count()) === 0) await db.metricDefinitions.bulkAdd(DEFAULT_METRICS)
    if ((await db.financeCategories.count()) === 0) await db.financeCategories.bulkAdd(DEFAULT_CATEGORIES)
    const present = new Set((await db.meta.toArray()).map((r) => r.key))
    const missing = Object.entries(DEFAULT_META)
      .filter(([key]) => !present.has(key))
      .map(([key, value]) => ({ key, value }))
    if (missing.length) await db.meta.bulkAdd(missing)
  })
  // база экрана проверок Фазы 0 больше не нужна
  Dexie.delete('diary-probe').catch(() => {})
}

export async function getMeta(): Promise<Meta> {
  const rows = await db.meta.toArray()
  return { ...DEFAULT_META, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) } as Meta
}

export async function setMeta<K extends keyof Meta>(key: K, value: Meta[K]): Promise<void> {
  await db.meta.put({ key, value })
}

export async function getMetrics(): Promise<MetricDefinition[]> {
  return sortMetrics(await db.metricDefinitions.toArray())
}

export async function saveMetrics(defs: MetricDefinition[]): Promise<void> {
  await db.metricDefinitions.bulkPut(defs)
}

export async function getFinanceCategories(): Promise<FinanceCategory[]> {
  return sortCategories(await db.financeCategories.toArray())
}

export async function saveFinanceCategories(cats: FinanceCategory[]): Promise<void> {
  await db.financeCategories.bulkPut(cats)
}

export async function saveTransaction(tx: Transaction): Promise<void> {
  await db.transactions.put(tx)
}

/** Операции с from по to включительно, вместе с удалёнными: отбирает домен. */
export async function listTransactions(from: string, to: string): Promise<Transaction[]> {
  return db.transactions.where('day').between(from, to, true, true).toArray()
}

export async function saveGoals(goals: Goal[]): Promise<void> {
  await db.goals.bulkPut(goals)
}

/** Цели месяца вместе с удалёнными: отбирает домен (goalsOfMonth). */
export async function listGoals(month: string): Promise<Goal[]> {
  return db.goals.where('month').equals(month).toArray()
}

export async function getDay(day: string): Promise<DayRecord | undefined> {
  return db.days.get(day)
}

export async function listDays(from: string, to: string): Promise<DayRecord[]> {
  return db.days.where('day').between(from, to, true, true).toArray()
}

export async function listFilledDays(): Promise<string[]> {
  return (await db.days.toArray()).filter(isDayFilled).map((d) => d.day)
}

/** Дни, засчитанные в серию: полностью заполнены в свой логический день. */
export async function listStreakDays(): Promise<string[]> {
  return (await db.days.toArray()).filter((d) => d.completedAt && !d.deletedAt).map((d) => d.day)
}

export interface DayPatch {
  /** null удаляет значение метрики. */
  metrics?: Record<string, MetricValue | null>
  text?: string
}

/**
 * Чтение и запись в одной транзакции: одновременные сохранения метрики и текста не затирают друг друга.
 * Если день впервые стал полным в свой логический день — ставит completedAt (день идёт в серию).
 */
export async function saveDay(day: string, patch: DayPatch, now: Date): Promise<DayRecord> {
  const stamp = isoWithOffset(now)
  return db.transaction('rw', [db.days, db.metricDefinitions, db.meta], async () => {
    const current = await db.days.get(day)
    const metrics = { ...(current?.metrics ?? {}) }
    for (const [key, value] of Object.entries(patch.metrics ?? {})) {
      if (value === null) delete metrics[key]
      else metrics[key] = value
    }
    const rec: DayRecord = {
      day,
      id: current?.id ?? crypto.randomUUID(),
      metrics,
      text: patch.text ?? current?.text ?? '',
      createdAt: current?.createdAt ?? stamp,
      updatedAt: stamp,
      deletedAt: null,
      ...(current?.completedAt ? { completedAt: current.completedAt } : {}),
    }
    if (!rec.completedAt) {
      const { boundaryHour } = await getMeta()
      if (logicalDay(now, boundaryHour) === day && isDayComplete(rec, await db.metricDefinitions.toArray())) {
        rec.completedAt = stamp
      }
    }
    await db.days.put(rec)
    return rec
  })
}

export async function addReview(day: string, now: Date): Promise<EntryRecord> {
  const review = createReview(day, isoWithOffset(now))
  await db.entries.add(review)
  return review
}

/** Чтение и запись в одной транзакции: сохранения разных полей не затирают друг друга. */
export async function saveReview(id: string, patch: ReviewPatch, now: Date): Promise<void> {
  await db.transaction('rw', db.entries, async () => {
    const current = await db.entries.get(id)
    if (!current) throw new Error('Разбор не найден')
    await db.entries.put(applyReviewPatch(current, patch, isoWithOffset(now)))
  })
}

/** Мягко удаляет разбор и все его фото. */
export async function removeReview(id: string, now: Date): Promise<void> {
  const stamp = isoWithOffset(now)
  await db.transaction('rw', db.entries, db.photos, async () => {
    const current = await db.entries.get(id)
    if (!current) return
    await db.entries.put(deleteReview(current, stamp))
    const photos = livePhotos(await db.photos.where('entryId').equals(id).toArray(), id)
    await db.photos.bulkPut(photos.map((p) => deletePhoto(p, stamp)))
  })
}

/** Живые разборы дня по порядку создания. */
export async function listReviews(day: string): Promise<EntryRecord[]> {
  return reviewsOfDay(await db.entries.where('day').equals(day).toArray(), day)
}

/** Записи с from по to включительно, вместе с удалёнными: отбирает домен. */
export async function listEntries(from: string, to: string): Promise<EntryRecord[]> {
  return db.entries.where('day').between(from, to, true, true).toArray()
}

/** Фото — изменение разбора: его updatedAt сдвигается, и день попадает в следующий Markdown. */
export async function addPhoto(entryId: string, type: string, bytes: Uint8Array, now: Date): Promise<PhotoRecord> {
  const stamp = isoWithOffset(now)
  return db.transaction('rw', db.entries, db.photos, async () => {
    const entry = await db.entries.get(entryId)
    if (!entry) throw new Error('Разбор не найден')
    const photo = createPhoto(entry, type, bytes, stamp)
    await db.photos.add(photo)
    await db.entries.put({ ...entry, updatedAt: stamp })
    return photo
  })
}

export async function removePhoto(id: string, now: Date): Promise<void> {
  const stamp = isoWithOffset(now)
  await db.transaction('rw', db.entries, db.photos, async () => {
    const photo = await db.photos.get(id)
    if (!photo || photo.deletedAt) return
    await db.photos.put(deletePhoto(photo, stamp))
    const entry = await db.entries.get(photo.entryId)
    if (entry) await db.entries.put({ ...entry, updatedAt: stamp })
  })
}

/** Живые фото записи по порядку добавления. */
export async function listPhotos(entryId: string): Promise<PhotoRecord[]> {
  return livePhotos(await db.photos.where('entryId').equals(entryId).toArray(), entryId)
}

/** Фото с from по to включительно, вместе с удалёнными. */
export async function listPhotosBetween(from: string, to: string): Promise<PhotoRecord[]> {
  return db.photos.where('day').between(from, to, true, true).toArray()
}

export async function exportSnapshot(): Promise<DiarySnapshot> {
  const tables = [db.days, db.metricDefinitions, db.entries, db.meta, db.financeCategories, db.transactions, db.goals, db.photos]
  return db.transaction('r', tables, async () => ({
    metricDefinitions: await db.metricDefinitions.toArray(),
    days: await db.days.toArray(),
    entries: await db.entries.toArray(),
    financeCategories: await db.financeCategories.toArray(),
    transactions: await db.transactions.toArray(),
    goals: await db.goals.toArray(),
    photos: await db.photos.toArray(),
    meta: await getMeta(),
  }))
}

export async function applyImport(plan: ImportPlan): Promise<void> {
  const tables = [db.days, db.metricDefinitions, db.entries, db.financeCategories, db.transactions, db.goals]
  await db.transaction('rw', tables, async () => {
    await db.days.bulkPut(plan.days.put)
    await db.metricDefinitions.bulkPut(plan.metricDefinitions.put)
    await db.entries.bulkPut(plan.entries.put)
    await db.financeCategories.bulkPut(plan.financeCategories.put)
    await db.transactions.bulkPut(plan.transactions.put)
    await db.goals.bulkPut(plan.goals.put)
  })
}
