import { strToU8, zipSync } from 'fflate'
import { isLater, isoWithOffset, monthOf } from './dates'
import { liveTransactions, totalsByCategory } from './finance'
import { AREA_LABELS, GOAL_STATE_LABELS, formatGoalValue, goalProgress, goalsOfMonth } from './goals'
import { formatDate, logicalDay } from './logicalDay'
import { SCALE_LABELS, isDayFilled, sortMetrics } from './metrics'
import { formatAmount, formatMoney } from './money'
import { monthName, weekdayName } from './ru'
import { formatDuration, sleepDuration } from './sleep'
import type { DayRecord, DiarySnapshot, FinanceCategory, MetricDefinition, MetricValue, Transaction } from './types'

export const FORMAT_VERSION = 2

export interface Backup extends DiarySnapshot {
  formatVersion: number
  exportedAt: string
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
    meta: s.meta,
  }
}

/**
 * Дни для Markdown: после прошлого экспорта (первый — все) изменилась запись дня или любая его операция,
 * и в дне есть что показать — заполненная запись или живые операции. По возрастанию даты.
 */
export function selectChangedDays(s: DiarySnapshot): string[] {
  const since = s.meta.lastExportAt
  const changed = (x: { updatedAt: string }) => since === null || isLater(x.updatedAt, since)
  const candidates = new Set([...s.days.filter(changed).map((d) => d.day), ...s.transactions.filter(changed).map((t) => t.day)])
  const records = new Map(s.days.map((d) => [d.day, d]))
  const withLive = new Set(liveTransactions(s.transactions).map((t) => t.day))
  return [...candidates]
    .filter((day) => {
      const rec = records.get(day)
      return (rec !== undefined && isDayFilled(rec)) || withLive.has(day)
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

/** «Доходы: …» и «Траты: …» дня; категории по убыванию суммы, комментарии в скобках. */
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
  return lines
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
  const bytes = zipSync({
    'backup.json': strToU8(JSON.stringify(backup, null, 2)),
    [`entries_${from}_${to}.md`]: strToU8(renderMarkdown(s, changed, logicalDay(now, s.meta.boundaryHour))),
  })
  return { fileName: `diary-${today}.zip`, bytes }
}
