import { describe, expect, it } from 'vitest'
import {
  DEFAULT_METRICS, activeMetrics, createMetric, formCards, isDayFilled, moveMetric, newMetricKey,
  isDayComplete, renameMetric, setArchived, validateMetricValue, type FormCard,
} from './metrics'
import { dayRec } from './testFixtures'
import type { MetricDefinition, MetricType } from './types'

const NOW = '2026-10-06T22:00:00.000+03:00'
const custom = (key: string, order: number, patch: Partial<MetricDefinition> = {}): MetricDefinition => ({
  key, name: key, type: 'number', order, archived: false, primary: false, createdAt: NOW, updatedAt: NOW, ...patch,
})
const cardKeys = (cards: FormCard[]) => cards.map((c) => (c.kind === 'sleep' ? 'sleep' : c.def.key))

describe('DEFAULT_METRICS', () => {
  it('четыре стартовые метрики, главная — настроение', () => {
    expect(DEFAULT_METRICS.map((d) => d.key)).toEqual(['mood', 'boredom', 'sleepStart', 'sleepEnd'])
    expect(DEFAULT_METRICS.filter((d) => d.primary).map((d) => d.key)).toEqual(['mood'])
  })
})

describe('validateMetricValue', () => {
  const cases: [MetricType, unknown, boolean][] = [
    ['scale', 1, true], ['scale', 5, true], ['scale', 0, false], ['scale', 6, false], ['scale', 2.5, false],
    ['scale', '3', false],
    ['time', '23:40', true], ['time', '00:00', true], ['time', '24:00', false], ['time', '7:10', false],
    ['time', 710, false],
    ['number', 3.5, true], ['number', -2, true], ['number', Number.NaN, false], ['number', Infinity, false],
    ['number', '3', false],
    ['bool', true, true], ['bool', false, true], ['bool', 1, false],
  ]
  it.each(cases)('%s: %s → %s', (type, value, ok) => {
    expect(validateMetricValue({ type }, value)).toBe(ok)
  })
})

describe('isDayFilled', () => {
  it('пустой день и текст из пробелов — не заполнены', () => {
    expect(isDayFilled(dayRec('2026-10-06'))).toBe(false)
    expect(isDayFilled(dayRec('2026-10-06', { text: '  \n ' }))).toBe(false)
  })
  it('хватает одной метрики или текста', () => {
    expect(isDayFilled(dayRec('2026-10-06', { metrics: { boredom: 3 } }))).toBe(true)
    expect(isDayFilled(dayRec('2026-10-06', { text: 'Гулял' }))).toBe(true)
  })
  it('удалённый день не заполнен', () => {
    expect(isDayFilled(dayRec('2026-10-06', { text: 'x', deletedAt: NOW }))).toBe(false)
  })
})

describe('formCards', () => {
  it('по умолчанию: настроение, скука, сон одной карточкой', () => {
    expect(cardKeys(formCards(DEFAULT_METRICS))).toEqual(['mood', 'boredom', 'sleep'])
  })
  it('если «Встал» в архиве — «Лёг» отдельной карточкой', () => {
    const defs = DEFAULT_METRICS.map((d) => (d.key === 'sleepEnd' ? { ...d, archived: true } : d))
    expect(cardKeys(formCards(defs))).toEqual(['mood', 'boredom', 'sleepStart'])
  })
  it('новая метрика — после сна, архивные скрыты', () => {
    const defs = [...DEFAULT_METRICS, custom('m1', 5), custom('m2', 6, { archived: true })]
    expect(cardKeys(formCards(defs))).toEqual(['mood', 'boredom', 'sleep', 'm1'])
  })
  it('порядок по order', () => {
    const defs = DEFAULT_METRICS.map((d) => (d.key === 'mood' ? { ...d, order: 10 } : d))
    expect(cardKeys(formCards(defs))).toEqual(['boredom', 'sleep', 'mood'])
  })
})

describe('создание и правка метрик', () => {
  it('newMetricKey — первый свободный m<N>', () => {
    expect(newMetricKey([])).toBe('m1')
    expect(newMetricKey(['mood', 'm1', 'm2'])).toBe('m3')
  })
  it('createMetric обрезает пробелы и ставит в конец', () => {
    const m = createMetric({ name: '  Энергия ', type: 'scale', unit: 'км' }, DEFAULT_METRICS, NOW)
    expect(m).toEqual({
      key: 'm1', name: 'Энергия', type: 'scale', order: 5, archived: false, primary: false,
      createdAt: NOW, updatedAt: NOW,
    })
  })
  it('createMetric сохраняет единицу только у числа', () => {
    expect(createMetric({ name: 'Прогулка', type: 'number', unit: ' км ' }, [], NOW).unit).toBe('км')
  })
  it('createMetric отказывает пустому названию', () => {
    expect(() => createMetric({ name: '   ', type: 'bool' }, [], NOW)).toThrow()
  })
  it('renameMetric: новое имя, пустое или прежнее — null', () => {
    const mood = DEFAULT_METRICS[0]
    expect(renameMetric(mood, ' Настрой ', NOW)).toMatchObject({ name: 'Настрой', updatedAt: NOW })
    expect(renameMetric(mood, '  ', NOW)).toBeNull()
    expect(renameMetric(mood, 'Настроение', NOW)).toBeNull()
  })
})

describe('moveMetric', () => {
  it('поднимает скуку над настроением', () => {
    const changed = moveMetric(DEFAULT_METRICS, 'boredom', -1, NOW)
    expect(changed.map((d) => [d.key, d.order])).toEqual([['boredom', 1], ['mood', 2]])
    expect(changed.every((d) => d.updatedAt === NOW)).toBe(true)
  })
  it('за край не двигает', () => {
    expect(moveMetric(DEFAULT_METRICS, 'mood', -1, NOW)).toEqual([])
    expect(moveMetric(DEFAULT_METRICS, 'sleepEnd', 1, NOW)).toEqual([])
  })
  it('перепрыгивает архивные и перенумеровывает', () => {
    const defs = DEFAULT_METRICS.map((d) => (d.key === 'boredom' ? { ...d, archived: true } : d))
    const changed = moveMetric(defs, 'sleepStart', -1, NOW)
    expect(changed.map((d) => [d.key, d.order])).toEqual([['sleepStart', 1], ['mood', 2], ['sleepEnd', 3]])
  })
  it('разбивает одинаковые order после импорта', () => {
    const defs = [custom('a', 1), custom('b', 1)]
    const changed = moveMetric(defs, 'b', -1, NOW)
    const merged = defs.map((d) => changed.find((c) => c.key === d.key) ?? d)
    expect(activeMetrics(merged).map((d) => d.key)).toEqual(['b', 'a'])
  })
})

describe('setArchived', () => {
  it('из архива возвращается в конец списка', () => {
    const boredom = { ...DEFAULT_METRICS[1], archived: true }
    expect(setArchived(boredom, false, DEFAULT_METRICS, NOW)).toMatchObject({ archived: false, order: 5, updatedAt: NOW })
  })
  it('в архив — порядок не меняется', () => {
    expect(setArchived(DEFAULT_METRICS[1], true, DEFAULT_METRICS, NOW)).toMatchObject({ archived: true, order: 2 })
  })
})

describe('isDayComplete', () => {
  const all = { mood: 3, boredom: 2, sleepStart: '00:25', sleepEnd: '09:45' }
  const text40 = 'Сегодня делал календарь и ходил в магазин'
  it('все активные метрики и текст ≥ 40 символов — полный', () => {
    expect(text40.length).toBeGreaterThanOrEqual(40)
    expect(isDayComplete(dayRec('2026-10-06', { metrics: all, text: text40 }), DEFAULT_METRICS)).toBe(true)
  })
  it('текст короче 40 символов без пробелов по краям — не полный', () => {
    const short = '   ' + 'я'.repeat(39) + '   '
    expect(isDayComplete(dayRec('2026-10-06', { metrics: all, text: short }), DEFAULT_METRICS)).toBe(false)
  })
  it('не хватает одной метрики — не полный', () => {
    const { sleepEnd: _, ...partial } = all
    expect(isDayComplete(dayRec('2026-10-06', { metrics: partial, text: text40 }), DEFAULT_METRICS)).toBe(false)
  })
  it('новая активная метрика тоже обязательна, архивная — нет', () => {
    const defs = [...DEFAULT_METRICS, custom('m1', 5), custom('m2', 6, { archived: true })]
    expect(isDayComplete(dayRec('2026-10-06', { metrics: all, text: text40 }), defs)).toBe(false)
    expect(isDayComplete(dayRec('2026-10-06', { metrics: { ...all, m1: 1 }, text: text40 }), defs)).toBe(true)
  })
})
