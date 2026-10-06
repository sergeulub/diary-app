import type { DayRecord, FaceKind, MetricDefinition, MetricType, MetricValue } from './types'

/**
 * Метка засева стартовых метрик. Фиксированная и старая: при импорте бэкапа на свежую установку любые правки
 * пользователя (переименование, порядок, архив) свежее засева и побеждают.
 */
export const SEED_TIME = '2026-01-01T00:00:00.000+00:00'

const seed = { archived: false, createdAt: SEED_TIME, updatedAt: SEED_TIME }

export const DEFAULT_METRICS: MetricDefinition[] = [
  { key: 'mood', name: 'Настроение', type: 'scale', order: 1, primary: true, face: 'mood', ...seed },
  { key: 'boredom', name: 'Скука', type: 'scale', order: 2, primary: false, face: 'boredom', ...seed },
  { key: 'sleepStart', name: 'Лёг', type: 'time', order: 3, primary: false, ...seed },
  { key: 'sleepEnd', name: 'Встал', type: 'time', order: 4, primary: false, ...seed },
]

export const SCALE_LABELS: Record<FaceKind, string[]> = {
  mood: ['очень плохо', 'плохо', 'нормально', 'хорошо', 'отлично'],
  boredom: ['не скучно', 'чуть-чуть', 'средне', 'скучно', 'очень скучно'],
}

export const METRIC_TYPE_NAMES: Record<MetricType, string> = {
  scale: 'Шкала 1–5',
  time: 'Время',
  number: 'Число',
  bool: 'Да / нет',
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function validateMetricValue(def: Pick<MetricDefinition, 'type'>, value: unknown): value is MetricValue {
  switch (def.type) {
    case 'scale':
      return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
    case 'time':
      return typeof value === 'string' && TIME_RE.test(value)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'bool':
      return typeof value === 'boolean'
  }
}

/** Заполненный день: хотя бы одно значение метрики или непустой текст. */
export function isDayFilled(rec: Pick<DayRecord, 'metrics' | 'text' | 'deletedAt'>): boolean {
  if (rec.deletedAt) return false
  return Object.keys(rec.metrics).length > 0 || rec.text.trim() !== ''
}

/** Сколько символов текста нужно, чтобы день засчитался в серию. */
export const STREAK_TEXT_MIN = 40

/** Полный день: заполнены все активные метрики и текст не короче STREAK_TEXT_MIN символов. */
export function isDayComplete(rec: Pick<DayRecord, 'metrics' | 'text'>, defs: MetricDefinition[]): boolean {
  if (rec.text.trim().length < STREAK_TEXT_MIN) return false
  return activeMetrics(defs).every((d) => rec.metrics[d.key] !== undefined)
}

export function sortMetrics(defs: MetricDefinition[]): MetricDefinition[] {
  return [...defs].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
}

export function activeMetrics(defs: MetricDefinition[]): MetricDefinition[] {
  return sortMetrics(defs).filter((d) => !d.archived)
}

export type FormCard =
  | { kind: 'sleep'; start: MetricDefinition; end: MetricDefinition }
  | { kind: 'metric'; def: MetricDefinition }

/** Карточки формы дня: «Лёг» и «Встал» — одна карточка «Сон», если обе активны. */
export function formCards(defs: MetricDefinition[]): FormCard[] {
  const active = activeMetrics(defs)
  const start = active.find((d) => d.key === 'sleepStart' && d.type === 'time')
  const end = active.find((d) => d.key === 'sleepEnd' && d.type === 'time')
  const cards: FormCard[] = []
  for (const def of active) {
    if (start && end && (def === start || def === end)) {
      if (!cards.some((c) => c.kind === 'sleep')) cards.push({ kind: 'sleep', start, end })
      continue
    }
    cards.push({ kind: 'metric', def })
  }
  return cards
}

export function newMetricKey(existing: string[]): string {
  let n = 1
  while (existing.includes(`m${n}`)) n++
  return `m${n}`
}

const maxOrder = (defs: MetricDefinition[]) => Math.max(0, ...defs.map((d) => d.order))

export function createMetric(
  input: { name: string; type: MetricType; unit?: string },
  existing: MetricDefinition[],
  now: string,
): MetricDefinition {
  const name = input.name.trim()
  if (!name) throw new Error('Пустое название метрики')
  const unit = input.type === 'number' ? input.unit?.trim() : undefined
  return {
    key: newMetricKey(existing.map((d) => d.key)),
    name,
    type: input.type,
    ...(unit ? { unit } : {}),
    order: maxOrder(existing) + 1,
    archived: false,
    primary: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function renameMetric(def: MetricDefinition, name: string, now: string): MetricDefinition | null {
  const trimmed = name.trim()
  if (!trimmed || trimmed === def.name) return null
  return { ...def, name: trimmed, updatedAt: now }
}

/** Меняет местами с соседом среди активных и перенумеровывает их 1…N. Возвращает только изменённые. */
export function moveMetric(defs: MetricDefinition[], key: string, dir: -1 | 1, now: string): MetricDefinition[] {
  const active = activeMetrics(defs)
  const i = active.findIndex((d) => d.key === key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= active.length) return []
  const reordered = [...active]
  ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
  return reordered.flatMap((d, idx) => (d.order === idx + 1 ? [] : [{ ...d, order: idx + 1, updatedAt: now }]))
}

export function setArchived(
  def: MetricDefinition,
  archived: boolean,
  defs: MetricDefinition[],
  now: string,
): MetricDefinition {
  return { ...def, archived, updatedAt: now, ...(archived ? {} : { order: maxOrder(defs) + 1 }) }
}
