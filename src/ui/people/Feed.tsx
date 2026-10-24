import { useState } from 'react'
import { claudeDividerIndex, isLive, isUnparsed, lastApplied, personFeed } from '../../domain/people'
import { dayMonth, shortDay } from '../../domain/ru'
import type { AppliedPatch, PeopleData, PersonNote } from '../../domain/types'
import { EVENT_ICON, Mark, icon } from './peopleUi'

const MEETING_FIELDS: [keyof Pick<PersonNote, 'talk' | 'life' | 'agreements'>, string][] = [
  ['talk', 'О чём говорили'],
  ['life', 'Что актуально у него'],
  ['agreements', 'Договорились'],
]
const link = 'flex items-center gap-1.5 self-start text-[14px] font-semibold text-accent'
const note = 'm-0 font-serif text-[15px] leading-[1.5] whitespace-pre-line italic'

function Entry({ n, data, onOpen, onOpenEvent, onOpenDay }: {
  n: PersonNote
  data: PeopleData
  onOpen: () => void
  onOpenEvent: (id: string) => void
  onOpenDay: (day: string) => void
}) {
  const [folded, setFolded] = useState(true)
  const unparsed = isUnparsed(n)
  const event = data.events.find((e) => e.id === n.eventId && isLive(e))
  const dot = n.kind === 'diary'
    ? 'border-2 border-muted bg-bg'
    : unparsed ? 'bg-imp-optional' : 'bg-accent'
  return (
    <article className="relative flex flex-col gap-2">
      <span aria-hidden="true" className={`absolute top-1.5 -left-[29px] size-3.5 rounded-full shadow-[0_0_0_4px_var(--bg)] ${dot}`} />
      <button type="button" onClick={onOpen} aria-label={`Запись ${dayMonth(n.day)}`} className="flex flex-col gap-2 text-left">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="font-serif text-[17px] font-semibold">{dayMonth(n.day)}</span>
          <span className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">{n.kind === 'diary' ? 'из дневника' : 'встреча'}</span>
          {unparsed && <Mark tone="clay">не разобрано</Mark>}
        </span>
        {!event && n.occasion.trim() && <span className="text-[14px] text-muted">{n.occasion}</span>}
        {n.kind === 'diary' && <span className="text-[15px] leading-[1.45] whitespace-pre-line">{n.talk}</span>}
        {n.kind === 'meeting' && MEETING_FIELDS.map(([key, label]) => n[key].trim() && (
          <span key={key} className="flex flex-col gap-0.5">
            <span className="text-[12.5px] text-muted">{label}</span>
            <span className="text-[15px] leading-[1.45] whitespace-pre-line">{n[key]}</span>
          </span>
        ))}
        {unparsed && (
          <span className="flex flex-col gap-1">
            <span className="text-[12.5px] text-muted">Исходная заметка</span>
            <span className={note}>«{n.original.trim()}»</span>
          </span>
        )}
      </button>
      {event && (
        <button type="button" onClick={() => onOpenEvent(event.id)} className={link}>
          {icon(EVENT_ICON, 16)}{event.title}
        </button>
      )}
      {!unparsed && n.kind === 'meeting' && n.original.trim() && (
        <>
          <button type="button" aria-expanded={!folded} onClick={() => setFolded(!folded)} className="flex min-h-[32px] items-center gap-1 self-start text-[13px] font-semibold text-muted">
            {icon(folded ? 'M9 5l7 7-7 7' : 'M6 9l6 6 6-6', 14, 2.4)}Исходная заметка
          </button>
          {!folded && <p className={note}>«{n.original.trim()}»</p>}
        </>
      )}
      {n.kind === 'diary' && (
        <button type="button" onClick={() => onOpenDay(n.day)} className={link}>
          Открыть день{icon('M9 5l7 7-7 7', 16, 2)}
        </button>
      )}
    </article>
  )
}

/** Лента-хроника человека (артборд 11.2) с полосой «разобрано Claude». */
export default function Feed({ data, personId, applied, onOpen, onOpenEvent, onOpenDay }: {
  data: PeopleData
  personId: string
  applied: AppliedPatch[]
  onOpen: (n: PersonNote) => void
  onOpenEvent: (id: string) => void
  onOpenDay: (day: string) => void
}) {
  const feed = personFeed(personId, data.personNotes)
  if (!feed.length) return null
  const divider = claudeDividerIndex(feed, applied)
  const last = lastApplied(applied)
  return (
    <div className="relative flex flex-col gap-[22px] pl-[30px]">
      <span aria-hidden="true" className="absolute top-2 bottom-1.5 left-2 w-0.5 rounded-full bg-line" />
      {feed.map((n, i) => (
        <div key={n.id} className="flex flex-col gap-[22px]">
          {i === divider && last && (
            <div role="separator" aria-label={`Ниже — уже разобрано Claude, ${shortDay(last.appliedAt.slice(0, 10))}`} className="relative -my-1.5 -ml-[30px] flex items-center gap-2.5 bg-bg py-1">
              <span className="h-0 flex-1 border-t-[1.5px] border-dashed border-muted/50" />
              <span className="flex items-center gap-1.5 rounded-full bg-line px-3 py-1 text-[12px] font-semibold whitespace-nowrap text-muted">
                {icon('M12 5v14M6 13l6 6 6-6', 14, 2.2)}разобрано Claude · {shortDay(last.appliedAt.slice(0, 10))}
              </span>
              <span className="h-0 flex-1 border-t-[1.5px] border-dashed border-muted/50" />
            </div>
          )}
          <Entry n={n} data={data} onOpen={() => onOpen(n)} onOpenEvent={onOpenEvent} onOpenDay={onOpenDay} />
        </div>
      ))}
      <div className="relative flex items-center gap-2 text-[13px] text-muted">
        <span aria-hidden="true" className="absolute top-[5px] -left-[26px] size-2 rounded-full bg-muted/50" />
        Знакомство
      </div>
    </div>
  )
}
