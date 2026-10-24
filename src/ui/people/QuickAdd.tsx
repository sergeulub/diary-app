import { useRef, useState } from 'react'
import { addPersonWithNote, savePerson, saveSpheres } from '../../db/people'
import { createNote, createPerson, findSimilar } from '../../domain/people'
import { dayGroupTitle } from '../../domain/ru'
import type { PeopleData, PeopleEvent, Person, Sphere } from '../../domain/types'
import { errorText } from '../errors'
import { Sheet, now } from '../financeUi'
import EventPicker from './EventPicker'
import type { NoteTarget } from './NoteForm'
import PersonFieldsEditor, { emptyFields } from './PersonFields'
import {
  Avatar, BottomSheet, CALENDAR_ICON, CLOSE_ICON, EVENT_ICON, Field, PEOPLE_ICON, chipClass, dashedChipClass, fieldClass,
  icon, primaryClass, secondaryClass,
} from './peopleUi'

/** Быстрая форма (артборд 10): только имя и «Что запомнил»; похожее имя — выбор «это он» или «другой». */
export default function QuickAdd({ data, today, onClose, onOpenNote }: {
  data: PeopleData
  today: string
  onClose: () => void
  /** «Это он» — новая встреча у найденного человека с датой, событием и заметкой. */
  onOpenNote: (target: NoteTarget) => void
}) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [day, setDay] = useState(today)
  const [event, setEvent] = useState<PeopleEvent | null>(null)
  const [picking, setPicking] = useState(false)
  const [similar, setSimilar] = useState<Person[]>([])
  const [chosen, setChosen] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [details, setDetails] = useState(() => emptyFields())
  const [newSpheres, setNewSpheres] = useState<Sphere[]>([])
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  const meeting = () => ({ day: event?.day ?? day, eventId: event?.id ?? '', occasion: event?.title ?? '', original: text.trim() })

  async function create() {
    if (busy.current) return
    busy.current = true
    try {
      const fields = { ...details, name, contacts: details.contacts.filter((c) => c.value.trim()) }
      const spheres = newSpheres.filter((sp) => fields.sphereKeys.includes(sp.key))
      if (spheres.length) await saveSpheres(spheres)
      const person = createPerson(fields, now())
      const m = meeting()
      // встреча без заметки и без события ничего не добавляет — тогда только человек
      if (m.original || m.eventId) await addPersonWithNote(person, createNote(person.id, 'meeting', m, now()))
      else await savePerson(person)
      onClose()
    } catch (e) {
      busy.current = false
      setSimilar([])
      setError(`Не сохранилось: ${errorText(e)}`)
    }
  }

  function save() {
    if (!name.trim()) {
      setError('Нужно имя')
      return
    }
    const found = findSimilar(name, details.company, data.people)
    if (found.length) {
      setChosen(0)
      setSimilar(found)
    } else void create()
  }

  return (
    <Sheet>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onClose} className="min-h-[44px] w-16 shrink-0 text-left text-[16px] text-accent">Отмена</button>
        <h2 className="font-serif text-[20px] font-semibold">Новый человек</h2>
        <span className="w-16" />
      </div>
      {event && (
        <div className="flex items-center gap-3 rounded-[16px] border-[1.5px] border-accent bg-surface py-2 pr-1 pl-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">{icon(EVENT_ICON, 20)}</span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-semibold">{event.title}</span>
            <span className="text-[13px] text-muted">{dayGroupTitle(event.day, today)}</span>
          </div>
          <button type="button" aria-label="Убрать событие" onClick={() => setEvent(null)} className="flex size-11 items-center justify-center text-muted">
            {icon(CLOSE_ICON, 18, 2)}
          </button>
        </div>
      )}
      <Field label="Имя">
        <input
          autoFocus value={name} enterKeyHint="next" autoCapitalize="words"
          onChange={(e) => { setName(e.target.value); setError(null) }}
          className={`${fieldClass} min-h-[48px] text-[17px]`}
        />
      </Field>
      <Field label="Что запомнил">
        <textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} className="w-full resize-none rounded-[16px] border border-line bg-surface px-3.5 py-3 text-[16px] leading-[1.55] text-ink outline-none" />
      </Field>
      {!event && (
        <div className="flex flex-wrap gap-2">
          <label className={`relative ${chipClass}`}>
            {icon(CALENDAR_ICON, 16)}{dayGroupTitle(day, today)}
            <input
              type="date" value={day} max={today} aria-label="День встречи"
              onChange={(e) => e.target.value && setDay(e.target.value)} className="absolute inset-0 text-[16px] opacity-0"
            />
          </label>
          <button type="button" onClick={() => setPicking(true)} className={dashedChipClass}>+ Событие</button>
        </div>
      )}
      {expanded ? (
        <PersonFieldsEditor
          value={details} onChange={setDetails} data={data} newSpheres={newSpheres} onNewSpheres={setNewSpheres}
          withName={false}
        />
      ) : (
        <button type="button" onClick={() => setExpanded(true)} className="flex min-h-[44px] items-center gap-1.5 self-start text-[15px] font-semibold text-accent">
          Заполнить подробно{icon('M6 9l6 6 6-6', 16, 2.2)}
        </button>
      )}
      {error && <p role="alert" className="text-center text-[14px] text-danger">{error}</p>}
      <div className="flex-1" />
      <button type="button" onClick={save} className={primaryClass}>Сохранить</button>

      {picking && (
        <EventPicker events={data.events} onClose={() => setPicking(false)} onPick={(e) => { setEvent(e); setPicking(false) }} />
      )}
      {similar.length > 0 && (
        <BottomSheet label="Похоже, уже есть" onClose={() => setSimilar([])}>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-imp-optional/25 text-ink">{icon(PEOPLE_ICON, 22)}</span>
            <div className="flex flex-col gap-0.5">
              <h2 className="font-serif text-[20px] font-semibold">Похоже, уже есть</h2>
              <p className="text-[13px] text-muted">В базе есть человек с таким же именем</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {similar.slice(0, 3).map((p, i) => (
              <button
                key={p.id} type="button" aria-pressed={i === chosen} onClick={() => setChosen(i)}
                className={`flex items-center gap-3 rounded-[18px] bg-surface px-4 py-3 text-left ${i === chosen ? 'border-[1.5px] border-accent' : 'border border-line'}`}
              >
                <Avatar id={p.id} name={p.name} size={44} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[16px] font-semibold">
                    {p.name}{p.aliases.length > 0 && <span className="font-normal text-muted"> ({p.aliases.join(', ')})</span>}
                  </span>
                  {(p.position || p.company) && <span className="truncate text-[14px] text-muted">{[p.position, p.company].filter(Boolean).join(', ')}</span>}
                  {p.archived && <span className="text-[13px] text-muted">в архиве</span>}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            <button
              type="button" className={primaryClass}
              onClick={() => onOpenNote({ personId: similar[chosen].id, draft: meeting() })}
            >
              Это он — добавить встречу к нему
            </button>
            <button type="button" onClick={() => void create()} className={`${secondaryClass} border-[1.5px] border-accent text-accent`}>
              Это другой человек
            </button>
          </div>
          <p className="text-center text-[13px] text-muted">
            Откроется новая встреча у {similar[chosen]?.name} — дата и заметка уже в ней
          </p>
        </BottomSheet>
      )}
    </Sheet>
  )
}
