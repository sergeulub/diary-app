import { formatDate } from './logicalDay'
import { isDayFilled, validateMetricValue } from './metrics'
import type { DayRecord } from './types'

export interface YearMonth {
  year: number
  month0: number
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const d = new Date(ym.year, ym.month0 + delta, 1, 12)
  return { year: d.getFullYear(), month0: d.getMonth() }
}

/** Ячейки месяца по неделям с понедельника; null — пустые клетки до 1-го и после последнего числа. */
export function monthGrid(year: number, month0: number): (string | null)[] {
  const lead = (new Date(year, month0, 1, 12).getDay() + 6) % 7
  const daysInMonth = new Date(year, month0 + 1, 0, 12).getDate()
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(formatDate(new Date(year, month0, d, 12)))
  while (cells.length % 7) cells.push(null)
  return cells
}

export type CellState = { kind: 'future' } | { kind: 'empty' } | { kind: 'filled' } | { kind: 'mood'; value: number }

export function dayCellState(
  day: string,
  rec: DayRecord | undefined,
  today: string,
  primaryKey: string | undefined,
): CellState {
  if (day > today) return { kind: 'future' }
  if (!rec || !isDayFilled(rec)) return { kind: 'empty' }
  const value = primaryKey ? rec.metrics[primaryKey] : undefined
  if (validateMetricValue({ type: 'scale' }, value)) return { kind: 'mood', value: value as number }
  return { kind: 'filled' }
}
