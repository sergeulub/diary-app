import { validateMetricValue } from './metrics'
import type { MetricValue } from './types'

const DAY_MINUTES = 24 * 60

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Длительность сна в минутах; «Встал» ≤ «Лёг» значит переход через полночь. Null — если нет обоих значений. */
export function sleepDuration(start: MetricValue | undefined, end: MetricValue | undefined): number | null {
  if (!validateMetricValue({ type: 'time' }, start) || !validateMetricValue({ type: 'time' }, end)) return null
  const diff = toMinutes(end as string) - toMinutes(start as string)
  return diff > 0 ? diff : diff + DAY_MINUTES
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} мин`
  if (m === 0) return `${h} ч`
  return `${h} ч ${m} мин`
}
