import { useLiveQuery } from 'dexie-react-hooks'
import { getPeopleData } from '../../db/people'
import { peopleStats } from '../../domain/people'
import { plural } from '../../domain/ru'
import { PEOPLE_ICON, icon, primaryClass } from './peopleUi'

/** Карточка «Люди» в «Настройках» — вход в модуль. */
export default function PeopleEntryCard({ onOpen }: { onOpen: () => void }) {
  const data = useLiveQuery(getPeopleData)
  const s = data ? peopleStats(data) : { total: 0, incomplete: 0, unparsed: 0 }
  const stats: [number, string][] = [
    [s.total, plural(s.total, ['человек', 'человека', 'человек'])],
    [s.incomplete, 'не дополнено'],
    [s.unparsed, 'не разобрано'],
  ]
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          {icon(PEOPLE_ICON, 22)}
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[17px] font-semibold">Люди</h2>
          <p className="text-[13px] text-muted">Знакомые, встречи и события</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-y border-line py-3">
        {stats.map(([n, label]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-[19px] font-semibold tabular-nums">{n}</span>
            <span className="text-[13px] text-muted">{label}</span>
          </div>
        ))}
      </div>
      <button type="button" onClick={onOpen} className={primaryClass}>Открыть «Люди»</button>
    </section>
  )
}
