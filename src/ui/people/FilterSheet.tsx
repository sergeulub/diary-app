import { useState } from 'react'
import { isIncomplete, isLive, isUnparsed } from '../../domain/people'
import { DEFAULT_FILTER, filterPeople, type PeopleFilter } from '../../domain/peopleList'
import type { PeopleData } from '../../domain/types'
import { Segmented } from '../financeUi'
import { BottomSheet, primaryClass } from './peopleUi'

const chip = (on: boolean) =>
  `flex min-h-[36px] items-center rounded-full px-3 text-[14px] whitespace-nowrap ${
    on ? 'border-[1.5px] border-accent bg-accent/15 font-semibold text-accent' : 'border border-line bg-surface text-ink'
  }`

function Switch({ label, count, on, onChange }: { label: string; count: number; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className="flex min-h-[46px] items-center gap-3 border-b border-line text-left text-[15px] last:border-b-0"
    >
      <span className="flex-1">{label} <span className="text-muted">· {count}</span></span>
      <span className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition ${on ? 'bg-accent' : 'bg-line'}`}>
        <span className={`absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-[2px]'}`} />
      </span>
    </button>
  )
}

/** Шторка «Фильтры»: всё, что сужает список, и сортировка. */
export default function FilterSheet({ data, query, filter, onApply, onClose }: {
  data: PeopleData
  query: string
  filter: PeopleFilter
  onApply: (f: PeopleFilter) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(filter)
  const set = (patch: Partial<PeopleFilter>) => setDraft((d) => ({ ...d, ...patch }))
  const spheres = data.spheres.filter(isLive).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const circles = data.circles
    .filter((c) => isLive(c) && (!c.archived || c.key === draft.circleKey))
    .sort((a, b) => a.order - b.order)
  const live = data.people.filter(isLive)
  const withUnparsed = new Set(data.personNotes.filter((n) => isLive(n) && isUnparsed(n)).map((n) => n.personId))
  const found = filterPeople(data, query, draft).length

  return (
    <BottomSheet label="Фильтры" onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[22px] font-semibold">Фильтры</h2>
        <button type="button" onClick={() => setDraft(DEFAULT_FILTER)} className="min-h-[44px] text-[15px] font-semibold text-accent">
          Сбросить
        </button>
      </div>
      {spheres.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold">Сферы</span>
            <span className="text-[13px] text-muted">любая из выбранных</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {spheres.map((s) => {
              const on = draft.sphereKeys.includes(s.key)
              return (
                <button
                  key={s.key} type="button" aria-pressed={on} className={chip(on)}
                  onClick={() => set({ sphereKeys: on ? draft.sphereKeys.filter((k) => k !== s.key) : [...draft.sphereKeys, s.key] })}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">Круг</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!draft.circleKey} className={chip(!draft.circleKey)} onClick={() => set({ circleKey: '' })}>Все</button>
          {circles.map((c) => (
            <button key={c.key} type="button" aria-pressed={draft.circleKey === c.key} className={chip(draft.circleKey === c.key)} onClick={() => set({ circleKey: c.key })}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-[15px] font-semibold">Показать только</span>
        <Switch label="Не дополнено" count={live.filter((p) => !p.archived && isIncomplete(p)).length} on={draft.incomplete} onChange={(on) => set({ incomplete: on })} />
        <Switch label="Есть неразобранные заметки" count={live.filter((p) => !p.archived && withUnparsed.has(p.id)).length} on={draft.unparsed} onChange={(on) => set({ unparsed: on })} />
        <Switch label="Архив" count={live.filter((p) => p.archived).length} on={draft.archived} onChange={(on) => set({ archived: on })} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">Сортировка</span>
        <Segmented
          label="Сортировка" value={draft.sort} onChange={(sort) => set({ sort })}
          options={[{ value: 'lastContact', label: 'По последней записи' }, { value: 'added', label: 'По дате добавления' }]}
        />
      </div>
      <button type="button" onClick={() => onApply(draft)} className={primaryClass}>Показать {found}</button>
    </BottomSheet>
  )
}
