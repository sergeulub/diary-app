import { useRef, useState } from 'react'
import { savePerson, saveLinks, saveSpheres } from '../../db/people'
import { createPerson, deletePerson, isLive, linkedIds, setLinks, updatePerson, type PersonFields } from '../../domain/people'
import type { PeopleData, Person, Sphere } from '../../domain/types'
import { errorText } from '../errors'
import { Sheet, now } from '../financeUi'
import PersonFieldsEditor, { emptyFields, fieldsOf } from './PersonFields'
import PersonPicker from './PersonPicker'
import { CLOSE_ICON, dangerClass, dashedChipClass, icon, secondaryClass } from './peopleUi'

/** Сохраняет карточку: новые сферы, человека и связи «Знаком с»; пустые контакты отбрасываются. */
export async function writePerson(
  data: PeopleData, person: Person | null, fields: PersonFields, newSpheres: Sphere[], friends: string[] | null,
): Promise<Person> {
  const stamp = now()
  const clean = { ...fields, name: fields.name.trim(), contacts: fields.contacts.filter((c) => c.value.trim()) }
  const used = newSpheres.filter((s) => clean.sphereKeys.includes(s.key))
  const saved = person ? updatePerson(person, clean, stamp) : createPerson(clean, stamp)
  if (used.length) await saveSpheres(used)
  await savePerson(saved)
  if (friends) {
    const changed = setLinks(saved.id, friends, data.personLinks, stamp)
    if (changed.length) await saveLinks(changed)
  }
  return saved
}

const side = 'min-h-[44px] w-20 shrink-0 text-[16px] text-accent'

/** Полная форма карточки (артборд 11.3): правка или новый человек. */
export default function PersonForm({ data, person, onClose, onDeleted }: {
  data: PeopleData
  person: Person | null
  onClose: () => void
  onDeleted: () => void
}) {
  const [fields, setFields] = useState<PersonFields>(() => (person ? fieldsOf(person) : emptyFields()))
  const [newSpheres, setNewSpheres] = useState<Sphere[]>([])
  const [friends, setFriends] = useState<string[]>(() => (person ? linkedIds(person.id, data.personLinks) : []))
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const friendPeople = friends.flatMap((id) => data.people.find((p) => p.id === id && isLive(p)) ?? [])

  async function run(action: () => Promise<void>, failed: string) {
    if (busy.current) return
    busy.current = true
    try {
      await action()
    } catch (e) {
      busy.current = false
      setError(`${failed}: ${errorText(e)}`)
    }
  }

  function save() {
    if (!fields.name.trim()) {
      setError('Нужно имя')
      return
    }
    void run(async () => {
      await writePerson(data, person, fields, newSpheres, friends)
      onClose()
    }, 'Не сохранилось')
  }

  function archive() {
    if (!person) return
    void run(async () => {
      await savePerson(updatePerson(person, { archived: !person.archived }, now()))
      onClose()
    }, 'Не сохранилось')
  }

  function remove() {
    if (!person || !window.confirm(`Удалить «${person.name}»?`)) return
    void run(async () => {
      await savePerson(deletePerson(person, now()))
      onDeleted()
    }, 'Не удалилось')
  }

  return (
    <Sheet>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onClose} className={`${side} text-left`}>Отмена</button>
        <h2 className="min-w-0 truncate text-center font-serif text-[20px] font-semibold">{person?.name ?? 'Новый человек'}</h2>
        <button type="button" onClick={save} className={`${side} text-right font-semibold`}>Готово</button>
      </div>
      <PersonFieldsEditor value={fields} onChange={setFields} data={data} newSpheres={newSpheres} onNewSpheres={setNewSpheres} />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Знаком с</span>
        <div className="flex flex-wrap gap-2">
          {friendPeople.map((p) => (
            <span key={p.id} className="flex min-h-[38px] items-center rounded-full border border-line bg-surface pl-3.5 text-[14px]">
              {p.name}
              <button type="button" aria-label={`Убрать «${p.name}»`} onClick={() => setFriends(friends.filter((x) => x !== p.id))} className="flex size-9 items-center justify-center text-muted">
                {icon(CLOSE_ICON, 14, 2.4)}
              </button>
            </span>
          ))}
          <button type="button" onClick={() => setPicking(true)} className={dashedChipClass}>+ человек</button>
        </div>
      </div>
      {error && <p role="alert" className="text-center text-[14px] text-danger">{error}</p>}
      {person && (
        <div className="flex flex-col gap-2.5 pt-2">
          <button type="button" onClick={archive} className={secondaryClass}>{person.archived ? 'Вернуть из архива' : 'Перенести в архив'}</button>
          <button type="button" onClick={remove} className={dangerClass}>Удалить человека</button>
        </div>
      )}
      {picking && (
        <PersonPicker
          data={data} title="Знаком с" exclude={[...(person ? [person.id] : []), ...friends]}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setFriends([...friends, p.id])
            setPicking(false)
          }}
        />
      )}
    </Sheet>
  )
}
