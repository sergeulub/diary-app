import Dexie from 'dexie'
import { isoWithOffset } from '../domain/dates'
import type { ImportPlan } from '../domain/importFormat'
import { logicalDay } from '../domain/logicalDay'
import { DEFAULT_METRICS, isDayComplete, isDayFilled, sortMetrics } from '../domain/metrics'
import type { DayRecord, DiarySnapshot, Meta, MetricDefinition, MetricValue } from '../domain/types'
import { db } from './database'

const DEFAULT_META: Meta = { boundaryHour: 6, lastExportAt: null, schemaVersion: 1 }

export async function initDb(): Promise<void> {
  await db.transaction('rw', db.metricDefinitions, db.meta, async () => {
    if ((await db.metricDefinitions.count()) === 0) await db.metricDefinitions.bulkAdd(DEFAULT_METRICS)
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

export async function exportSnapshot(): Promise<DiarySnapshot> {
  return db.transaction('r', [db.days, db.metricDefinitions, db.entries, db.meta], async () => ({
    metricDefinitions: await db.metricDefinitions.toArray(),
    days: await db.days.toArray(),
    entries: await db.entries.toArray(),
    meta: await getMeta(),
  }))
}

export async function applyImport(plan: ImportPlan): Promise<void> {
  await db.transaction('rw', [db.days, db.metricDefinitions, db.entries], async () => {
    await db.days.bulkPut(plan.days.put)
    await db.metricDefinitions.bulkPut(plan.metricDefinitions.put)
    await db.entries.bulkPut(plan.entries.put)
  })
}
