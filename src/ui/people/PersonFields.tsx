import { useState } from 'react'
import { CONTACT_LABELS, countByKey, createSphere, isLive, type PersonFields } from '../../domain/people'
import type { ContactType, PeopleData, Person, Sphere } from '../../domain/types'
import { now } from '../financeUi'
import { CLOSE_ICON, Field, areaClass, dashedChipClass, fieldClass, icon } from './peopleUi'
import SphereInput from './SphereInput'

export const emptyFields = (name = ''): PersonFields => ({
  name, aliases: [], company: '', position: '', about: '', sphereKeys: [], circleKey: '', canHelp: '', iCanHelp: '',
  personal: '', contacts: [], archived: false,
})

export const fieldsOf = ({ id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...fields }: Person): PersonFields => fields

const CONTACT_TYPES = Object.keys(CONTACT_LABELS) as ContactType[]

function Aliases({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (t && !value.includes(t)) onChange([...value, t])
    setText('')
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((a) => (
        <span key={a} className="flex min-h-[38px] items-center rounded-full border border-line bg-surface pl-3.5 text-[14px]">
          {a}
          <button type="button" aria-label={`Убрать «${a}»`} onClick={() => onChange(value.filter((x) => x !== a))} className="flex size-9 items-center justify-center text-muted">
            {icon(CLOSE_ICON, 14, 2.4)}
          </button>
        </span>
      ))}
      <input
        value={text} onChange={(e) => setText(e.target.value)} onBlur={add} enterKeyHint="done" placeholder="+ имя"
        aria-label="Как ещё называю"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        className="min-h-[38px] w-32 rounded-full border border-dashed border-muted/60 bg-transparent px-3.5 text-[16px] text-ink outline-none placeholder:text-muted focus:border-solid focus:border-accent"
      />
    </div>
  )
}

/**
 * Поля карточки (артборд 11.3), без «Знаком с». newSpheres — созданные в этой форме сферы; пишутся вместе с человеком.
 */
export default function PersonFieldsEditor({ value, onChange, data, newSpheres, onNewSpheres, withName = true }: {
  value: PersonFields
  onChange: (v: PersonFields) => void
  data: PeopleData
  newSpheres: Sphere[]
  onNewSpheres: (s: Sphere[]) => void
  withName?: boolean
}) {
  const set = (patch: Partial<PersonFields>) => onChange({ ...value, ...patch })
  const spheres = [...data.spheres.filter(isLive), ...newSpheres].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const circles = data.circles
    .filter((c) => isLive(c) && (!c.archived || c.key === value.circleKey))
    .sort((a, b) => a.order - b.order)
  const text = (key: 'about' | 'canHelp' | 'iCanHelp' | 'personal', label: string, rows: number) => (
    <Field label={label}>
      <textarea rows={rows} value={value[key]} onChange={(e) => set({ [key]: e.target.value })} className={areaClass} />
    </Field>
  )

  return (
    <>
      {withName && (
        <Field label="Имя">
          <input value={value.name} onChange={(e) => set({ name: e.target.value })} autoCapitalize="words" className={fieldClass} />
        </Field>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Как ещё называю</span>
        <Aliases value={value.aliases} onChange={(aliases) => set({ aliases })} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Компания"><input value={value.company} onChange={(e) => set({ company: e.target.value })} className={fieldClass} /></Field>
        <Field label="Должность"><input value={value.position} onChange={(e) => set({ position: e.target.value })} className={fieldClass} /></Field>
      </div>
      {text('about', 'Чем занимается', 3)}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Сферы</span>
        <SphereInput
          selected={value.sphereKeys} spheres={spheres} counts={countByKey(data.people, (p) => p.sphereKeys)}
          onAdd={(k) => set({ sphereKeys: [...value.sphereKeys, k] })}
          onRemove={(k) => set({ sphereKeys: value.sphereKeys.filter((x) => x !== k) })}
          onCreate={(name) => {
            const s = createSphere(name, now())
            onNewSpheres([...newSpheres, s])
            set({ sphereKeys: [...value.sphereKeys, s.key] })
          }}
        />
      </div>
      <Field label="Круг">
        <select value={value.circleKey} onChange={(e) => set({ circleKey: e.target.value })} className={fieldClass}>
          <option value="">Без круга</option>
          {circles.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
      </Field>
      {text('canHelp', 'Чем может быть полезен', 2)}
      {text('iCanHelp', 'Чем я могу быть полезен ему', 2)}
      {text('personal', 'Личное', 2)}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Контакты</span>
        {value.contacts.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={c.type} aria-label="Тип контакта"
              onChange={(e) => set({ contacts: value.contacts.map((x, j) => (j === i ? { ...x, type: e.target.value as ContactType } : x)) })}
              className="min-h-[46px] shrink-0 rounded-[14px] border border-line bg-line/40 px-2.5 text-[15px] text-ink"
            >
              {CONTACT_TYPES.map((t) => <option key={t} value={t}>{CONTACT_LABELS[t]}</option>)}
            </select>
            <input
              value={c.value} aria-label={CONTACT_LABELS[c.type]}
              onChange={(e) => set({ contacts: value.contacts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
              className={`${fieldClass} min-w-0 flex-1`}
            />
            <button
              type="button" aria-label="Удалить контакт" onClick={() => set({ contacts: value.contacts.filter((_, j) => j !== i) })}
              className="flex size-11 shrink-0 items-center justify-center text-muted"
            >
              {icon(CLOSE_ICON, 18, 2)}
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set({ contacts: [...value.contacts, { type: 'telegram', value: '' }] })} className={`${dashedChipClass} self-start`}>
          + контакт
        </button>
      </div>
    </>
  )
}
