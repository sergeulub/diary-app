import { isIncomplete, isLive, isUnparsed, peopleOfEvent } from '../../domain/people'
import { formatDayTitle } from '../../domain/ru'
import type { PeopleData } from '../../domain/types'
import type { Nav } from './nav'
import { Avatar, BackBar, Mark, icon, textButton } from './peopleUi'

/** Экран события (артборд 12.2) — только просмотр; люди — по записям со ссылкой на событие. */
export default function EventScreen({ data, id, backLabel, nav, onEdit }: {
  data: PeopleData
  id: string
  backLabel: string
  nav: Nav
  onEdit: () => void
}) {
  const event = data.events.find((e) => e.id === id && isLive(e))
  if (!event) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))]">
        <BackBar label={backLabel} onBack={nav.back} />
        <p className="text-[15px] text-muted">Событие удалено</p>
      </div>
    )
  }
  const guests = peopleOfEvent(event.id, data.personNotes).flatMap((pid) => data.people.find((p) => p.id === pid && isLive(p)) ?? [])
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-6">
      <BackBar label={backLabel} onBack={nav.back} right={<button type="button" onClick={onEdit} className={textButton}>Изменить</button>} />
      <div className="flex flex-col gap-1.5">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">{formatDayTitle(event.day)}</p>
        <h1 className="font-serif text-[26px] leading-[1.2] font-semibold">{event.title}</h1>
        {event.topic.trim() && <p className="text-[15px] leading-[1.45] whitespace-pre-line text-muted">{event.topic}</p>}
      </div>
      <div className="flex items-baseline justify-between px-1 pt-1">
        <span className="text-[15px] font-semibold">Люди на событии</span>
        <span className="text-[13px] text-muted">{guests.length}</span>
      </div>
      {guests.length > 0 && (
        <section className="flex flex-col rounded-[20px] border border-line bg-surface px-4 py-0.5 shadow-card">
          {guests.map((p) => {
            const unparsed = data.personNotes.some((n) => n.personId === p.id && n.eventId === event.id && isLive(n) && isUnparsed(n))
            const job = [p.company, p.position].filter((s) => s.trim()).join(', ')
            return (
              <button
                key={p.id} type="button" onClick={() => nav.push({ kind: 'person', id: p.id })}
                className="flex min-h-[64px] items-center gap-3 border-b border-line py-2 text-left last:border-b-0"
              >
                <Avatar id={p.id} name={p.name} size={40} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[16px] font-semibold">{p.name}</span>
                  {job && <span className="truncate text-[14px] text-muted">{job}</span>}
                </span>
                {unparsed ? <Mark tone="clay">не разобрано</Mark> : isIncomplete(p) && <Mark tone="grey">не дополнено</Mark>}
                <span className="text-muted">{icon('M9 5l7 7-7 7', 16, 2)}</span>
              </button>
            )
          })}
        </section>
      )}
    </div>
  )
}
