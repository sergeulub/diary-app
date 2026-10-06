import { useState, type ReactNode } from 'react'
import { SCALE_LABELS } from '../domain/metrics'
import { formatDuration, sleepDuration } from '../domain/sleep'
import type { FaceKind, MetricDefinition, MetricValue } from '../domain/types'
import { Face } from './faces'

type OnChange = (value: MetricValue | null) => void

export function Card({ title, aside, className = '', children }: {
  title: string
  aside?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4 shadow-card ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

const SCALE = [1, 2, 3, 4, 5]

/** Повторный тап по выбранной мордочке снимает выбор. */
function FaceScale({ name, face, value, onChange }: { name: string; face: FaceKind; value: MetricValue | undefined; onChange: OnChange }) {
  return (
    <div className="flex justify-between">
      {SCALE.map((n) => {
        const selected = value === n
        const dimmed = value !== undefined && !selected
        return (
          <button
            key={n} type="button" aria-pressed={selected} aria-label={`${name} ${n}, ${SCALE_LABELS[face][n - 1]}`}
            onClick={() => onChange(selected ? null : n)}
            className={`flex size-14 items-center justify-center rounded-full transition ${
              selected ? 'scale-106 ring-[2.5px] ring-accent' : dimmed ? 'opacity-55' : ''
            }`}
          >
            <Face kind={face} value={n} />
          </button>
        )
      })}
    </div>
  )
}

const choiceClass = (selected: boolean) =>
  `min-h-[44px] rounded-[14px] border-[1.5px] text-[16px] font-semibold ${
    selected ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink'
  }`

function DigitScale({ name, value, onChange }: { name: string; value: MetricValue | undefined; onChange: OnChange }) {
  return (
    <div className="flex justify-between">
      {SCALE.map((n) => (
        <button
          key={n} type="button" aria-pressed={value === n} aria-label={`${name} ${n}`}
          onClick={() => onChange(value === n ? null : n)} className={`w-14 ${choiceClass(value === n)}`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function BoolChoice({ value, onChange }: { value: MetricValue | undefined; onChange: OnChange }) {
  return (
    <div className="flex gap-2.5">
      {([true, false] as const).map((v) => (
        <button
          key={String(v)} type="button" aria-pressed={value === v}
          onClick={() => onChange(value === v ? null : v)} className={`flex-1 ${choiceClass(value === v)}`}
        >
          {v ? 'Да' : 'Нет'}
        </button>
      ))}
    </div>
  )
}

/** Системный выбор времени iOS; «Сбросить» в нём очищает значение. */
function TimeField({ label, value, onChange }: { label: string; value: MetricValue | undefined; onChange: OnChange }) {
  return (
    <label className="flex w-[108px] flex-col gap-0.5 rounded-[14px] border border-line bg-bg px-3.5 py-2.5">
      <span className="text-[13px] text-muted">{label}</span>
      <input
        type="time" value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-h-[28px] w-full bg-transparent text-[22px] font-semibold tabular-nums text-ink outline-none"
      />
    </label>
  )
}

function NumberField({ def, value, onChange }: { def: MetricDefinition; value: MetricValue | undefined; onChange: OnChange }) {
  const stored = typeof value === 'number' ? String(value) : ''
  const [draft, setDraft] = useState(stored)
  function commit() {
    const s = draft.trim().replace(',', '.')
    if (s === stored) return
    if (s === '') return onChange(null)
    const n = Number(s)
    if (Number.isFinite(n)) onChange(n)
    else setDraft(stored)
  }
  return (
    <div className="flex items-center gap-2">
      <input
        inputMode="decimal" value={draft} aria-label={def.name}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        className="min-h-[44px] w-32 rounded-[14px] border border-line bg-bg px-3.5 text-[17px] text-ink outline-none"
      />
      {def.unit && <span className="text-[15px] text-muted">{def.unit}</span>}
    </div>
  )
}

export function MetricCard({ def, value, onChange }: { def: MetricDefinition; value: MetricValue | undefined; onChange: OnChange }) {
  return (
    <Card title={def.name}>
      {def.type === 'scale' && def.face && <FaceScale name={def.name} face={def.face} value={value} onChange={onChange} />}
      {def.type === 'scale' && !def.face && <DigitScale name={def.name} value={value} onChange={onChange} />}
      {def.type === 'time' && <TimeField label="время" value={value} onChange={onChange} />}
      {def.type === 'number' && <NumberField def={def} value={value} onChange={onChange} />}
      {def.type === 'bool' && <BoolChoice value={value} onChange={onChange} />}
    </Card>
  )
}

export function SleepCard({ start, end, metrics, onChange }: {
  start: MetricDefinition
  end: MetricDefinition
  metrics: Record<string, MetricValue>
  onChange: (key: string, value: MetricValue | null) => void
}) {
  const duration = sleepDuration(metrics[start.key], metrics[end.key])
  return (
    <Card title="Сон">
      <div className="flex items-center gap-2.5">
        <TimeField label={start.name} value={metrics[start.key]} onChange={(v) => onChange(start.key, v)} />
        <TimeField label={end.name} value={metrics[end.key]} onChange={(v) => onChange(end.key, v)} />
        {duration !== null && (
          <div className="flex flex-1 flex-col items-end gap-0.5">
            <span className="text-[15px] font-semibold">{formatDuration(duration)}</span>
            <span className="text-[13px] text-muted">сон</span>
          </div>
        )}
      </div>
    </Card>
  )
}
