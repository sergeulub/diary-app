import { strToU8, zipSync, type Zippable } from 'fflate'
import { isLater, isoWithOffset, monthOf } from './dates'
import { SAVINGS_KINDS, SAVINGS_LABELS, liveTransactions, totalsByCategory } from './finance'
import { AREA_LABELS, GOAL_STATE_LABELS, formatGoalValue, goalProgress, goalsOfMonth } from './goals'
import { formatDate, logicalDay } from './logicalDay'
import { SCALE_LABELS, isDayFilled, sortMetrics } from './metrics'
import { formatAmount, formatMoney } from './money'
import { isReviewEmpty, livePhotos, reviewsOfDay } from './reviews'
import { monthName, weekdayName } from './ru'
import { formatDuration, sleepDuration } from './sleep'
import type {
  DayRecord, DiarySnapshot, EntryRecord, FinanceCategory, MetricDefinition, MetricValue, PhotoRecord, Transaction,
} from './types'

export const FORMAT_VERSION = 4

/** Фото в backup.json — без байтов; file — путь в zip, у удалённого null. */
export type PhotoMeta = Omit<PhotoRecord, 'bytes'> & { file: string | null }

export interface Backup extends Omit<DiarySnapshot, 'photos'> {
  formatVersion: number
  exportedAt: string
  photos: PhotoMeta[]
}

export const photoPath = (id: string) => `photos/${id}.jpg`

function photoMeta({ bytes: _bytes, ...rest }: PhotoRecord): PhotoMeta {
  return { ...rest, file: rest.deletedAt ? null : photoPath(rest.id) }
}

export function buildBackup(s: DiarySnapshot, exportedAt: string): Backup {
  return {
    formatVersion: FORMAT_VERSION,
    exportedAt,
    metricDefinitions: s.metricDefinitions,
    days: s.days,
    entries: s.entries,
    financeCategories: s.financeCategories,
    transactions: s.transactions,
    goals: s.goals,
    photos: s.photos.map(photoMeta),
    meta: s.meta,
  }
}

/** Непустые живые разборы дня по порядку. */
const reviewsForExport = (s: DiarySnapshot, day: string) =>
  reviewsOfDay(s.entries, day).filter((e) => !isReviewEmpty(e, s.photos))

/**
 * Дни для Markdown: после прошлого экспорта (первый — все) изменилась запись дня, любая его операция или разбор,
 * и в дне есть что показать — заполненная запись, живые операции или непустой разбор. По возрастанию даты.
 */
export function selectChangedDays(s: DiarySnapshot): string[] {
  const since = s.meta.lastExportAt
  const changed = (x: { updatedAt: string }) => since === null || isLater(x.updatedAt, since)
  const candidates = new Set([
    ...s.days.filter(changed).map((d) => d.day),
    ...s.transactions.filter(changed).map((t) => t.day),
    ...s.entries.filter(changed).map((e) => e.day),
  ])
  const records = new Map(s.days.map((d) => [d.day, d]))
  const withLive = new Set(liveTransactions(s.transactions).map((t) => t.day))
  return [...candidates]
    .filter((day) => {
      const rec = records.get(day)
      return (rec !== undefined && isDayFilled(rec)) || withLive.has(day) || reviewsForExport(s, day).length > 0
    })
    .sort()
}

function formatValue(def: MetricDefinition, v: MetricValue): string {
  switch (def.type) {
    case 'scale':
      return def.face === 'mood' ? `${v}/5 (${SCALE_LABELS.mood[Number(v) - 1]})` : `${v}/5`
    case 'time':
      return String(v)
    case 'number':
      return def.unit ? `${v} ${def.unit}` : String(v)
    case 'bool':
      return v ? 'да' : 'нет'
  }
}

export function metricsLine(rec: DayRecord, defs: MetricDefinition[]): string {
  const { sleepStart, sleepEnd } = rec.metrics
  const sleep = sleepDuration(sleepStart, sleepEnd)
  const parts: string[] = []
  for (const def of sortMetrics(defs)) {
    const v = rec.metrics[def.key]
    if (v === undefined) continue
    if (sleep !== null && def.key === 'sleepEnd') continue
    if (sleep !== null && def.key === 'sleepStart') {
      parts.push(`Сон: ${sleepStart}–${sleepEnd} (${formatDuration(sleep)})`)
      continue
    }
    parts.push(`${def.name}: ${formatValue(def, v)}`)
  }
  for (const key of Object.keys(rec.metrics).sort()) {
    if (!defs.some((d) => d.key === key)) parts.push(`${key}: ${String(rec.metrics[key])}`)
  }
  return parts.join(' · ')
}

const KIND_TITLES = { income: 'Доходы', expense: 'Траты' } as const

/** «Доходы: …» и «Траты: …» дня — категории по убыванию суммы; затем «Отложил: …» и «Взял: …»; комментарии в скобках. */
export function financeLines(txs: Transaction[], cats: FinanceCategory[]): string[] {
  const lines: string[] = []
  for (const kind of ['income', 'expense'] as const) {
    const ofKind = liveTransactions(txs).filter((t) => t.kind === kind)
    if (!ofKind.length) continue
    const total = ofKind.reduce((sum, t) => sum + t.amount, 0)
    const parts = totalsByCategory(ofKind, cats).map((c) => {
      const notes = ofKind.filter((t) => t.categoryKey === c.key && t.note).map((t) => t.note)
      return `${c.name} ${formatAmount(c.amount)}${notes.length ? ` (${notes.join(', ')})` : ''}`
    })
    lines.push(`${KIND_TITLES[kind]}: ${formatMoney(total)} — ${parts.join(' · ')}`)
  }
  for (const kind of SAVINGS_KINDS) {
    const ofKind = liveTransactions(txs).filter((t) => t.kind === kind)
    if (!ofKind.length) continue
    const notes = ofKind.filter((t) => t.note).map((t) => t.note)
    const total = ofKind.reduce((sum, t) => sum + t.amount, 0)
    lines.push(`${SAVINGS_LABELS[kind]}: ${formatMoney(total)}${notes.length ? ` (${notes.join(', ')})` : ''}`)
  }
  return lines
}

const REVIEW_FIELDS: [keyof Pick<EntryRecord, 'text' | 'verdict' | 'change'>, string][] = [
  ['text', 'Что это'],
  ['verdict', 'Работает ли'],
  ['change', 'Как сделал бы сам'],
]

/** Блоки «### Разбор N» дня; пустые поля пропускаются, фото — путями в zip. */
export function reviewLines(reviews: EntryRecord[], photos: PhotoRecord[]): string[] {
  return reviews.flatMap((r, i) => {
    const lines = ['', `### Разбор ${i + 1}`]
    for (const [key, label] of REVIEW_FIELDS) {
      const value = r[key]?.trim()
      if (value) lines.push(`**${label}:** ${value}`)
    }
    const files = livePhotos(photos, r.id).map((p) => photoPath(p.id))
    if (files.length) lines.push(`Фото: ${files.join(', ')}`)
    return lines
  })
}

/** Раздел «# Цели — ноябрь 2026»; у месяца без живых целей — пустая строка. */
export function goalsSection(s: DiarySnapshot, month: string, today: string): string {
  const goals = goalsOfMonth(s.goals, month)
  if (!goals.length) return ''
  const lines = goals.map((g) => {
    const text = g.text.trim().replace(/\s*\n\s*/g, ' ')
    const p = goalProgress(g, s, today)
    const status = p && g.target
      ? ` — сейчас ${formatGoalValue(g.target, p.value, s.metricDefinitions)}, ${GOAL_STATE_LABELS[p.state]}`
      : ''
    return `- [${AREA_LABELS[g.area]}] ${text}${status}`
  })
  return `# Цели — ${monthName(month)}\n${lines.join('\n')}\n`
}

export function renderMarkdown(s: DiarySnapshot, days: string[], today: string): string {
  if (days.length === 0) return 'Изменённых дней с прошлого экспорта нет.\n'
  const records = new Map(s.days.map((d) => [d.day, d]))
  const goals = [...new Set(days.map(monthOf))].map((m) => goalsSection(s, m, today)).filter(Boolean)
  const blocks = days.map((day) => {
    const rec: DayRecord | undefined = records.get(day)
    const live = rec && !rec.deletedAt ? rec : undefined
    const lines = [`## ${day}, ${weekdayName(day)}`]
    const metrics = live ? metricsLine(live, s.metricDefinitions) : ''
    if (metrics) lines.push(metrics)
    lines.push(...financeLines(s.transactions.filter((t) => t.day === day), s.financeCategories))
    const text = live?.text.trim() ?? ''
    if (text) lines.push('', text)
    lines.push(...reviewLines(reviewsForExport(s, day), s.photos))
    return lines.join('\n') + '\n'
  })
  return [...goals, ...blocks].join('\n')
}

export function buildExportZip(s: DiarySnapshot, now: Date): { fileName: string; bytes: Uint8Array } {
  const today = formatDate(now)
  const changed = selectChangedDays(s)
  const from = changed[0] ?? today
  const to = changed[changed.length - 1] ?? today
  const backup = buildBackup(s, isoWithOffset(now))
  // JPEG уже сжат: кладём без повторного сжатия
  const photos: Zippable = {}
  for (const p of s.photos) if (!p.deletedAt) photos[photoPath(p.id)] = [p.bytes, { level: 0 }]
  const bytes = zipSync({
    'backup.json': strToU8(JSON.stringify(backup, null, 2)),
    [`entries_${from}_${to}.md`]: strToU8(renderMarkdown(s, changed, logicalDay(now, s.meta.boundaryHour))),
    ...photos,
  })
  return { fileName: `diary-${today}.zip`, bytes }
}
