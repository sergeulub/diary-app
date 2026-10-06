import { pad, parseDay } from './dates'

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/** Неделя с понедельника — для шапки календаря. */
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** Форма слова для числа: [1 день, 2 дня, 5 дней]. */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function weekdayName(day: string): string {
  return WEEKDAYS[parseDay(day).getDay()]
}

export function formatDayTitle(day: string): string {
  const d = parseDay(day)
  const w = WEEKDAYS[d.getDay()]
  return `${w[0].toUpperCase()}${w.slice(1)}, ${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`
}

export function monthTitle(year: number, month0: number): string {
  return `${MONTHS[month0]} ${year}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
