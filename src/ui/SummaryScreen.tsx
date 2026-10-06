import { useLiveQuery } from 'dexie-react-hooks'
import { listFilledDays } from '../db/diary'
import { formatDayTitle } from '../domain/ru'
import { streak, streakLabel } from '../domain/streak'
import type { Meta } from '../domain/types'
import DayForm from './DayForm'
import { useLogicalToday } from './useLogicalToday'

function StreakChip({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-[14px] font-semibold whitespace-nowrap text-accent">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z" />
      </svg>
      <span>{text}</span>
    </div>
  )
}

export default function SummaryScreen({ meta }: { meta: Meta }) {
  const today = useLogicalToday(meta.boundaryHour)
  const filled = useLiveQuery(listFilledDays)
  const label = filled ? streakLabel(streak(new Set(filled), today)) : null
  const [weekday, date] = formatDayTitle(today).split(', ')

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-4">
      <header className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Итог дня</p>
          <h1 className="font-serif text-[30px] leading-[1.15] font-semibold">
            {weekday},<br />{date}
          </h1>
        </div>
        {label && <StreakChip text={label.chip} />}
      </header>
      {label?.hint && <p className="-mt-1.5 text-right text-[13px] text-muted">{label.hint}</p>}
      <DayForm key={today} day={today} />
    </div>
  )
}
