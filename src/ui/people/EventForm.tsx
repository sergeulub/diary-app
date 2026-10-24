import { useRef, useState } from 'react'
import { saveEvent } from '../../db/people'
import { createEvent, deleteEvent, isLive, peopleOfEvent, updateEvent } from '../../domain/people'
import { dayGroupTitle } from '../../domain/ru'
import type { PeopleData, PeopleEvent, Person } from '../../domain/types'
import { errorText } from '../errors'
import { Sheet, now } from '../financeUi'
import PersonPicker from './PersonPicker'
import { Avatar, CALENDAR_ICON, Field, PLUS_ICON, areaClass, chipClass, dangerClass, fieldClass, icon } from './peopleUi'

const side = 'min-h-[44px] w-20 shrink-0 text-[16px] text-accent'

/**
 * Форма события (артборд 12.3) — и правка, и новое. «Добавить человека» сначала сохраняет событие, затем открывает
 * новую встречу выбранного человека на нём.
 */
export default function EventForm({ data, event, today, onClose, onDeleted, onAddPerson }: {
  data: PeopleData
  event: PeopleEvent | null
  today: string
  /** id сохранённого события; null — ничего не сохранено. */
  onClose: (savedId: string | null) => void
  onDeleted: () => void
  onAddPerson: (event: PeopleEvent, person: Person) => void
}) {
  const [saved, setSaved] = useState<PeopleEvent | null>(event)
  const [title, setTitle] = useState(event?.title ?? '')
  const [day, setDay] = useState(event?.day ?? today)
  const [topic, setTopic] = useState(event?.topic ?? '')
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const current = saved ? data.events.find((e) => e.id === saved.id) ?? saved : null
  const guests = current
    ? peopleOfEvent(current.id, data.personNotes).flatMap((pid) => data.people.find((p) => p.id === pid && isLive(p)) ?? [])
    : []

  /** Записывает поля; возвращает сохранённое событие или null при ошибке. */
  async function write(): Promise<PeopleEvent | null> {
    if (!title.trim()) {
      setError('Нужно название')
      return null
    }
    if (busy.current) return null
    busy.current = true
    try {
      const e = current ? updateEvent(current, { title: title.trim(), day, topic }, now()) : createEvent({ title, day, topic }, now())
      await saveEvent(e)
      setSaved(e)
      return e
    } catch (err) {
      setError(`Не сохранилось: ${errorText(err)}`)
      return null
    } finally {
      busy.current = false
    }
  }

  async function done() {
    const e = await write()
    if (e) onClose(e.id)
  }

  async function addPerson() {
    if (await write()) setPicking(true)
  }

  async function remove() {
    if (!current || !window.confirm(`Удалить событие «${current.title}»? Записи людей останутся.`)) return
    try {
      await saveEvent(deleteEvent(current, now()))
      onDeleted()
    } catch (err) {
      setError(`Не удалилось: ${errorText(err)}`)
    }
  }

  return (
    <Sheet>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => onClose(saved?.id ?? null)} className={`${side} text-left`}>Отмена</button>
        <h2 className="font-serif text-[20px] font-semibold">{event ? 'Событие' : 'Новое событие'}</h2>
        <button type="button" onClick={() => void done()} className={`${side} text-right font-semibold`}>Готово</button>
      </div>
      <Field label="Название">
        <input value={title} autoFocus={!event} onChange={(e) => { setTitle(e.target.value); setError(null) }} className={fieldClass} />
      </Field>
      <div className="flex">
        <label className={`relative ${chipClass}`}>
          {icon(CALENDAR_ICON, 16)}{dayGroupTitle(day, today)}
          <input
            type="date" value={day} aria-label="Дата события"
            onChange={(e) => e.target.value && setDay(e.target.value)} className="absolute inset-0 text-[16px] opacity-0"
          />
        </label>
      </div>
      <Field label="Тема — необязательно">
        <textarea rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} className={areaClass} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Люди на событии</span>
        {guests.length > 0 && (
          <section className="flex flex-col rounded-[20px] border border-line bg-surface px-4 py-0.5">
            {guests.map((p) => (
              <div key={p.id} className="flex min-h-[48px] items-center gap-3 border-b border-line last:border-b-0">
                <Avatar id={p.id} name={p.name} size={32} />
                <span className="text-[16px] font-semibold">{p.name}</span>
              </div>
            ))}
          </section>
        )}
        <button
          type="button" onClick={() => void addPerson()}
          className="flex min-h-[50px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-muted/60 text-[16px] font-semibold text-accent"
        >
          {icon(PLUS_ICON, 18, 2.3)}Добавить человека
        </button>
      </div>
      {error && <p role="alert" className="text-center text-[14px] text-danger">{error}</p>}
      <div className="flex-1" />
      {event && <button type="button" onClick={() => void remove()} className={dangerClass}>Удалить событие</button>}
      {picking && current && (
        <PersonPicker
          data={data} title="Кто был на событии"
          disabled={new Map(guests.map((p) => [p.id, 'уже на событии']))}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setPicking(false)
            onAddPerson(current, p)
          }}
        />
      )}
    </Sheet>
  )
}
