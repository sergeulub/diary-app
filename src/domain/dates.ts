import { formatDate } from './logicalDay'

export const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** Метка ISO 8601 с местным смещением: 2026-10-06T22:15:00.000+03:00. */
export function isoWithOffset(d: Date): string {
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

/** Полдень местного времени: не съезжает на соседнюю дату при переходе на летнее время. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day)
  return formatDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12))
}

/** Метки с разными смещениями сравниваются по моменту времени, не строкой. */
export function isLater(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b)
}

/** Месяц дня: 2026-11-05 → 2026-11. */
export const monthOf = (day: string) => day.slice(0, 7)

/** 2026-11 + 2 → 2027-01. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** Границы месяца для выборки по дням: с 01 по 31 (строки сравниваются, несуществующая дата не мешает). */
export const monthRange = (month: string): [string, string] => [`${month}-01`, `${month}-31`]

/** Сколько месяцев от from до to: 2026-11 → 2027-01 = 2. */
export function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}
