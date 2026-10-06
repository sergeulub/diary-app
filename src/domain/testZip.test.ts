import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { buildTestZip } from './testZip'

describe('buildTestZip', () => {
  const now = new Date(2026, 9, 6, 22, 15)
  const { fileName, bytes } = buildTestZip(now)
  const files = unzipSync(bytes)

  it('называет архив по дате', () => {
    expect(fileName).toBe('diary-test-2026-10-06.zip')
  })
  it('кладёт два файла с латинскими именами', () => {
    expect(Object.keys(files).sort()).toEqual(['backup.json', 'entries_test.md'])
  })
  it('сохраняет кириллицу в Markdown как UTF-8', () => {
    const md = strFromU8(files['entries_test.md'])
    expect(md).toContain('## 2026-10-06, вторник')
    expect(md).toContain('Настроение: 4/5 (хорошо) · Скука: 2/5 · Сон: 23:40–07:10 (7 ч 30 мин)')
  })
  it('пишет корректный JSON с formatVersion', () => {
    const json = JSON.parse(strFromU8(files['backup.json']))
    expect(json.formatVersion).toBe(1)
    expect(json.days[0].text).toContain('Проверка экспорта')
  })
})
