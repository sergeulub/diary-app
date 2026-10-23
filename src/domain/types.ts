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

/** Применённый файл изменений с ПК: по basedOnExportAt лента отделяет то, что Claude уже видел. */
export interface AppliedPatch {
  id: string
  appliedAt: string
  basedOnExportAt: string
}

export interface Meta {
  boundaryHour: number
  lastExportAt: string | null
  schemaVersion: number
  /** Нет — ни один файл изменений не применён. */
  appliedPatches?: AppliedPatch[]
}

export interface DiarySnapshot extends PeopleData {
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
/** Операции накоплений: «Отложил» и «Взял». Не доход и не траты, категории нет. */
export type SavingsKind = 'save' | 'withdraw'
export type TransactionKind = FinanceKind | SavingsKind
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
  /** У доходов и трат совпадает с kind категории. */
  kind: TransactionKind
  /** Целые копейки, > 0. */
  amount: number
  /** У накоплений — пустая строка. */
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

export type ContactType = 'phone' | 'telegram' | 'email' | 'linkedin' | 'other'

export interface Contact {
  type: ContactType
  value: string
}

/** Человек модуля «Люди». Обязательно только имя; остальное — пустые строки и списки. */
export interface Person {
  id: string
  name: string
  /** «Как ещё называю» — помогает Claude узнать человека в дневнике. */
  aliases: string[]
  company: string
  position: string
  /** «Чем занимается». */
  about: string
  sphereKeys: string[]
  /** '' — круг не выбран. */
  circleKey: string
  /** «Чем может быть полезен». */
  canHelp: string
  /** «Чем я могу быть полезен ему». */
  iCanHelp: string
  personal: string
  contacts: Contact[]
  archived: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type PersonNoteKind = 'meeting' | 'diary'

/** Запись ленты человека. У diary заполнены только day и talk. */
export interface PersonNote {
  id: string
  personId: string
  kind: PersonNoteKind
  /** Логический день ГГГГ-ММ-ДД. */
  day: string
  /** Копия названия события или повод из файла изменений; в форме не вводится. */
  occasion: string
  /** '' — без события. */
  eventId: string
  /** «О чём говорили». */
  talk: string
  /** «Что актуально у него». */
  life: string
  /** «Договорились, следующий шаг». */
  agreements: string
  /** Исходная заметка, набранная или надиктованная на ходу. */
  original: string
  /** id файла изменений, который создал запись или последним менял её поля; '' — только из телефона. */
  patchId: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Событие, где знакомишься сразу с несколькими (не Event: имя занято DOM). */
export interface PeopleEvent {
  id: string
  day: string
  title: string
  topic: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Сфера из общего словаря; объединённая — с deletedAt. */
export interface Sphere {
  key: string
  name: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Circle {
  key: string
  name: string
  order: number
  archived: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** «Знаком с» — двусторонняя связь; a < b строкой. */
export interface PersonLink {
  id: string
  a: string
  b: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface PeopleData {
  people: Person[]
  personNotes: PersonNote[]
  events: PeopleEvent[]
  spheres: Sphere[]
  circles: Circle[]
  personLinks: PersonLink[]
}
