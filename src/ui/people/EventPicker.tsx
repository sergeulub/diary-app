import { isLive } from '../../domain/people'
import { shortDay } from '../../domain/ru'
import type { PeopleEvent } from '../../domain/types'
import { BottomSheet } from './peopleUi'

/** Выбор события для встречи: живые, свежие сверху. */
export default function EventPicker({ events, onPick, onClose }: {
  events: PeopleEvent[]
  onPick: (e: PeopleEvent) => void
  onClose: () => void
}) {
  const list = events.filter(isLive).sort((a, b) => b.day.localeCompare(a.day))
  return (
    <BottomSheet label="Событие" onClose={onClose}>
      <h2 className="font-serif text-[20px] font-semibold">Событие</h2>
      {list.length === 0 && <p className="text-[15px] text-muted">Событий пока нет</p>}
      <div className="flex flex-col">
        {list.map((e) => (
          <button
            key={e.id} type="button" onClick={() => onPick(e)}
            className="flex min-h-[52px] items-center gap-3 border-b border-line text-left last:border-b-0"
          >
            <span className="w-14 shrink-0 text-[13px] text-muted">{shortDay(e.day)}</span>
            <span className="text-[16px]">{e.title}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
