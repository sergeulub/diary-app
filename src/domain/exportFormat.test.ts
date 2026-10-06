import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildExportZip, metricsLine, renderMarkdown, selectChangedDays } from './exportFormat'
import { DEFAULT_METRICS } from './metrics'
import { T0, dayRec } from './testFixtures'
import type { DiarySnapshot, MetricDefinition } from './types'

const defs = DEFAULT_METRICS
const full = { mood: 4, boredom: 2, sleepStart: '23:40', sleepEnd: '07:10' }

describe('metricsLine', () => {
  it('строка как в спецификации', () => {
    expect(metricsLine(dayRec('2026-10-06', { metrics: full }), defs)).toBe(
      'Настроение: 4/5 (хорошо) · Скука: 2/5 · Сон: 23:40–07:10 (7 ч 30 мин)',
    )
  })
  it('пустые метрики пропускаются', () => {
    expect(metricsLine(dayRec('2026-10-06', { metrics: { mood: 5 } }), defs)).toBe('Настроение: 5/5 (отлично)')
  })
  it('один конец сна — без длительности', () => {
    expect(metricsLine(dayRec('2026-10-06', { metrics: { sleepStart: '23:40' } }), defs)).toBe('Лёг: 23:40')
  })
  it('архивная метрика со значением выводится', () => {
    const archived = defs.map((d) => (d.key === 'boredom' ? { ...d, archived: true } : d))
    expect(metricsLine(dayRec('2026-10-06', { metrics: { boredom: 2 } }), archived)).toBe('Скука: 2/5')
  })
  it('число с единицей, да/нет и метрика без определения', () => {
    const extra: MetricDefinition[] = [
      ...defs,
      { key: 'm1', name: 'Прогулка', type: 'number', unit: 'км', order: 5, archived: false, primary: false, createdAt: T0, updatedAt: T0 },
      { key: 'm2', name: 'Спорт', type: 'bool', order: 6, archived: false, primary: false, createdAt: T0, updatedAt: T0 },
    ]
    expect(metricsLine(dayRec('2026-10-06', { metrics: { m1: 3.5, m2: true, zz: 7 } }), extra)).toBe(
      'Прогулка: 3.5 км · Спорт: да · zz: 7',
    )
  })
})

describe('selectChangedDays', () => {
  const days = [
    dayRec('2026-10-03', { text: 'старый', updatedAt: '2026-10-03T22:00:00.000+03:00' }),
    dayRec('2026-10-05', { text: 'новый', updatedAt: '2026-10-05T22:00:00.000+03:00' }),
    dayRec('2026-10-04', { text: 'тоже новый', updatedAt: '2026-10-05T21:00:00.000+03:00' }),
    dayRec('2026-10-06', { updatedAt: '2026-10-06T22:00:00.000+03:00' }), // пустой
  ]
  it('первый экспорт — все заполненные дни по возрастанию даты', () => {
    expect(selectChangedDays(days, null).map((d) => d.day)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05'])
  })
  it('только изменённые после прошлого экспорта', () => {
    expect(selectChangedDays(days, '2026-10-04T12:00:00.000+03:00').map((d) => d.day)).toEqual(['2026-10-04', '2026-10-05'])
  })
  it('смещения сравниваются по моменту времени', () => {
    const lastExport = '2026-10-05T23:30:00.000+03:00' // 20:30 UTC
    const mixed = [
      dayRec('2026-10-05', { text: 'a', updatedAt: '2026-10-05T19:45:00.000-01:00' }), // 20:45 UTC — после
      dayRec('2026-10-06', { text: 'b', updatedAt: '2026-10-06T00:10:00.000+05:00' }), // 19:10 UTC — до
    ]
    expect(selectChangedDays(mixed, lastExport).map((d) => d.day)).toEqual(['2026-10-05'])
  })
})

describe('renderMarkdown', () => {
  it('блок дня: заголовок, метрики, пустая строка, текст', () => {
    const md = renderMarkdown([dayRec('2026-10-06', { metrics: full, text: '  Гулял по парку.  ' })], defs)
    expect(md).toBe(
      '## 2026-10-06, вторник\n' +
        'Настроение: 4/5 (хорошо) · Скука: 2/5 · Сон: 23:40–07:10 (7 ч 30 мин)\n' +
        '\n' +
        'Гулял по парку.\n',
    )
  })
  it('дни разделены пустой строкой; без метрик — сразу текст', () => {
    const md = renderMarkdown([dayRec('2026-10-05', { text: 'Один' }), dayRec('2026-10-06', { metrics: { mood: 3 } })], defs)
    expect(md).toBe('## 2026-10-05, понедельник\n\nОдин\n\n## 2026-10-06, вторник\nНастроение: 3/5 (нормально)\n')
  })
  it('нет изменённых дней — понятная строка', () => {
    expect(renderMarkdown([], defs)).toBe('Изменённых дней с прошлого экспорта нет.\n')
  })
})

describe('buildExportZip', () => {
  const snapshot: DiarySnapshot = {
    metricDefinitions: defs,
    days: [
      dayRec('2026-10-01', { text: 'Начало — «ёлочки»', updatedAt: '2026-10-01T22:00:00.000+03:00' }),
      dayRec('2026-10-06', { metrics: full, updatedAt: '2026-10-06T22:00:00.000+03:00' }),
    ],
    entries: [],
    meta: { boundaryHour: 6, lastExportAt: null, schemaVersion: 1 },
  }
  const now = new Date(2026, 9, 6, 22, 15)

  it('архив по дате и два файла с латинскими именами', () => {
    const { fileName, bytes } = buildExportZip(snapshot, now)
    expect(fileName).toBe('diary-2026-10-06.zip')
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(['backup.json', 'entries_2026-10-01_2026-10-06.md'])
  })
  it('backup.json — весь дневник с formatVersion и exportedAt со смещением', () => {
    const files = unzipSync(buildExportZip(snapshot, now).bytes)
    const backup = JSON.parse(strFromU8(files['backup.json']))
    expect(backup.formatVersion).toBe(1)
    expect(backup.exportedAt).toMatch(/^2026-10-06T22:15:00\.000[+-]\d{2}:\d{2}$/)
    expect(backup.days).toEqual(snapshot.days)
    expect(backup.metricDefinitions).toEqual(snapshot.metricDefinitions)
    expect(backup.entries).toEqual([])
    expect(backup.meta).toEqual(snapshot.meta)
  })
  it('кириллица в .md сохраняется', () => {
    const files = unzipSync(buildExportZip(snapshot, now).bytes)
    expect(strFromU8(files['entries_2026-10-01_2026-10-06.md'])).toContain('Начало — «ёлочки»')
  })
  it('нет изменений — файл с диапазоном сегодняшней даты', () => {
    const exported = { ...snapshot, meta: { ...snapshot.meta, lastExportAt: '2026-10-06T23:00:00.000+03:00' } }
    const files = unzipSync(buildExportZip(exported, now).bytes)
    expect(strFromU8(files['entries_2026-10-06_2026-10-06.md'])).toBe('Изменённых дней с прошлого экспорта нет.\n')
  })
})
