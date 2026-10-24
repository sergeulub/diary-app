import { useState } from 'react'
import { isLive, isIncomplete, isUnparsed, lastContactDay } from '../../domain/people'
import { activeFilterCount, filterPeople, type PeopleFilter } from '../../domain/peopleList'
import { plural, shortDay } from '../../domain/ru'
import type { PeopleData, Person } from '../../domain/types'
import FilterSheet from './FilterSheet'
import type { Nav } from './nav'
import { Avatar, CLOSE_ICON, Mark, icon } from './peopleUi'

const MENU_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
  </svg>
)
const FILTER_ICON = icon('M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM9 15a2 2 0 1 0 0 4a2 2 0 1 0 0-4z', 22, 1.9)

function PersonRow({ p, data, onOpen }: { p: Person; data: PeopleData; onOpen: () => void }) {
  const spheres = p.sphereKeys.flatMap((k) => data.spheres.find((s) => s.key === k && isLive(s))?.name ?? [])
  const job = [p.company, p.position].map((s) => s.trim()).filter(Boolean).join(', ')
  const last = lastContactDay(p.id, data.personNotes)
  const unparsed = data.personNotes.some((n) => n.personId === p.id && isLive(n) && isUnparsed(n))
  return (
    <button type="button" onClick={onOpen} className="flex min-h-[68px] w-full items-center gap-3 border-b border-line py-2.5 text-left last:border-b-0">
      <Avatar id={p.id} name={p.name} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[16px] font-semibold">
          {p.name}{p.aliases.length > 0 && <span className="font-normal text-muted"> ({p.aliases.join(', ')})</span>}
        </span>
        {job && <span className="truncate text-[14px] text-muted">{job}</span>}
        {spheres.length > 0 && <span className="truncate text-[13px] text-accent">{spheres.join(' · ')}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        {last && <span className="text-[13px] text-muted">{shortDay(last)}</span>}
        {unparsed ? <Mark tone="clay">не разобрано</Mark> : isIncomplete(p) && <Mark tone="grey">не дополнено</Mark>}
      </span>
    </button>
  )
}

/** Список людей (артборд 9): поиск, кнопка фильтров, плашки включённых фильтров, меню «⋯». */
export default function PeopleList({ data, filter, onFilter, query, onQuery, nav }: {
  data: PeopleData
  filter: PeopleFilter
  onFilter: (f: PeopleFilter) => void
  query: string
  onQuery: (q: string) => void
  nav: Nav
}) {
  const [sheet, setSheet] = useState(false)
  const [menu, setMenu] = useState(false)
  const people = filterPeople(data, query, filter)
  const active = activeFilterCount(filter)
  const anyone = data.people.some(isLive)
  const sphereName = (k: string) => data.spheres.find((s) => s.key === k)?.name ?? ''
  const circleName = data.circles.find((c) => c.key === filter.circleKey)?.name ?? ''

  const chips: { label: string; remove: () => void }[] = [
    ...filter.sphereKeys.map((k) => ({ label: `Сфера: ${sphereName(k)}`, remove: () => onFilter({ ...filter, sphereKeys: filter.sphereKeys.filter((x) => x !== k) }) })),
    ...(filter.circleKey ? [{ label: `Круг: ${circleName}`, remove: () => onFilter({ ...filter, circleKey: '' }) }] : []),
    ...(filter.incomplete ? [{ label: 'Не дополнено', remove: () => onFilter({ ...filter, incomplete: false }) }] : []),
    ...(filter.unparsed ? [{ label: 'Неразобранные', remove: () => onFilter({ ...filter, unparsed: false }) }] : []),
    ...(filter.archived ? [{ label: 'Архив', remove: () => onFilter({ ...filter, archived: false }) }] : []),
  ]

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))]">
      <header className="relative flex items-end justify-between gap-3">
        <h1 className="font-serif text-[30px] leading-[1.15] font-semibold">Люди</h1>
        <button
          type="button" aria-label="Меню: сферы и круги, изменения с ПК" aria-expanded={menu} onClick={() => setMenu(!menu)}
          className={`flex size-11 items-center justify-center rounded-[14px] border ${menu ? 'border-accent bg-accent/15 text-accent' : 'border-line bg-surface text-ink'}`}
        >
          {MENU_ICON}
        </button>
        {menu && (
          <>
            <button type="button" aria-label="Закрыть меню" onClick={() => setMenu(false)} className="fixed inset-0 z-20 bg-black/10" />
            <div role="menu" className="absolute top-[52px] right-0 z-30 flex w-[270px] flex-col overflow-hidden rounded-[18px] border border-line bg-surface shadow-[0_16px_36px_rgba(40,30,20,0.22)]">
              {[
                { label: 'Сферы и круги', sub: 'переименовать, объединить', go: () => nav.push({ kind: 'spheres' }) },
                { label: 'Изменения с ПК', sub: 'открыть файл от Claude', go: () => nav.push({ kind: 'patch' }) },
              ].map((m) => (
                <button
                  key={m.label} type="button" role="menuitem"
                  onClick={() => { setMenu(false); m.go() }}
                  className="flex min-h-[56px] flex-col items-start justify-center border-b border-line px-4 py-2 text-left last:border-b-0"
                >
                  <span className="text-[16px]">{m.label}</span>
                  <span className="text-[13px] text-muted">{m.sub}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      <div className="flex gap-2.5">
        <label className="flex min-h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3.5">
          {icon('M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM16 16l4.5 4.5', 20, 1.9)}
          <input
            value={query} onChange={(e) => onQuery(e.target.value)} enterKeyHint="search" aria-label="Поиск"
            placeholder="Имя, как называю, компания"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
          />
        </label>
        <button
          type="button" aria-label={active ? `Фильтры: включено ${active}` : 'Фильтры'} onClick={() => setSheet(true)}
          className={`relative flex size-[46px] shrink-0 items-center justify-center rounded-[14px] ${active ? 'bg-accent text-accent-ink' : 'border border-line bg-surface text-ink'}`}
        >
          {FILTER_ICON}
          {active > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg bg-imp-optional px-1 text-[12px] font-bold text-ink">
              {active}
            </span>
          )}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.label} type="button" onClick={c.remove} aria-label={`Убрать фильтр: ${c.label}`}
              className="flex min-h-[36px] items-center gap-2 rounded-full bg-accent/15 pr-3 pl-3.5 text-[14px] font-semibold text-accent"
            >
              {c.label}{icon(CLOSE_ICON, 14, 2.6)}
            </button>
          ))}
        </div>
      )}
      {(active > 0 || query.trim() !== '') && (
        <p className="-my-1 px-1 text-[13px] text-muted">{people.length} {plural(people.length, ['человек', 'человека', 'человек'])}</p>
      )}

      <section className="flex flex-1 flex-col rounded-t-[20px] border border-b-0 border-line bg-surface px-4 py-0.5 shadow-card">
        {people.map((p) => <PersonRow key={p.id} p={p} data={data} onOpen={() => nav.push({ kind: 'person', id: p.id })} />)}
        {people.length === 0 && (
          <p className="py-6 text-center text-[15px] text-muted">{anyone ? 'Никого не нашлось' : 'Пока никого нет'}</p>
        )}
      </section>

      {sheet && (
        <FilterSheet
          data={data} query={query} filter={filter} onClose={() => setSheet(false)}
          onApply={(f) => { onFilter(f); setSheet(false) }}
        />
      )}
    </div>
  )
}
