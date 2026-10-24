import { eventsByMonth } from '../../domain/people'
import { monthTitle, shortDay } from '../../domain/ru'
import type { PeopleData } from '../../domain/types'
import type { Nav } from './nav'
import { PEOPLE_ICON, PLUS_ICON, icon } from './peopleUi'

/** Вкладка «События» (артборд 12.1): по месяцам, свежие сверху, сколько людей. */
export default function EventsScreen({ data, nav, onNew }: { data: PeopleData; nav: Nav; onNew: () => void }) {
  const months = eventsByMonth(data.events, data.personNotes)
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-6">
      <header className="flex items-end justify-between gap-3">
        <h1 className="font-serif text-[30px] leading-[1.15] font-semibold">События</h1>
        <button type="button" aria-label="Новое событие" onClick={onNew} className="flex size-11 items-center justify-center rounded-[14px] border border-line bg-surface text-ink">
          {icon(PLUS_ICON, 22, 2.2)}
        </button>
      </header>
      {months.length === 0 && <p className="py-6 text-center text-[15px] text-muted">Событий пока нет</p>}
      {months.map(({ month, items }) => {
        const [y, m] = month.split('-').map(Number)
        return (
          <div key={month} className="flex flex-col gap-2">
            <h2 className="px-1 text-[13px] font-semibold text-muted">{monthTitle(y, m - 1)}</h2>
            <section className="flex flex-col rounded-[20px] border border-line bg-surface px-4 py-0.5 shadow-card">
              {items.map(({ event, count }) => {
                const [d, mon] = shortDay(event.day).split(' ')
                return (
                  <button
                    key={event.id} type="button" onClick={() => nav.push({ kind: 'event', id: event.id })}
                    className="flex min-h-[68px] items-center gap-3.5 border-b border-line py-2.5 text-left last:border-b-0"
                  >
                    <span className="flex h-[50px] w-[46px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-line/70">
                      <span className="font-serif text-[20px] leading-none font-semibold">{d}</span>
                      <span className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">{mon}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[16px] leading-[1.3] font-semibold">{event.title}</span>
                      {event.topic.trim() && <span className="truncate text-[13px] text-muted">{event.topic}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-muted">{icon(PEOPLE_ICON, 16, 1.9)}{count}</span>
                  </button>
                )
              })}
            </section>
          </div>
        )
      })}
    </div>
  )
}
