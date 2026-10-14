import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildBackup, buildExportZip } from './exportFormat'
import { ImportError, describeImport, extractBackupJson, importSize, parseImport, planImport } from './importFormat'
import { DEFAULT_METRICS, SEED_TIME } from './metrics'
import { DEFAULT_CATEGORIES } from './finance'
import { dayRec, goalRec, txRec } from './testFixtures'
import type { DiarySnapshot } from './types'

const meta = { boundaryHour: 6, lastExportAt: null, schemaVersion: 1 }
const snapshot = (patch: Partial<DiarySnapshot> = {}): DiarySnapshot => ({
  metricDefinitions: DEFAULT_METRICS, days: [], entries: [], financeCategories: [], transactions: [], goals: [], meta, ...patch,
})
const EMPTY = { days: [], metricDefinitions: [], entries: [], financeCategories: [], transactions: [], goals: [] }
const json = (s: DiarySnapshot) => JSON.stringify(buildBackup(s, '2026-10-06T22:00:00.000+03:00'))

describe('extractBackupJson', () => {
  it('голый JSON возвращается как текст', () => {
    expect(extractBackupJson(strToU8('{"a":1}'))).toBe('{"a":1}')
  })
  it('из zip достаёт backup.json', () => {
    const zip = zipSync({ 'backup.json': strToU8('{"b":2}'), 'entries_x.md': strToU8('…') })
    expect(extractBackupJson(zip)).toBe('{"b":2}')
  })
  it('zip без backup.json — понятная ошибка', () => {
    const zip = zipSync({ 'other.txt': strToU8('x') })
    expect(() => extractBackupJson(zip)).toThrow(new ImportError('В архиве нет backup.json'))
  })
})

describe('parseImport', () => {
  it('читает свой бэкап, в том числе с BOM', () => {
    const s = snapshot({ days: [dayRec('2026-10-05', { metrics: { mood: 4 }, text: 'Привет' })] })
    expect(parseImport('﻿' + json(s)).days).toEqual(s.days)
  })
  it('не JSON — понятная ошибка', () => {
    expect(() => parseImport('<html>')).toThrow(ImportError)
  })
  it('нет formatVersion — не бэкап дневника', () => {
    expect(() => parseImport('{"days":[]}')).toThrow(/не похож на бэкап/)
  })
  it('будущая formatVersion отклоняется с просьбой обновиться', () => {
    expect(() => parseImport(JSON.stringify({ ...JSON.parse(json(snapshot())), formatVersion: 3 }))).toThrow(
      /более новой версией приложения \(формат 3\)/,
    )
  })
  it('недопустимое значение метрики называет день и метрику', () => {
    const bad = snapshot({ days: [dayRec('2026-10-05', { metrics: { mood: 7 } })] })
    expect(() => parseImport(json(bad))).toThrow('День 2026-10-05: недопустимое значение «Настроение»')
  })
  it('день без обязательных полей отклоняется', () => {
    const raw = JSON.parse(json(snapshot({ days: [dayRec('2026-10-05')] })))
    delete raw.days[0].updatedAt
    expect(() => parseImport(JSON.stringify(raw))).toThrow(/День 2026-10-05/)
  })
  it('тестовый zip Фазы 0 (дни без id и меток) отклоняется, а не ломает базу', () => {
    const phase0 = { formatVersion: 1, exportedAt: 'x', days: [{ day: '2026-10-06', metrics: { mood: 4 }, text: 't' }] }
    expect(() => parseImport(JSON.stringify(phase0))).toThrow(ImportError)
  })
})

describe('planImport', () => {
  const old = '2026-10-05T22:00:00.000+03:00'
  const newer = '2026-10-06T22:00:00.000+03:00'

  it('новый день добавляется, более свежий обновляет, старый и равный — нет', () => {
    const current = snapshot({
      days: [
        dayRec('2026-10-01', { text: 'тут новее', updatedAt: newer }),
        dayRec('2026-10-02', { text: 'тут старее', updatedAt: old }),
        dayRec('2026-10-03', { text: 'одинаково', updatedAt: old }),
      ],
    })
    const incoming = parseImport(json(snapshot({
      days: [
        dayRec('2026-10-01', { text: 'в файле старее', updatedAt: old }),
        dayRec('2026-10-02', { text: 'в файле новее', updatedAt: newer }),
        dayRec('2026-10-03', { text: 'одинаково', updatedAt: old }),
        dayRec('2026-10-04', { text: 'новый', updatedAt: old }),
      ],
    })))
    const plan = planImport(current, incoming)
    expect(plan.days.put.map((d) => d.text)).toEqual(['в файле новее', 'новый'])
    expect([plan.days.added, plan.days.updated]).toEqual([1, 1])
  })
  it('смещения сравниваются по моменту времени', () => {
    const current = snapshot({ days: [dayRec('2026-10-05', { text: 'здесь', updatedAt: '2026-10-05T23:30:00.000+03:00' })] })
    const incoming = parseImport(json(snapshot({
      days: [dayRec('2026-10-05', { text: 'в файле', updatedAt: '2026-10-05T19:45:00.000-01:00' })],
    })))
    expect(planImport(current, incoming).days.put.map((d) => d.text)).toEqual(['в файле'])
  })
  it('свежая установка не затирает переименованную в бэкапе метрику', () => {
    expect(DEFAULT_METRICS[1].updatedAt).toBe(SEED_TIME)
    const renamed = DEFAULT_METRICS.map((d) => (d.key === 'boredom' ? { ...d, name: 'Тоска', updatedAt: old } : d))
    const plan = planImport(snapshot(), parseImport(json(snapshot({ metricDefinitions: renamed }))))
    expect(plan.metricDefinitions.put.map((d) => d.name)).toEqual(['Тоска'])
    expect(plan.metricDefinitions.updated).toBe(1)
  })
})

describe('экспорт → импорт', () => {
  it('в пустой дневник возвращает те же данные', () => {
    const s = snapshot({
      days: [
        dayRec('2026-10-05', { metrics: { mood: 2, sleepStart: '00:15', sleepEnd: '08:00' }, text: 'Дождь — «ёлочки»' }),
        dayRec('2026-10-06', { metrics: { boredom: 5 }, updatedAt: '2026-10-06T23:59:00.000+03:00' }),
      ],
    })
    const zip = buildExportZip(s, new Date(2026, 9, 6, 22, 15)).bytes
    const plan = planImport(EMPTY, parseImport(extractBackupJson(zip)))
    expect(plan.days.put).toEqual(s.days)
    expect(plan.metricDefinitions.put).toEqual(s.metricDefinitions)
    expect(plan.entries.put).toEqual([])
  })
})

describe('describeImport', () => {
  it('нечего импортировать', () => {
    const plan = planImport(snapshot(), parseImport(json(snapshot())))
    expect(importSize(plan)).toBe(0)
    expect(describeImport(plan)).toBe('Нечего импортировать: всё это уже есть в дневнике.')
  })
  it('сводка «будет добавлено N, обновлено M»', () => {
    const plan = planImport(snapshot({ metricDefinitions: [] }), parseImport(json(snapshot({ days: [dayRec('2026-10-05', { text: 'x' })] }))))
    expect(describeImport(plan)).toBe('Дней: будет добавлено 1, обновлено 0. Метрик: будет добавлено 4, обновлено 0.')
  })
})

describe('completedAt', () => {
  it('переносится импортом, а пустое значение отбрасывается', () => {
    const done = dayRec('2026-10-06', { completedAt: '2026-10-06T23:00:00.000+03:00' })
    const days = parseImport(json(snapshot({ days: [done, dayRec('2026-10-05')] }))).days
    expect(days[0].completedAt).toBe('2026-10-06T23:00:00.000+03:00')
    expect('completedAt' in days[1]).toBe(false)
  })
  it('неверная метка completedAt отклоняется', () => {
    const bad = dayRec('2026-10-06', { completedAt: 'вчера' })
    expect(() => parseImport(json(snapshot({ days: [bad] })))).toThrow(/День 2026-10-06/)
  })
})

describe('бэкап v2: финансы и цели', () => {
  const cafeGoal = goalRec('2026-11', {
    area: 'finance', text: 'Кафе ≤ 5 000 ₽',
    target: { kind: 'finance', measure: 'expense', filter: { categoryKey: 'cafe' }, op: 'le', value: 500000 },
  })
  const s = snapshot({
    financeCategories: DEFAULT_CATEGORIES,
    transactions: [
      txRec('2026-11-02', { categoryKey: 'cafe', amount: 45000, note: 'кофе' }),
      txRec('2026-11-03', { amount: 1000, deletedAt: '2026-11-03T10:00:00.000+03:00' }),
    ],
    goals: [cafeGoal],
  })

  it('экспорт → импорт в пустой дневник возвращает категории, операции (с удалёнными) и цели', () => {
    const zip = buildExportZip(s, new Date(2026, 10, 3, 22)).bytes
    const plan = planImport(EMPTY, parseImport(extractBackupJson(zip)))
    expect(plan.financeCategories.put).toEqual(DEFAULT_CATEGORIES)
    expect(plan.transactions.put).toEqual(s.transactions)
    expect(plan.goals.put).toEqual([cafeGoal])
  })
  it('файл формата 1 без новых массивов читается с пустыми', () => {
    const v1 = { ...JSON.parse(json(snapshot())), formatVersion: 1 }
    delete v1.financeCategories
    delete v1.transactions
    delete v1.goals
    const backup = parseImport(JSON.stringify(v1))
    expect([backup.financeCategories, backup.transactions, backup.goals]).toEqual([[], [], []])
  })
  it.each<[string, Record<string, unknown>]>([
    ['нулевая сумма', { amount: 0 }],
    ['дробные копейки', { amount: 10.5 }],
    ['неверный вид', { kind: 'refund' }],
    ['неверная дата', { day: '2026-11-31x' }],
  ])('операция: %s — отказ с номером', (_, patch) => {
    const raw = JSON.parse(json(snapshot({ transactions: [txRec('2026-11-02')] })))
    Object.assign(raw.transactions[0], patch)
    expect(() => parseImport(JSON.stringify(raw))).toThrow('Операция №1: не хватает полей или они неверного типа')
  })
  it('категория трат без важности — отказ; у дохода важность отбрасывается', () => {
    const noImportance = { ...DEFAULT_CATEGORIES[0] }
    delete noImportance.importance
    expect(() => parseImport(json(snapshot({ financeCategories: [noImportance] })))).toThrow('Категория №1')
    const salary = { ...DEFAULT_CATEGORIES.find((c) => c.key === 'salary')!, importance: 'need' as const }
    expect('importance' in parseImport(json(snapshot({ financeCategories: [salary] }))).financeCategories[0]).toBe(false)
  })
  it('цель с неверным измерением или месяцем — отказ', () => {
    const badTarget = goalRec('2026-11', { target: { kind: 'finance', measure: 'saved', filter: { categoryKey: 'cafe' }, op: 'ge', value: 1 } })
    expect(() => parseImport(json(snapshot({ goals: [badTarget] })))).toThrow('Цель №1')
    expect(() => parseImport(json(snapshot({ goals: [goalRec('2026-13')] })))).toThrow('Цель №1')
  })
  it('слияние операций по id: свежая правка побеждает; сводка называет операции и цели', () => {
    const old = txRec('2026-11-02', { amount: 1000, updatedAt: '2026-11-02T10:00:00.000+03:00' })
    const edited = { ...old, amount: 2000, updatedAt: '2026-11-02T12:00:00.000+03:00' }
    const plan = planImport(
      snapshot({ transactions: [old] }),
      parseImport(json(snapshot({ transactions: [edited, txRec('2026-11-03')], goals: [goalRec('2026-11')] }))),
    )
    expect(plan.transactions.put.map((t) => t.amount)).toEqual([2000, 10000])
    expect(describeImport(plan)).toBe(
      'Дней: будет добавлено 0, обновлено 0. Метрик: будет добавлено 0, обновлено 0. ' +
        'Операций: будет добавлено 1, обновлено 1. Целей: будет добавлено 1, обновлено 0.',
    )
  })
})
