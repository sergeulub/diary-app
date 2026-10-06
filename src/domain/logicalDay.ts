/** Дата в формате ГГГГ-ММ-ДД по местному времени. */
export function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Логический день: время до boundaryHour (местное) относится к предыдущей дате. */
export function logicalDay(now: Date, boundaryHour: number): string {
  if (now.getHours() >= boundaryHour) return formatDate(now)
  return formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12))
}
