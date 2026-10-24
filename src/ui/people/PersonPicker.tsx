import { useState } from 'react'
import { isLive } from '../../domain/people'
import { matchesQuery } from '../../domain/peopleList'
import type { PeopleData, Person } from '../../domain/types'
import { Avatar, BottomSheet, icon } from './peopleUi'

/** Выбор одного человека из базы; disabled — серые с подписью («уже на событии»). */
export default function PersonPicker({ data, title, exclude = [], disabled = new Map(), onPick, onClose }: {
  data: PeopleData
  title: string
  exclude?: string[]
  disabled?: Map<string, string>
  onPick: (p: Person) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const people = data.people
    .filter((p) => isLive(p) && !p.archived && !exclude.includes(p.id) && matchesQuery(p, query))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return (
    <BottomSheet label={title} onClose={onClose}>
      <h2 className="font-serif text-[20px] font-semibold">{title}</h2>
      <label className="flex min-h-[46px] items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3.5">
        {icon('M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM16 16l4.5 4.5', 20, 1.9)}
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти в базе" aria-label="Найти в базе"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
        />
      </label>
      <div className="flex flex-col">
        {people.length === 0 && <p className="py-3 text-[15px] text-muted">Никого не нашлось</p>}
        {people.map((p) => {
          const why = disabled.get(p.id)
          const job = [p.company, p.position].filter((s) => s.trim()).join(', ')
          return (
            <button
              key={p.id} type="button" disabled={!!why} onClick={() => onPick(p)}
              className="flex min-h-[58px] items-center gap-3 border-b border-line py-1.5 text-left last:border-b-0 disabled:opacity-50"
            >
              <Avatar id={p.id} name={p.name} size={40} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[16px] font-semibold">{p.name}</span>
                {(why || job) && <span className="truncate text-[13px] text-muted">{why ?? job}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
