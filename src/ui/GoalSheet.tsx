import { useRef, useState } from 'react'
import { saveGoals } from '../db/diary'
import { IMPORTANCES, IMPORTANCE_LABELS, activeCategories } from '../domain/finance'
import {
  AGGREGATE_LABELS, AREAS, AREA_LABELS, GOAL_STATE_LABELS, allowedAggregates, createGoal, deleteGoal, formFromTarget,
  formatGoalValue, goalProgress, moveGoal, targetFromForm, updateGoal,
  type ProgressData, type TargetForm, type TargetMeasure,
} from '../domain/goals'
import { activeMetrics } from '../domain/metrics'
import type { Goal, GoalArea, GoalOp, GoalTarget } from '../domain/types'
import { errorText } from './errors'
import { Segmented, Sheet, now } from './financeUi'
import { Card } from './MetricCards'

const MEASURES: { value: TargetMeasure; label: string }[] = [
  { value: 'expense', label: 'Траты' },
  { value: 'income', label: 'Доход' },
  { value: 'saved', label: 'Отложено' },
  { value: 'metric', label: 'Привычка' },
  { value: 'reviews', label: 'Разборы' },
]
const OPS: { value: GoalOp; label: string }[] = [
  { value: 'le', label: 'не больше' },
  { value: 'ge', label: 'не меньше' },
]
const field = 'min-h-[44px] rounded-[14px] border border-line bg-bg px-3 text-[16px] text-ink outline-none'

export default function GoalSheet({ initial, month, goals, data, today, onClose }: {
  initial: Goal | null
  month: string
  goals: Goal[]
  data: ProgressData
  today: string
  onClose: () => void
}) {
  const [text, setText] = useState(initial?.text ?? '')
  const [area, setArea] = useState<GoalArea>(initial?.area ?? 'finance')
  const [measured, setMeasured] = useState(Boolean(initial?.target))
  const [form, setForm] = useState<TargetForm>(() => formFromTarget(initial?.target))
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const set = (patch: Partial<TargetForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setError(null)
  }

  const metrics = activeMetrics(data.metricDefinitions).filter((d) => allowedAggregates(d.type).length > 0)
  const metricDef = data.metricDefinitions.find((d) => d.key === form.metricKey)
  const aggregates = metricDef ? allowedAggregates(metricDef.type) : []
  const cats = activeCategories(data.financeCategories, form.measure === 'income' ? 'income' : 'expense')
  const isFinance = form.measure !== 'metric' && form.measure !== 'reviews'
  const suffix = isFinance ? '₽' : form.measure === 'reviews' ? '' : form.aggregate === 'count' ? 'дн.' : (metricDef?.unit ?? '')

  let draft: GoalTarget | null = null
  try {
    draft = measured ? targetFromForm(form) : null
  } catch {
    draft = null
  }
  const probe: Goal = { id: 'draft', month, text, area, order: 0, createdAt: '', updatedAt: '', deletedAt: null, ...(draft ? { target: draft } : {}) }
  const preview = draft ? goalProgress(probe, data, today) : null

  function pickMeasure(measure: TargetMeasure) {
    const first = metrics[0]
    set({
      measure, filter: '',
      ...(measure === 'reviews' ? { op: 'ge' as const } : {}),
      ...(measure === 'metric' && !form.metricKey && first ? { metricKey: first.key, aggregate: allowedAggregates(first.type)[0] } : {}),
    })
  }

  function pickMetric(key: string) {
    const def = data.metricDefinitions.find((d) => d.key === key)
    if (def) set({ metricKey: key, aggregate: allowedAggregates(def.type)[0] })
  }

  async function save() {
    if (!text.trim()) {
      setError('Напишите цель')
      return
    }
    let target: GoalTarget | null = null
    if (measured) {
      try {
        target = targetFromForm(form)
      } catch (e) {
        setError(errorText(e))
        return
      }
    }
    // двойной тап по «Сохранить» не создаёт вторую цель
    if (busy.current) return
    busy.current = true
    try {
      const goal = initial
        ? updateGoal(initial, { text, area, target }, now())
        : createGoal({ month, text, area, ...(target ? { target } : {}) }, goals, now())
      await saveGoals([goal])
      onClose()
    } catch (e) {
      busy.current = false
      setError(`Не сохранилось: ${errorText(e)}`)
    }
  }

  async function run(action: () => Promise<void>) {
    try {
      await action()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const side = 'min-h-[44px] w-24 text-[16px] text-accent'
  return (
    <Sheet>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onClose} className={`${side} text-left`}>Отмена</button>
        <h2 className="font-serif text-[20px] font-semibold">{initial ? 'Цель' : 'Новая цель'}</h2>
        <button type="button" onClick={() => void save()} className={`${side} text-right font-semibold`}>Сохранить</button>
      </div>

      <Card title="Цель — своими словами">
        <textarea
          rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Цель"
          placeholder="Например, «Тратить на кафе не больше 6 000 ₽»"
          className="resize-none bg-transparent text-[17px] leading-[1.35] text-ink outline-none placeholder:text-muted"
        />
      </Card>

      <Card title="Сфера">
        <div className="flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <button
              key={a} type="button" aria-pressed={a === area} onClick={() => setArea(a)}
              className={`min-h-[40px] rounded-full border px-3.5 text-[14px] ${
                a === area ? 'border-accent bg-accent font-semibold text-accent-ink' : 'border-line bg-bg text-ink'
              }`}
            >
              {AREA_LABELS[a]}
            </button>
          ))}
        </div>
      </Card>

      <Card
        title="Измерять"
        aside={
          <button
            type="button" role="switch" aria-checked={measured} aria-label="Измерять" onClick={() => setMeasured((v) => !v)}
            className={`flex h-8 w-[52px] rounded-full p-0.5 ${measured ? 'justify-end bg-accent' : 'justify-start bg-line'}`}
          >
            <span className="size-7 rounded-full bg-white shadow" />
          </button>
        }
      >
        {!measured ? (
          <p className="text-[14px] text-muted">Без измерения цель сверит Claude по записям дней в конце месяца.</p>
        ) : (
          <>
            <Segmented label="Что измерять" options={MEASURES} value={form.measure} onChange={pickMeasure} />
            {(form.measure === 'expense' || form.measure === 'income') && (
              <label className="flex items-center justify-between gap-3">
                <span className="text-[15px] text-muted">Что считать</span>
                <select value={form.filter} onChange={(e) => set({ filter: e.target.value })} className={`${field} max-w-[60%]`}>
                  <option value="">{form.measure === 'income' ? 'Весь доход' : 'Все траты'}</option>
                  {form.measure === 'expense' && (
                    <optgroup label="Важность">
                      {IMPORTANCES.map((i) => <option key={i} value={`imp:${i}`}>{IMPORTANCE_LABELS[i]}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Категория">
                    {cats.map((c) => <option key={c.key} value={`cat:${c.key}`}>{c.name}</option>)}
                  </optgroup>
                </select>
              </label>
            )}
            {form.measure === 'saved' && <p className="text-[14px] text-muted">Доход месяца минус траты месяца.</p>}
            {form.measure === 'reviews' && <p className="text-[14px] text-muted">Разборы насмотренности из записей дней месяца.</p>}
            {form.measure === 'metric' && (metrics.length === 0 ? (
              <p className="text-[14px] text-muted">Нет подходящих метрик — добавьте привычку «да / нет» или число в «Настройках».</p>
            ) : (
              <>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[15px] text-muted">Привычка</span>
                  <select value={form.metricKey} onChange={(e) => pickMetric(e.target.value)} className={`${field} max-w-[60%]`}>
                    {metrics.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
                  </select>
                </label>
                {aggregates.length > 1 ? (
                  <Segmented
                    label="Как считать" value={form.aggregate} onChange={(aggregate) => set({ aggregate })}
                    options={aggregates.map((a) => ({ value: a, label: AGGREGATE_LABELS[a] }))}
                  />
                ) : (
                  <p className="text-[14px] text-muted">Считаем: {AGGREGATE_LABELS[form.aggregate]}</p>
                )}
              </>
            ))}
            <div className="flex items-center gap-2">
              <Segmented label="Условие" options={OPS} value={form.op} onChange={(op) => set({ op })} className="w-52 shrink-0" />
              <label className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="sr-only">Порог</span>
                <input
                  inputMode="decimal" value={form.value} placeholder="0" onChange={(e) => set({ value: e.target.value })}
                  className={`${field} min-w-0 flex-1 text-right font-semibold`}
                />
                <span className="text-[15px] text-muted">{suffix}</span>
              </label>
            </div>
            {draft && preview && draft.kind !== 'reviews' && (
              <p className="text-[13px] text-muted">
                Сейчас: {formatGoalValue(draft, preview.value, data.metricDefinitions)} — {GOAL_STATE_LABELS[preview.state]}
              </p>
            )}
          </>
        )}
      </Card>

      {error && <p role="alert" className="text-center text-[14px] text-danger">{error}</p>}

      {initial && (
        <div className="flex gap-2">
          {([[-1, 'Выше'], [1, 'Ниже']] as const).map(([dir, label]) => (
            <button
              key={label} type="button"
              onClick={() => void run(() => saveGoals(moveGoal(goals, initial.id, dir, now())))}
              className="min-h-[44px] flex-1 rounded-[14px] border border-line bg-surface text-[15px] text-ink"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {initial && (
        <button
          type="button"
          onClick={() => window.confirm('Удалить цель?') && void run(async () => {
            await saveGoals([deleteGoal(initial, now())])
            onClose()
          })}
          className="min-h-[48px] rounded-[14px] border border-danger text-[16px] font-semibold text-danger"
        >
          Удалить цель
        </button>
      )}
    </Sheet>
  )
}
