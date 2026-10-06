import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildBackup, buildExportZip } from './exportFormat'
import { ImportError, describeImport, extractBackupJson, importSize, parseImport, planImport } from './importFormat'
import { DEFAULT_METRICS, SEED_TIME } from './metrics'
import { dayRec } from './testFixtures'
import type { DiarySnapshot } from './types'

const meta = { boundaryHour: 6, lastExportAt: null, schemaVersion: 1 }
const snapshot = (patch: Partial<DiarySnapshot> = {}): DiarySnapshot => ({
  metricDefinitions: DEFAULT_METRICS, days: [], entries: [], meta, ...patch,
})
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
    expect(() => parseImport(JSON.stringify({ ...JSON.parse(json(snapshot())), formatVersion: 2 }))).toThrow(
      /более новой версией приложения \(формат 2\)/,
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
    const plan = planImport({ days: [], metricDefinitions: [], entries: [] }, parseImport(extractBackupJson(zip)))
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
