import { addDays } from './dates'
import { plural } from './ru'

export interface Streak {
  count: number
  todayFilled: boolean
}

/** Подряд идущие заполненные дни, заканчивающиеся сегодня; если сегодня пусто — вчера. */
export function streak(filled: ReadonlySet<string>, today: string): Streak {
  const todayFilled = filled.has(today)
  let day = todayFilled ? today : addDays(today, -1)
  let count = 0
  while (filled.has(day)) {
    count++
    day = addDays(day, -1)
  }
  return { count, todayFilled }
}

export function streakLabel(s: Streak): { chip: string; hint: string | null } {
  const chip = `${s.count} ${plural(s.count, ['день', 'дня', 'дней'])}`
  if (s.todayFilled) return { chip, hint: null }
  return { chip, hint: s.count > 0 ? 'Заполни сегодня, чтобы продлить' : 'Заполни сегодня, чтобы начать серию' }
}
