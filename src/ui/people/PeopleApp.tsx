import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getPeopleData } from '../../db/people'
import { DEFAULT_FILTER, type PeopleFilter } from '../../domain/peopleList'
import type { Meta } from '../../domain/types'
import { primeKeyboard } from '../financeUi'
import { useLogicalToday } from '../useLogicalToday'
import type { Nav, Screen } from './nav'
import NoteForm, { type NoteTarget } from './NoteForm'
import PeopleList from './PeopleList'
import PeopleNav from './PeopleNav'
import QuickAdd from './QuickAdd'

/** Мини-приложение «Люди» на весь экран; своя нижняя панель, панель дневника скрыта. */
export default function PeopleApp({ meta, patchJson, onExit, onOpenDay }: {
  meta: Meta
  patchJson?: string
  onExit: () => void
  onOpenDay: (day: string) => void
}) {
  const today = useLogicalToday(meta.boundaryHour)
  const [stack, setStack] = useState<Screen[]>(() =>
    patchJson ? [{ kind: 'list' }, { kind: 'patch', json: patchJson }] : [{ kind: 'list' }])
  // фильтры и поиск живут здесь: возврат из карточки их не сбрасывает
  const [filter, setFilter] = useState<PeopleFilter>(DEFAULT_FILTER)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null)
  const data = useLiveQuery(getPeopleData)
  if (!data) return null

  const screen = stack[stack.length - 1]
  const root = stack[0].kind === 'events' ? 'events' : 'list'
  const nav: Nav = {
    push: (s) => setStack((st) => [...st, s]),
    back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
    openDay: onOpenDay,
  }

  return (
    <div className="flex h-dvh flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto">
        {screen.kind === 'list' && (
          <PeopleList data={data} filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} nav={nav} />
        )}
        {screen.kind !== 'list' && (
          <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-6">
            <button type="button" onClick={nav.back} className="self-start text-accent">‹ Назад</button>
            <h1 className="font-serif text-[30px] font-semibold">{screen.kind}</h1>
          </div>
        )}
      </main>
      <PeopleNav
        active={root} onTab={(t) => setStack([{ kind: t }])} onExit={onExit}
        onAdd={() => {
          primeKeyboard()
          setAdding(true)
        }}
      />
      {adding && (
        <QuickAdd
          data={data} today={today} onClose={() => setAdding(false)}
          onOpenNote={(t) => {
            setAdding(false)
            setNoteTarget(t)
          }}
        />
      )}
      {noteTarget && <NoteForm data={data} target={noteTarget} today={today} onClose={() => setNoteTarget(null)} />}
    </div>
  )
}
