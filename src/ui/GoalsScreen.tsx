import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getFinanceCategories, getMetrics, listDays, listGoals, listTransactions } from '../db/diary'
import { addMonths, monthDiff, monthOf, monthRange } from '../domain/dates'
import {
  AREA_LABELS, GOAL_STATE_LABELS, goalDetail, goalProgress, goalsOfMonth, progressPercent,
  type GoalState, type ProgressData,
} from '../domain/goals'
import type { Goal, Meta } from '../domain/types'
import { MonthHeader } from './financeUi'
import GoalSheet from './GoalSheet'
import { useLogicalToday } from './useLogicalToday'

const CHIP: Record<GoalState | 'claude', string> = {
  within: 'bg-accent/15 text-ink',
  done: 'bg-accent text-accent-ink',
  progress: 'bg-line text-ink',
  over: 'bg-imp-optional/25 text-ink',
  missed: 'bg-danger/15 text-danger',
  claude: 'border border-dashed border-muted/60 text-muted',
}
const BAR: Record<GoalState, string> = {
  within: 'bg-imp-useful',
  progress: 'bg-imp-useful',
  done: 'bg-accent',
  over: 'bg-imp-optional',
  missed: 'bg-imp-optional',
}

export default function GoalsScreen({ meta }: { meta: Meta }) {
  const today = useLogicalToday(meta.boundaryHour)
  // месяц хранится сдвигом от текущего: открытое из памяти 1-го числа приложение сразу показывает новый месяц
  const [offset, setOffset] = useState(0)
  const current = monthOf(today)
  const month = addMonths(current, offset)
  const setMonth = (m: string) => setOffset(monthDiff(current, m))
  const [sheet, setSheet] = useState<Goal | 'new' | null>(null)
  const [from, to] = monthRange(month)
  const goals = useLiveQuery(() => listGoals(month), [month])
  const transactions = useLiveQuery(() => listTransactions(from, to), [from, to])
  const days = useLiveQuery(() => listDays(from, to), [from, to])
  const financeCategories = useLiveQuery(getFinanceCategories)
  const metricDefinitions = useLiveQuery(getMetrics)
  if (!goals || !transactions || !days || !financeCategories || !metricDefinitions) return null

  const data: ProgressData = { transactions, financeCategories, days, metricDefinitions }
  const list = goalsOfMonth(goals, month)

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-6">
      <MonthHeader overline="Цели" month={month} onChange={setMonth} />
      {list.length === 0 && (
        <p className="rounded-[20px] border border-dashed border-line p-5 text-center text-[15px] leading-[1.45] text-muted">
          Целей на этот месяц нет. Запишите 2–4 цели своими словами — в конце месяца Claude сверит их с записями.
        </p>
      )}
      {list.map((g) => {
        const p = goalProgress(g, data, today)
        return (
          <button
            key={g.id} type="button" onClick={() => setSheet(g)}
            className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface px-4 py-3.5 text-left shadow-card"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">{AREA_LABELS[g.area]}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${CHIP[p ? p.state : 'claude']}`}>
                {p ? GOAL_STATE_LABELS[p.state] : 'сверит Claude'}
              </span>
            </span>
            <span className="text-[16px] leading-snug font-semibold">{g.text}</span>
            {p && (
              <span className="block h-2 w-full overflow-hidden rounded bg-line">
                <span className={`block h-full rounded ${BAR[p.state]}`} style={{ width: `${progressPercent(p)}%` }} />
              </span>
            )}
            <span className="text-[13px] text-muted">{goalDetail(g, p, metricDefinitions)}</span>
          </button>
        )
      })}
      <button
        type="button" onClick={() => setSheet('new')}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-muted/60 text-[16px] font-semibold text-accent"
      >
        + Добавить цель
      </button>
      {sheet && (
        <GoalSheet
          initial={sheet === 'new' ? null : sheet} month={month} goals={goals} data={data} today={today}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
