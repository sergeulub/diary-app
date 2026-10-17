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
  /** Когда день впервые заполнен полностью в свой логический день — только такие дни идут в серию. */
  completedAt?: string
}

/**
 * Запись внутри дня. Сейчас — только разборы насмотренности (kind: 'review'):
 * text — «что это, для кого, что обещает», verdict — «работает ли и почему», change — «как сделал бы сам».
 */
export interface EntryRecord {
  id: string
  day: string
  kind?: 'review'
  text: string
  verdict?: string
  change?: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Фото к записи. Удалённое хранит пустые bytes. */
export interface PhotoRecord {
  id: string
  entryId: string
  /** Логический день записи. */
  day: string
  type: string
  bytes: Uint8Array
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
  financeCategories: FinanceCategory[]
  transactions: Transaction[]
  goals: Goal[]
  photos: PhotoRecord[]
  meta: Meta
}

export type FinanceKind = 'expense' | 'income'
/** Важность категории трат: необходимо / полезно / можно без этого. */
export type Importance = 'need' | 'useful' | 'optional'

export interface FinanceCategory {
  key: string
  kind: FinanceKind
  name: string
  /** Только у категорий трат. */
  importance?: Importance
  order: number
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  /** Логический день ГГГГ-ММ-ДД. */
  day: string
  /** Совпадает с kind категории. */
  kind: FinanceKind
  /** Целые копейки, > 0. */
  amount: number
  categoryKey: string
  note?: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type GoalArea = 'finance' | 'work' | 'study' | 'health' | 'relations' | 'other'
export type GoalOp = 'le' | 'ge'
export type GoalAggregate = 'count' | 'sum' | 'avg'

export type GoalTarget =
  | {
      kind: 'finance'
      measure: 'expense' | 'income' | 'saved'
      /** categoryKey — для expense и income; importance — только для expense; у saved фильтра нет. */
      filter?: { categoryKey: string } | { importance: Importance }
      op: GoalOp
      /** Копейки. */
      value: number
    }
  | { kind: 'metric'; metricKey: string; aggregate: GoalAggregate; op: GoalOp; value: number }
  /** Число непустых разборов за месяц. */
  | { kind: 'reviews'; op: GoalOp; value: number }

export interface Goal {
  id: string
  /** ГГГГ-ММ */
  month: string
  text: string
  area: GoalArea
  target?: GoalTarget
  order: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
