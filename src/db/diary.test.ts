import 'fake-indexeddb/auto' // до импорта Dexie: подменяет indexedDB в Node
import { beforeEach, describe, expect, it } from 'vitest'
import { isoWithOffset } from '../domain/dates'
import { buildBackup } from '../domain/exportFormat'
import { parseImport, planImport } from '../domain/importFormat'
import { DEFAULT_METRICS } from '../domain/metrics'
import { db } from './database'
import {
  applyImport, exportSnapshot, getDay, getMeta, getMetrics, initDb, listDays, listFilledDays, saveDay, saveMetrics, setMeta,
} from './diary'

const at = (d: number, h = 22) => new Date(2026, 9, d, h)

async function freshDb() {
  await db.delete()
  await db.open()
  await initDb()
}

beforeEach(freshDb)

describe('initDb', () => {
  it('засевает четыре метрики и meta по умолчанию', async () => {
    expect((await getMetrics()).map((d) => d.key)).toEqual(['mood', 'boredom', 'sleepStart', 'sleepEnd'])
    expect(await getMeta()).toEqual({ boundaryHour: 6, lastExportAt: null, schemaVersion: 1 })
  })
  it('повторный запуск не дублирует и не затирает правки', async () => {
    await saveMetrics([{ ...DEFAULT_METRICS[1], name: 'Тоска' }])
    await setMeta('boundaryHour', 4)
    await initDb()
    const metrics = await getMetrics()
    expect(metrics).toHaveLength(4)
    expect(metrics[1].name).toBe('Тоска')
    expect((await getMeta()).boundaryHour).toBe(4)
  })
})

describe('saveDay', () => {
  it('создаёт запись с UUID и метками со смещением', async () => {
    const rec = await saveDay('2026-10-05', { metrics: { mood: 4 } }, at(5))
    expect(rec.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(rec.createdAt).toBe(isoWithOffset(at(5)))
    expect(rec.updatedAt).toBe(rec.createdAt)
    expect(rec).toMatchObject({ metrics: { mood: 4 }, text: '', deletedAt: null })
  })
  it('правка сливает метрики, сохраняет id и createdAt, null удаляет значение', async () => {
    const first = await saveDay('2026-10-05', { metrics: { mood: 4, boredom: 2 } }, at(5))
    await saveDay('2026-10-05', { text: 'Вечер' }, at(5, 23))
    const rec = await saveDay('2026-10-05', { metrics: { mood: null, sleepStart: '23:40' } }, at(6, 1))
    expect(rec).toMatchObject({
      id: first.id,
      createdAt: first.createdAt,
      updatedAt: isoWithOffset(at(6, 1)),
      metrics: { boredom: 2, sleepStart: '23:40' },
      text: 'Вечер',
    })
    expect(await getDay('2026-10-05')).toEqual(rec)
  })
  it('параллельные сохранения метрики и текста не теряют друг друга', async () => {
    await Promise.all([
      saveDay('2026-10-05', { metrics: { mood: 3 } }, at(5)),
      saveDay('2026-10-05', { text: 'Одновременно' }, at(5)),
    ])
    expect(await getDay('2026-10-05')).toMatchObject({ metrics: { mood: 3 }, text: 'Одновременно' })
  })
})

describe('выборки дней', () => {
  it('listDays — включительно по границам', async () => {
    for (const d of [1, 2, 3, 4]) await saveDay(`2026-10-0${d}`, { text: 'x' }, at(d))
    expect((await listDays('2026-10-02', '2026-10-03')).map((r) => r.day)).toEqual(['2026-10-02', '2026-10-03'])
  })
  it('listFilledDays пропускает пустые дни', async () => {
    await saveDay('2026-10-01', { metrics: { mood: 3 } }, at(1))
    await saveDay('2026-10-02', { metrics: { mood: 3 } }, at(2))
    await saveDay('2026-10-02', { metrics: { mood: null } }, at(2))
    expect(await listFilledDays()).toEqual(['2026-10-01'])
  })
})

describe('экспорт → чистая база → импорт', () => {
  it('возвращает дни и переименованную метрику', async () => {
    await saveDay('2026-10-05', { metrics: { mood: 4 }, text: 'Тест' }, at(5))
    await saveMetrics([{ ...DEFAULT_METRICS[1], name: 'Тоска', updatedAt: isoWithOffset(at(5)) }])
    const before = await exportSnapshot()
    const json = JSON.stringify(buildBackup(before, isoWithOffset(at(6))))

    await freshDb()
    await applyImport(planImport(await exportSnapshot(), parseImport(json)))

    const after = await exportSnapshot()
    expect(after.days).toEqual(before.days)
    expect(after.metricDefinitions).toEqual(before.metricDefinitions)
  })
})
