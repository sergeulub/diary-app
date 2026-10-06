import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { getMetrics, saveMetrics } from '../db/diary'
import { isoWithOffset } from '../domain/dates'
import {
  METRIC_TYPE_NAMES, activeMetrics, createMetric, moveMetric, renameMetric, setArchived, sortMetrics,
} from '../domain/metrics'
import type { MetricDefinition, MetricType } from '../domain/types'
import { errorText } from './errors'
import { Card } from './MetricCards'

const now = () => isoWithOffset(new Date())
const TYPES = Object.keys(METRIC_TYPE_NAMES) as MetricType[]
const field = 'min-h-[44px] rounded-[14px] border border-line bg-bg px-3.5 text-[16px] text-ink outline-none'

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-[14px] text-accent disabled:opacity-30"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
    </button>
  )
}

export default function MetricsSettings() {
  const defs = useLiveQuery(getMetrics)
  const [name, setName] = useState('')
  const [type, setType] = useState<MetricType>('scale')
  const [unit, setUnit] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!defs) return null

  const all: MetricDefinition[] = defs
  const active = activeMetrics(all)
  const archived = sortMetrics(all).filter((d) => d.archived)
  const save = (changed: MetricDefinition[]) => {
    if (!changed.length) return
    saveMetrics(changed).then(() => setError(null), (e) => setError(`Не сохранилось: ${errorText(e)}`))
  }
  const add = () => {
    save([createMetric({ name, type, unit }, all, now())])
    setName('')
    setUnit('')
  }

  return (
    <Card title="Метрики">
      <ul className="flex flex-col">
        {active.map((def, i) => (
          <li key={def.key} className="flex items-center gap-1 border-b border-line py-1.5 last:border-b-0">
            <div className="flex min-w-0 flex-1 flex-col">
              <input
                defaultValue={def.name} aria-label="Название метрики"
                onBlur={(e) => {
                  const renamed = renameMetric(def, e.target.value, now())
                  if (renamed) save([renamed])
                  else e.target.value = def.name
                }}
                className="min-h-[32px] bg-transparent text-[16px] text-ink outline-none"
              />
              <span className="text-[12px] text-muted">
                {METRIC_TYPE_NAMES[def.type]}{def.unit ? `, ${def.unit}` : ''}{def.primary ? ' · красит календарь' : ''}
              </span>
            </div>
            <IconButton label="Выше" disabled={i === 0} onClick={() => save(moveMetric(all, def.key, -1, now()))}>
              <path d="M12 19V5M6 11l6-6 6 6" />
            </IconButton>
            <IconButton label="Ниже" disabled={i === active.length - 1} onClick={() => save(moveMetric(all, def.key, 1, now()))}>
              <path d="M12 5v14M6 13l6 6 6-6" />
            </IconButton>
            <IconButton label="В архив" onClick={() => save([setArchived(def, true, all, now())])}>
              <rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" />
            </IconButton>
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <span className="text-[13px] font-semibold text-muted">В архиве — скрыты на «Итоге», история хранится</span>
          {archived.map((def) => (
            <div key={def.key} className="flex items-center justify-between gap-2">
              <span className="text-[16px] text-muted">{def.name}</span>
              <button
                type="button" onClick={() => save([setArchived(def, false, all, now())])}
                className="min-h-[44px] px-2 text-[15px] font-semibold text-accent"
              >
                Вернуть
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Новая метрика, например «Энергия»" className={field} />
        <div className="flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as MetricType)} aria-label="Тип метрики" className={`${field} flex-1`}>
            {TYPES.map((t) => <option key={t} value={t}>{METRIC_TYPE_NAMES[t]}</option>)}
          </select>
          {type === 'number' && (
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ед., напр. км" className={`${field} w-32`} />
          )}
        </div>
        <button
          type="button" disabled={!name.trim()} onClick={add}
          className="min-h-[48px] rounded-[14px] bg-accent text-[17px] font-semibold text-accent-ink disabled:opacity-40"
        >
          Добавить
        </button>
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </Card>
  )
}
