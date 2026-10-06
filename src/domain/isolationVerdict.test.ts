import { describe, expect, it } from 'vitest'
// Логика «Пробы 2» живёт в статическом public/probe2/verdict.js: страница не проходит через сборку
import { isolationVerdict } from '../../public/probe2/verdict.js'

const marker = (standalone: boolean) => JSON.stringify({ at: '2026-10-06T22:00:00.000Z', standalone })

describe('isolationVerdict', () => {
  it('во вкладке Safari вывода нет — просит открыть с иконки', () => {
    expect(isolationVerdict({ selfStandalone: false, markerRaw: marker(true) }).kind).toBe('not-standalone')
  })
  it('видна отметка установленного «Дневника» — хранилище общее', () => {
    expect(isolationVerdict({ selfStandalone: true, markerRaw: marker(true) }).kind).toBe('shared')
  })
  it('видна только отметка из вкладки Safari — с установленным «Дневником» изолировано', () => {
    expect(isolationVerdict({ selfStandalone: true, markerRaw: marker(false) }).kind).toBe('isolated')
  })
  it('отметки нет — изолировано', () => {
    expect(isolationVerdict({ selfStandalone: true, markerRaw: null }).kind).toBe('isolated')
  })
  it('старая отметка без источника — вывод неясен', () => {
    expect(isolationVerdict({ selfStandalone: true, markerRaw: '2026-10-06T22:00:00.000Z' }).kind).toBe('unknown')
  })
  it('каждый вывод объясняется текстом', () => {
    expect(isolationVerdict({ selfStandalone: true, markerRaw: marker(true) }).text).toContain('ОБЩЕЕ')
  })
})
