export type MetricType = 'scale' | 'time' | 'number' | 'bool'
export type MetricValue = number | string | boolean
export type FaceKind = 'mood' | 'boredom'

export interface MetricDefinition {
  key: string
  name: string
  type: MetricType
  unit?: string
  order: number
  archived: boolean
  /** Главная метрика красит календарь. */
  primary: boolean
  face?: FaceKind
  createdAt: string
  updatedAt: string
}

export interface DayRecord {
  /** Логический день ГГГГ-ММ-ДД — ключ таблицы. */
  day: string
  id: string
  metrics: Record<string, MetricValue>
  text: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Заготовка под дневную ленту; в MVP пустая. */
export interface EntryRecord {
  id: string
  day: string
  text: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Meta {
  boundaryHour: number
  lastExportAt: string | null
  schemaVersion: number
}

export interface DiarySnapshot {
  metricDefinitions: MetricDefinition[]
  days: DayRecord[]
  entries: EntryRecord[]
  meta: Meta
}
