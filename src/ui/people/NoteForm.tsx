import { useRef, useState } from 'react'
import { saveNote } from '../../db/people'
import { createNote, deleteNote, isLive, updateNote, type NoteFields } from '../../domain/people'
import { dayGroupTitle } from '../../domain/ru'
import type { PeopleData, PersonNote } from '../../domain/types'
import { errorText } from '../errors'
import { Sheet, now } from '../financeUi'
import { Avatar, CALENDAR_ICON, Field, areaClass, chipClass, dangerClass, icon } from './peopleUi'

/** Что открыть: правку записи или новую встречу человека с уже заполненными полями. */
export interface NoteTarget {
  personId: string
  note?: PersonNote
  draft?: Partial<NoteFields>
}

const side = 'min-h-[44px] w-24 shrink-0 text-[16px] text-accent'

/** Форма записи ленты (артборды 10.4, 11.4, 12.5): поля встречи обычно заполняет Claude, здесь — вручную. */
export default function NoteForm({ data, target, today, onClose }: {
  data: PeopleData
  target: NoteTarget
  today: string
  onClose: () => void
}) {
  const { note, draft = {} } = target
  const person = data.people.find((p) => p.id === target.personId)
  const kind = note?.kind ?? 'meeting'
  const [day, setDay] = useState(note?.day ?? draft.day ?? today)
  const [talk, setTalk] = useState(note?.talk ?? draft.talk ?? '')
  const [life, setLife] = useState(note?.life ?? draft.life ?? '')
  const [agreements, setAgreements] = useState(note?.agreements ?? draft.agreements ?? '')
  const [original, setOriginal] = useState(note?.original ?? draft.original ?? '')
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const eventId = note?.eventId ?? draft.eventId ?? ''
  const event = data.events.find((e) => e.id === eventId && isLive(e))

  async function write(n: PersonNote, failed: string) {
    if (busy.current) return
    busy.current = true
    try {
      await saveNote(n)
      onClose()
    } catch (e) {
      busy.current = false
      setError(`${failed}: ${errorText(e)}`)
    }
  }

  function save() {
    const fields: Partial<NoteFields> = kind === 'diary' ? { day, talk } : { day, talk, life, agreements, original }
    const n = note
      ? updateNote(note, fields, now())
      : createNote(target.personId, 'meeting', { ...fields, day, eventId, occasion: draft.occasion ?? event?.title ?? '' }, now())
    void write(n, 'Не сохранилось')
  }

  function remove() {
    if (!note || !window.confirm('Удалить запись?')) return
    void write(deleteNote(note, now()), 'Не удалилось')
  }

  const title = !note ? 'Новая встреча' : kind === 'diary' ? 'Из дневника' : 'Встреча'
  return (
    <Sheet>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onClose} className={`${side} text-left`}>Отмена</button>
        <h2 className="min-w-0 text-center font-serif text-[20px] leading-tight font-semibold">{title}</h2>
        <button type="button" onClick={save} className={`${side} text-right font-semibold`}>{note ? 'Готово' : 'Сохранить'}</button>
      </div>
      {!note && person && (
        <div className="flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3">
          <Avatar id={person.id} name={person.name} size={44} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[16px] font-semibold">{person.name}</span>
            {(person.position || person.company) && (
              <span className="truncate text-[14px] text-muted">{[person.position, person.company].filter(Boolean).join(', ')}</span>
            )}
          </div>
        </div>
      )}
      {note && person && <p className="-mt-1.5 text-center text-[15px] font-semibold">{person.name}</p>}
      {event && <p className="-mt-1 text-center text-[13px] text-muted">на событии «{event.title}»</p>}
      <div className="flex">
        <label className={`relative ${chipClass}`}>
          {icon(CALENDAR_ICON, 16)}{dayGroupTitle(day, today)}
          <input
            type="date" value={day} max={today} aria-label="День записи"
            onChange={(e) => e.target.value && setDay(e.target.value)} className="absolute inset-0 text-[16px] opacity-0"
          />
        </label>
      </div>
      {kind === 'diary' ? (
        <Field label="Что было"><textarea rows={3} value={talk} onChange={(e) => setTalk(e.target.value)} className={areaClass} /></Field>
      ) : (
        <>
          <Field label="О чём говорили"><textarea rows={3} value={talk} onChange={(e) => setTalk(e.target.value)} className={areaClass} /></Field>
          <Field label="Что актуально у него"><textarea rows={2} value={life} onChange={(e) => setLife(e.target.value)} className={areaClass} /></Field>
          <Field label="Договорились, следующий шаг"><textarea rows={2} value={agreements} onChange={(e) => setAgreements(e.target.value)} className={areaClass} /></Field>
          <Field label="Исходная заметка">
            <textarea
              rows={4} value={original} onChange={(e) => setOriginal(e.target.value)}
              className="w-full resize-none rounded-[14px] border border-dashed border-muted/50 bg-line/40 px-3.5 py-2.5 font-serif text-[15px] leading-[1.5] text-ink italic outline-none"
            />
          </Field>
        </>
      )}
      {error && <p role="alert" className="text-center text-[14px] text-danger">{error}</p>}
      <div className="flex-1" />
      {note && <button type="button" onClick={remove} className={dangerClass}>Удалить запись</button>}
    </Sheet>
  )
}
