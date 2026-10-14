import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildExportZip, metricsLine, renderMarkdown, selectChangedDays } from './exportFormat'
import { DEFAULT_CATEGORIES } from './finance'
import { DEFAULT_METRICS } from './metrics'
import { T0, dayRec, goalRec, txRec } from './testFixtures'
import type { DiarySnapshot, MetricDefinition } from './types'

const defs = DEFAULT_METRICS
const full = { mood: 4, boredom: 2, sleepStart: '23:40', sleepEnd: '07:10' }
const snap = (patch: Partial<DiarySnapshot> = {}): DiarySnapshot => ({
  metricDefinitions: defs, days: [], entries: [], financeCategories: DEFAULT_CATEGORIES, transactions: [], goals: [],
  meta: { boundaryHour: 6, lastExportAt: null, schemaVersion: 2 }, ...patch,
})
const since = (lastExportAt: string) => ({ boundaryHour: 6, lastExportAt, schemaVersion: 2 })

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
    expect(selectChangedDays(snap({ days }))).toEqual(['2026-10-03', '2026-10-04', '2026-10-05'])
  })
  it('только изменённые после прошлого экспорта', () => {
    expect(selectChangedDays(snap({ days, meta: since('2026-10-04T12:00:00.000+03:00') }))).toEqual(['2026-10-04', '2026-10-05'])
  })
  it('смещения сравниваются по моменту времени', () => {
    const mixed = [
      dayRec('2026-10-05', { text: 'a', updatedAt: '2026-10-05T19:45:00.000-01:00' }), // 20:45 UTC — после
      dayRec('2026-10-06', { text: 'b', updatedAt: '2026-10-06T00:10:00.000+05:00' }), // 19:10 UTC — до
    ]
    expect(selectChangedDays(snap({ days: mixed, meta: since('2026-10-05T23:30:00.000+03:00') }))).toEqual(['2026-10-05'])
  })
  it('день попадает, если изменилась только его операция; день только с операциями — тоже', () => {
    const s = snap({
      days,
      transactions: [
        txRec('2026-10-03', { updatedAt: '2026-10-06T10:00:00.000+03:00' }), // старый день, новая трата
        txRec('2026-10-07', { updatedAt: '2026-10-07T10:00:00.000+03:00' }), // день без записи
        txRec('2026-10-08', { updatedAt: '2026-10-08T10:00:00.000+03:00', deletedAt: '2026-10-08T10:00:00.000+03:00' }),
      ],
      meta: since('2026-10-05T23:00:00.000+03:00'),
    })
    expect(selectChangedDays(s)).toEqual(['2026-10-03', '2026-10-07'])
  })
})

describe('renderMarkdown', () => {
  it('блок дня: заголовок, метрики, пустая строка, текст', () => {
    const s = snap({ days: [dayRec('2026-10-06', { metrics: full, text: '  Гулял по парку.  ' })] })
    expect(renderMarkdown(s, ['2026-10-06'], '2026-10-06')).toBe(
      '## 2026-10-06, вторник\n' +
        'Настроение: 4/5 (хорошо) · Скука: 2/5 · Сон: 23:40–07:10 (7 ч 30 мин)\n' +
        '\n' +
        'Гулял по парку.\n',
    )
  })
  it('дни разделены пустой строкой; без метрик — сразу текст', () => {
    const s = snap({ days: [dayRec('2026-10-05', { text: 'Один' }), dayRec('2026-10-06', { metrics: { mood: 3 } })] })
    expect(renderMarkdown(s, ['2026-10-05', '2026-10-06'], '2026-10-06')).toBe(
      '## 2026-10-05, понедельник\n\nОдин\n\n## 2026-10-06, вторник\nНастроение: 3/5 (нормально)\n',
    )
  })
  it('нет изменённых дней — понятная строка', () => {
    expect(renderMarkdown(snap(), [], '2026-10-06')).toBe('Изменённых дней с прошлого экспорта нет.\n')
  })
  it('доходы и траты после метрик: по убыванию суммы, комментарии в скобках, удалённые не выводятся', () => {
    const s = snap({
      days: [dayRec('2026-11-02', { metrics: { mood: 4 }, text: 'Обычный день' })],
      transactions: [
        txRec('2026-11-02', { kind: 'income', categoryKey: 'salary', amount: 5_000_000 }),
        txRec('2026-11-02', { categoryKey: 'groceries', amount: 80000 }),
        txRec('2026-11-02', { categoryKey: 'cafe', amount: 30000, note: 'кофе с Машей' }),
        txRec('2026-11-02', { categoryKey: 'cafe', amount: 15000, note: 'обед' }),
        txRec('2026-11-02', { categoryKey: 'fun', amount: 99900, deletedAt: T0 }),
      ],
    })
    expect(renderMarkdown(s, ['2026-11-02'], '2026-11-02')).toBe(
      '## 2026-11-02, понедельник\n' +
        'Настроение: 4/5 (хорошо)\n' +
        'Доходы: 50 000 ₽ — Зарплата 50 000\n' +
        'Траты: 1 250 ₽ — Продукты 800 · Кафе и доставка 450 (кофе с Машей, обед)\n' +
        '\n' +
        'Обычный день\n',
    )
  })
  it('день только с операциями', () => {
    const s = snap({ transactions: [txRec('2026-11-03', { categoryKey: 'transport', amount: 6000 })] })
    expect(renderMarkdown(s, ['2026-11-03'], '2026-11-03')).toBe('## 2026-11-03, вторник\nТраты: 60 ₽ — Транспорт 60\n')
  })
  it('в начале — цели месяцев файла с прогрессом у измеримых; удалённые не выводятся', () => {
    const s = snap({
      days: [dayRec('2026-10-31', { text: 'Хеллоуин' }), dayRec('2026-11-02', { text: 'Понедельник' })],
      transactions: [txRec('2026-11-02', { categoryKey: 'cafe', amount: 320000 })],
      goals: [
        goalRec('2026-11', {
          area: 'finance', order: 1, text: 'Тратить на кафе\nне больше 5 000 ₽',
          target: { kind: 'finance', measure: 'expense', filter: { categoryKey: 'cafe' }, op: 'le', value: 500000 },
        }),
        goalRec('2026-11', { area: 'study', order: 2, text: 'Закончить курс по SQL' }),
        goalRec('2026-11', { area: 'work', order: 3, text: 'Удалённая', deletedAt: T0 }),
      ],
    })
    expect(renderMarkdown(s, ['2026-10-31', '2026-11-02'], '2026-11-02')).toBe(
      '# Цели — ноябрь 2026\n' +
        '- [Финансы] Тратить на кафе не больше 5 000 ₽ — сейчас 3 200 ₽, в рамках\n' +
        '- [Учёба] Закончить курс по SQL\n' +
        '\n' +
        '## 2026-10-31, суббота\n\nХеллоуин\n' +
        '\n' +
        '## 2026-11-02, понедельник\nТраты: 3 200 ₽ — Кафе и доставка 3 200\n\nПонедельник\n',
    )
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
    financeCategories: [],
    transactions: [],
    goals: [],
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
    expect(backup.formatVersion).toBe(2)
    expect(backup.exportedAt).toMatch(/^2026-10-06T22:15:00\.000[+-]\d{2}:\d{2}$/)
    expect(backup.days).toEqual(snapshot.days)
    expect(backup.metricDefinitions).toEqual(snapshot.metricDefinitions)
    expect(backup.entries).toEqual([])
    expect(backup.financeCategories).toEqual([])
    expect(backup.transactions).toEqual([])
    expect(backup.goals).toEqual([])
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
