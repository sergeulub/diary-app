import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { getMetrics, listDays } from '../db/diary'
import { dayCellState, monthGrid, shiftMonth, type CellState, type YearMonth } from '../domain/calendar'
import { pad } from '../domain/dates'
import { WEEKDAYS_SHORT, formatDayTitle, monthTitle } from '../domain/ru'
import type { Meta } from '../domain/types'
import DayForm from './DayForm'
import { MOOD_COLORS } from './faces'
import { useLogicalToday } from './useLogicalToday'

const SWIPE_PX = 60

function DayCell({ day, state, isToday, onOpen }: { day: string; state: CellState; isToday: boolean; onOpen: (day: string) => void }) {
  const n = Number(day.slice(8))
  const base = 'relative flex aspect-square min-h-[44px] items-center justify-center rounded-[14px] text-[15px] font-semibold tabular-nums'
  const ring = isToday ? 'ring-2 ring-accent' : ''
  if (state.kind === 'future') return <div className={`${base} text-muted opacity-35`}>{n}</div>
  const look =
    state.kind === 'mood' ? '' : state.kind === 'filled' ? 'border border-line bg-surface' : 'bg-line/60 text-muted'
  return (
    <button
      type="button" onClick={() => onOpen(day)} aria-label={formatDayTitle(day)}
      className={`${base} ${look} ${ring}`}
      style={state.kind === 'mood' ? { background: MOOD_COLORS[state.value - 1], color: '#252920' } : undefined}
    >
      {n}
      {state.kind === 'filled' && <span className="absolute bottom-1.5 size-1.5 rounded-full bg-accent" />}
    </button>
  )
}

const ArrowButton = ({ label, disabled, onClick, d }: { label: string; disabled?: boolean; onClick: () => void; d: string }) => (
  <button
    type="button" aria-label={label} disabled={disabled} onClick={onClick}
    className="flex size-11 items-center justify-center rounded-[14px] text-accent disabled:opacity-30"
  >
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  </button>
)

export default function CalendarScreen({ meta }: { meta: Meta }) {
  const today = useLogicalToday(meta.boundaryHour)
  const [ym, setYm] = useState<YearMonth>(() => ({ year: Number(today.slice(0, 4)), month0: Number(today.slice(5, 7)) - 1 }))
  const [open, setOpen] = useState<string | null>(null)
  const touchX = useRef<number | null>(null)

  const cells = monthGrid(ym.year, ym.month0)
  const days = cells.filter((c): c is string => c !== null)
  const from = days[0]
  const to = days[days.length - 1]
  const records = useLiveQuery(() => listDays(from, to), [from, to])
  const defs = useLiveQuery(getMetrics)
  const primaryKey = defs?.find((d) => d.primary)?.key
  const byDay = new Map((records ?? []).map((r) => [r.day, r]))
  const atLatestMonth = `${ym.year}-${pad(ym.month0 + 1)}` >= today.slice(0, 7)

  const go = (delta: number) => {
    if (delta > 0 && atLatestMonth) return
    setYm((v) => shiftMonth(v, delta))
  }

  return (
    <div
      className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-4"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > SWIPE_PX) go(dx > 0 ? -1 : 1)
      }}
    >
      <header className="flex items-center justify-between">
        <ArrowButton label="Предыдущий месяц" onClick={() => go(-1)} d="M15 5l-7 7 7 7" />
        <h1 className="font-serif text-[26px] font-semibold">{monthTitle(ym.year, ym.month0)}</h1>
        <ArrowButton label="Следующий месяц" disabled={atLatestMonth} onClick={() => go(1)} d="M9 5l7 7-7 7" />
      </header>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[12px] font-semibold text-muted">
        {WEEKDAYS_SHORT.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) =>
          day === null ? (
            <div key={`pad-${i}`} />
          ) : (
            <DayCell
              key={day} day={day} isToday={day === today} onOpen={setOpen}
              state={dayCellState(day, byDay.get(day), today, primaryKey)}
            />
          ),
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-10 overflow-y-auto bg-bg">
          <div className="mx-auto flex min-h-full max-w-md flex-col gap-3.5 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]">
            <button
              type="button" onClick={() => setOpen(null)}
              className="min-h-[44px] self-start text-[17px] font-semibold text-accent"
            >
              ‹ Календарь
            </button>
            <h1 className="font-serif text-[28px] leading-[1.15] font-semibold">{formatDayTitle(open)}</h1>
            <DayForm key={open} day={open} />
          </div>
        </div>
      )}
    </div>
  )
}
