import { strToU8, zipSync } from 'fflate'
import { isLater, isoWithOffset } from './dates'
import { formatDate } from './logicalDay'
import { SCALE_LABELS, isDayFilled, sortMetrics } from './metrics'
import { weekdayName } from './ru'
import { formatDuration, sleepDuration } from './sleep'
import type { DayRecord, DiarySnapshot, MetricDefinition, MetricValue } from './types'

export const FORMAT_VERSION = 1

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
    meta: s.meta,
  }
}

/** Заполненные дни, изменённые после прошлого экспорта (первый экспорт — все), по возрастанию даты. */
export function selectChangedDays(days: DayRecord[], lastExportAt: string | null): DayRecord[] {
  return days
    .filter((d) => isDayFilled(d) && (lastExportAt === null || isLater(d.updatedAt, lastExportAt)))
    .sort((a, b) => a.day.localeCompare(b.day))
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

export function renderMarkdown(days: DayRecord[], defs: MetricDefinition[]): string {
  if (days.length === 0) return 'Изменённых дней с прошлого экспорта нет.\n'
  return days
    .map((rec) => {
      const lines = [`## ${rec.day}, ${weekdayName(rec.day)}`]
      const metrics = metricsLine(rec, defs)
      if (metrics) lines.push(metrics)
      const text = rec.text.trim()
      if (text) lines.push('', text)
      return lines.join('\n') + '\n'
    })
    .join('\n')
}

export function buildExportZip(s: DiarySnapshot, now: Date): { fileName: string; bytes: Uint8Array } {
  const today = formatDate(now)
  const changed = selectChangedDays(s.days, s.meta.lastExportAt)
  const from = changed[0]?.day ?? today
  const to = changed[changed.length - 1]?.day ?? today
  const backup = buildBackup(s, isoWithOffset(now))
  const bytes = zipSync({
    'backup.json': strToU8(JSON.stringify(backup, null, 2)),
    [`entries_${from}_${to}.md`]: strToU8(renderMarkdown(changed, s.metricDefinitions)),
  })
  return { fileName: `diary-${today}.zip`, bytes }
}
