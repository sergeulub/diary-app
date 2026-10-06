import { strToU8, zipSync } from 'fflate'
import { formatDate } from './logicalDay'

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

/** Тестовый архив Фазы 0: проверяет, что iOS отдаёт zip в Telegram, а Windows читает кириллицу. */
export function buildTestZip(now: Date): { fileName: string; bytes: Uint8Array } {
  const day = formatDate(now)
  const text = 'Проверка экспорта: кириллица, ёлка, тире — и кавычки «ёлочки».'
  const md = [
    `## ${day}, ${WEEKDAYS[now.getDay()]}`,
    'Настроение: 4/5 (хорошо) · Скука: 2/5 · Сон: 23:40–07:10 (7 ч 30 мин)',
    '',
    text,
    '',
  ].join('\n')
  const backup = {
    formatVersion: 1,
    exportedAt: now.toISOString(),
    days: [{ day, metrics: { mood: 4, boredom: 2, sleepStart: '23:40', sleepEnd: '07:10' }, text }],
  }
  const bytes = zipSync({
    'backup.json': strToU8(JSON.stringify(backup, null, 2)),
    'entries_test.md': strToU8(md),
  })
  return { fileName: `diary-test-${day}.zip`, bytes }
}
