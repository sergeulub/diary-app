import 'fake-indexeddb/auto' // до импорта Dexie: подменяет indexedDB в Node
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { isoWithOffset } from '../domain/dates'
import { buildBackup } from '../domain/exportFormat'
import { DEFAULT_CATEGORIES, createTransaction } from '../domain/finance'
import { createGoal } from '../domain/goals'
import { parseImport, planImport } from '../domain/importFormat'
import { DEFAULT_METRICS } from '../domain/metrics'
import { T0, dayRec, eventRec, goalRec, linkRec, noteRec, personRec, txRec } from '../domain/testFixtures'
import { db } from './database'
import {
  applyImport, exportSnapshot, getDay, getFinanceCategories, getMeta, getMetrics, initDb, listDays, listFilledDays,
  listAllTransactions, listGoals, listStreakDays, listTransactions, saveDay, saveFinanceCategories, saveGoals, saveMetrics, saveTransaction,
  setMeta, addPhoto, addReview, listEntries, listPhotos, listPhotosBetween, listReviews, removePhoto, removeReview,
  saveReview,
} from './diary'

const at = (d: number, h = 22) => new Date(2026, 9, d, h)

async function freshDb() {
  await db.delete()
  await db.open()
  await initDb()
}

beforeEach(freshDb)

describe('initDb', () => {
  it('засевает четыре метрики, круги и meta по умолчанию', async () => {
    expect((await getMetrics()).map((d) => d.key)).toEqual(['mood', 'boredom', 'sleepStart', 'sleepEnd'])
    expect(await getMeta()).toEqual({ boundaryHour: 6, lastExportAt: null, schemaVersion: 4, appliedPatches: [] })
    const circles = (await exportSnapshot()).circles.sort((a, b) => a.order - b.order)
    expect(circles.map((c) => c.key)).toEqual(['speaker', 'friends', 'hr', 'mentor'])
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

describe('миграция v3 → v4', () => {
  it('данные остаются, schemaVersion 4, круги засеяны, люди пустые', async () => {
    db.close()
    await Dexie.delete('diary')
    const old = new Dexie('diary') // версии 1–3 — копия src/db/database.ts
    old.version(1).stores({ days: 'day, updatedAt', metricDefinitions: 'key', entries: 'id, day, updatedAt', meta: 'key' })
    old.version(2).stores({ financeCategories: 'key', transactions: 'id, day, updatedAt', goals: 'id, month, updatedAt' })
    old.version(3).stores({ photos: 'id, entryId, day, updatedAt' })
    await old.open()
    await old.table('days').put(dayRec('2026-10-05', { text: 'Было' }))
    await old.table('meta').put({ key: 'schemaVersion', value: 3 })
    old.close()
    await db.open()
    await initDb()
    expect((await getDay('2026-10-05'))?.text).toBe('Было')
    expect((await getMeta()).schemaVersion).toBe(4)
    const s = await exportSnapshot()
    expect(s.circles).toHaveLength(4)
    expect(s.people).toEqual([])
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
  it('возвращает категории, операции и цели', async () => {
    const stamp = isoWithOffset(at(5))
    await saveFinanceCategories([{ ...(await getFinanceCategories())[0], name: 'Еда', updatedAt: stamp }])
    const tx = createTransaction({ kind: 'expense', amount: 45000, categoryKey: 'cafe', day: '2026-10-05', note: 'кофе' }, stamp)
    await saveTransaction(tx)
    const goal = createGoal({
      month: '2026-11', text: 'Отложить 15 000 ₽', area: 'finance',
      target: { kind: 'finance', measure: 'saved', op: 'ge', value: 1_500_000 },
    }, [], stamp)
    await saveGoals([goal])
    const backup = parseImport(JSON.stringify(buildBackup(await exportSnapshot(), isoWithOffset(at(6)))))
    await freshDb()
    await applyImport(planImport(await exportSnapshot(), backup))
    expect(await listTransactions('2026-10-01', '2026-10-31')).toEqual([tx])
    expect(await listGoals('2026-11')).toEqual([goal])
    expect((await getFinanceCategories()).find((c) => c.key === 'groceries')?.name).toBe('Еда')
  })
  it('возвращает людей, записи, события и связи', async () => {
    const people = {
      people: [personRec({ id: 'ivan' }), personRec({ id: 'anna', name: 'Анна Смирнова' })],
      personNotes: [noteRec('ivan', { original: 'Заметка' })],
      events: [eventRec({ id: 'e1' })],
      personLinks: [linkRec('anna', 'ivan')],
    }
    const json = JSON.stringify(buildBackup({ ...(await exportSnapshot()), ...people }, isoWithOffset(at(6))))
    await freshDb()
    await applyImport(planImport(await exportSnapshot(), parseImport(json)))
    const after = await exportSnapshot()
    expect(after.people.sort((a, b) => a.id.localeCompare(b.id))).toEqual([...people.people].sort((a, b) => a.id.localeCompare(b.id)))
    expect(after.personNotes).toEqual(people.personNotes)
    expect(after.events).toEqual(people.events)
    expect(after.personLinks).toEqual(people.personLinks)
  })
  it('бэкап формата 4 не трогает круги по умолчанию', async () => {
    const v4 = { ...buildBackup(await exportSnapshot(), isoWithOffset(at(6))), formatVersion: 4 } as Record<string, unknown>
    for (const key of ['people', 'personNotes', 'events', 'spheres', 'circles', 'personLinks']) delete v4[key]
    await freshDb()
    await applyImport(planImport(await exportSnapshot(), parseImport(JSON.stringify(v4))))
    expect((await exportSnapshot()).circles).toHaveLength(4)
  })
})

describe('серия: completedAt', () => {
  const all = { mood: 3, boredom: 2, sleepStart: '00:25', sleepEnd: '09:45' }
  const text40 = 'Сегодня делал календарь и ходил в магазин'

  it('день, заполненный полностью до 06:00 следующего утра, засчитывается за свою дату', async () => {
    await saveDay('2026-10-06', { metrics: all }, at(6, 23))
    const rec = await saveDay('2026-10-06', { text: text40 }, new Date(2026, 9, 7, 5, 59))
    expect(rec.completedAt).toBe(isoWithOffset(new Date(2026, 9, 7, 5, 59)))
    expect(await listStreakDays()).toEqual(['2026-10-06'])
  })
  it('дозаполненный после 06:00 следующего дня — не засчитывается', async () => {
    await saveDay('2026-10-05', { metrics: all }, at(5, 22))
    const rec = await saveDay('2026-10-05', { text: text40 }, new Date(2026, 9, 6, 6, 0))
    expect(rec.completedAt).toBeUndefined()
    expect(await listStreakDays()).toEqual([])
  })
  it('прошлый день, заполненный задним числом, не засчитывается', async () => {
    await saveDay('2026-10-04', { metrics: all, text: text40 }, at(6, 20))
    expect(await listStreakDays()).toEqual([])
  })
  it('частично заполненный день не засчитывается', async () => {
    await saveDay('2026-10-06', { metrics: { mood: 3 }, text: text40 }, at(6, 23))
    expect(await listStreakDays()).toEqual([])
  })
  it('раз засчитанный день остаётся засчитанным после правок', async () => {
    await saveDay('2026-10-06', { metrics: all, text: text40 }, at(6, 23))
    await saveDay('2026-10-06', { text: 'коротко' }, new Date(2026, 9, 8, 12))
    expect(await listStreakDays()).toEqual(['2026-10-06'])
  })
  it('учитывает границу дня из настроек', async () => {
    await setMeta('boundaryHour', 4)
    await saveDay('2026-10-06', { metrics: all, text: text40 }, new Date(2026, 9, 7, 5, 0))
    expect(await listStreakDays()).toEqual([])
  })
})

describe('финансы и цели в базе', () => {
  it('initDb засевает категории один раз и не затирает правки', async () => {
    expect(await getFinanceCategories()).toHaveLength(DEFAULT_CATEGORIES.length)
    await saveFinanceCategories([{ ...DEFAULT_CATEGORIES[0], name: 'Еда' }])
    await initDb()
    const cats = await getFinanceCategories()
    expect(cats).toHaveLength(DEFAULT_CATEGORIES.length)
    expect(cats.find((c) => c.key === 'groceries')?.name).toBe('Еда')
  })
  it('операции: выборка по дням включительно, удалённые остаются в базе', async () => {
    const a = txRec('2026-10-31')
    const b = txRec('2026-11-01')
    const c = txRec('2026-11-30', { deletedAt: T0 })
    const d = txRec('2026-12-01')
    for (const t of [a, b, c, d]) await saveTransaction(t)
    expect((await listTransactions('2026-11-01', '2026-11-30')).map((t) => t.id).sort()).toEqual([b.id, c.id].sort())
    expect((await listAllTransactions()).map((t) => t.id).sort()).toEqual([a.id, b.id, c.id, d.id].sort())
  })
  it('цели: выборка по месяцу', async () => {
    const a = goalRec('2026-11')
    await saveGoals([a, goalRec('2026-12')])
    expect(await listGoals('2026-11')).toEqual([a])
  })
})

describe('разборы и фото в базе', () => {
  it('addReview создаёт пустой разбор, listReviews отдаёт живые разборы дня по порядку', async () => {
    const a = await addReview('2026-10-17', at(17, 21))
    const b = await addReview('2026-10-17', at(17, 22))
    await addReview('2026-10-16', at(16))
    expect((await listReviews('2026-10-17')).map((e) => e.id)).toEqual([a.id, b.id])
    await removeReview(a.id, at(17, 23))
    expect((await listReviews('2026-10-17')).map((e) => e.id)).toEqual([b.id])
  })
  it('одновременные сохранения разных полей не затирают друг друга', async () => {
    const r = await addReview('2026-10-17', at(17, 21))
    await Promise.all([
      saveReview(r.id, { text: 'Йогурт' }, at(17, 22)),
      saveReview(r.id, { verdict: 'Наполовину' }, at(17, 22)),
      saveReview(r.id, { change: 'Крышку ярче' }, at(17, 22)),
    ])
    expect((await listReviews('2026-10-17'))[0]).toMatchObject({ text: 'Йогурт', verdict: 'Наполовину', change: 'Крышку ярче' })
  })
  it('фото: добавление и удаление обновляют updatedAt разбора; удаление разбора удаляет его фото', async () => {
    const r = await addReview('2026-10-17', at(17, 21))
    const p = await addPhoto(r.id, 'image/jpeg', new Uint8Array([1, 2, 3]), at(17, 22))
    expect(p).toMatchObject({ entryId: r.id, day: '2026-10-17' })
    expect((await listReviews('2026-10-17'))[0].updatedAt).toBe(isoWithOffset(at(17, 22)))
    expect(await listPhotos(r.id)).toHaveLength(1)
    await removePhoto(p.id, at(17, 23))
    expect(await listPhotos(r.id)).toEqual([])
    expect((await listReviews('2026-10-17'))[0].updatedAt).toBe(isoWithOffset(at(17, 23)))

    const q = await addPhoto(r.id, 'image/jpeg', new Uint8Array([4]), at(18))
    await removeReview(r.id, at(19))
    expect(await listPhotos(r.id)).toEqual([])
    const [stored] = (await listPhotosBetween('2026-10-01', '2026-10-31')).filter((x) => x.id === q.id)
    expect(stored.deletedAt).not.toBeNull()
    expect(stored.bytes.length).toBe(0)
  })
  it('listEntries и снимок для экспорта включают разборы и фото', async () => {
    const r = await addReview('2026-10-17', at(17, 21))
    await addPhoto(r.id, 'image/jpeg', new Uint8Array([9]), at(17, 22))
    expect(await listEntries('2026-10-01', '2026-10-31')).toHaveLength(1)
    const snap = await exportSnapshot()
    expect(snap.entries).toHaveLength(1)
    expect(Array.from(snap.photos[0].bytes)).toEqual([9])
  })
  it('сохранение несуществующего разбора — ошибка', async () => {
    await expect(saveReview('нет-такого', { text: 'x' }, at(17))).rejects.toThrow()
  })
})

describe('апгрейд базы v1 → v4', () => {
  it('сохраняет дни, метрики и настройки, засевает категории, ставит schemaVersion 4', async () => {
    await db.delete()
    const v1 = new Dexie('diary')
    v1.version(1).stores({ days: 'day, updatedAt', metricDefinitions: 'key', entries: 'id, day, updatedAt', meta: 'key' })
    await v1.open()
    const day = dayRec('2026-10-05', { metrics: { mood: 4 }, text: 'До обновления' })
    await v1.table('days').put(day)
    await v1.table('metricDefinitions').bulkPut(DEFAULT_METRICS)
    await v1.table('meta').bulkPut([
      { key: 'boundaryHour', value: 4 }, { key: 'lastExportAt', value: null }, { key: 'schemaVersion', value: 1 },
    ])
    v1.close()

    await db.open()
    await initDb()
    expect(await getDay('2026-10-05')).toEqual(day)
    expect(await getMetrics()).toHaveLength(4)
    expect(await getMeta()).toEqual({ boundaryHour: 4, lastExportAt: null, schemaVersion: 4, appliedPatches: [] })
    expect(await getFinanceCategories()).toHaveLength(DEFAULT_CATEGORIES.length)
  })
})
