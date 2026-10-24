import { useState } from 'react'
import { mergeSphereInto, saveCircles, saveSpheres } from '../../db/people'
import { countByKey, findByName, isLive } from '../../domain/people'
import { plural } from '../../domain/ru'
import type { Circle, PeopleData, Sphere } from '../../domain/types'
import { errorText } from '../errors'
import { now } from '../financeUi'
import { IconButton } from '../MetricsSettings'
import type { Nav } from './nav'
import { BackBar, BottomSheet, Field, PLUS_ICON, fieldClass, icon, primaryClass, secondaryClass } from './peopleUi'

const row = 'flex min-h-[44px] w-full items-center gap-2.5 border-b border-line text-left text-[15px] last:border-b-0'
const people = (n: number) => `${n} чел.`

function SphereSheet({ data, sphere, counts, onClose }: {
  data: PeopleData
  sphere: Sphere
  counts: Map<string, number>
  onClose: () => void
}) {
  const [name, setName] = useState(sphere.name)
  const others = data.spheres.filter((s) => isLive(s) && s.key !== sphere.key).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const [into, setInto] = useState(others[0]?.key ?? '')
  const [error, setError] = useState<string | null>(null)
  const n = counts.get(sphere.key) ?? 0
  const target = others.find((s) => s.key === into)

  async function rename() {
    const clash = findByName(name, data.spheres)
    if (!name.trim()) return setError('Нужно название')
    if (clash && clash.key !== sphere.key) return setError(`Сфера «${clash.name}» уже есть — объедините их`)
    try {
      await saveSpheres([{ ...sphere, name: name.trim(), updatedAt: now() }])
      onClose()
    } catch (e) {
      setError(`Не сохранилось: ${errorText(e)}`)
    }
  }

  async function merge() {
    if (!target) return
    try {
      await mergeSphereInto(sphere.key, target.key, new Date())
      onClose()
    } catch (e) {
      setError(`Не объединилось: ${errorText(e)}`)
    }
  }

  return (
    <BottomSheet label={`Сфера «${sphere.name}»`} onClose={onClose}>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-serif text-[20px] font-semibold">Сфера «{sphere.name}»</h2>
        <span className="text-[13px] text-muted">у {n} {plural(n, ['человека', 'человек', 'человек'])}</span>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1"><Field label="Название"><input value={name} onChange={(e) => { setName(e.target.value); setError(null) }} className={fieldClass} /></Field></div>
        <button type="button" onClick={() => void rename()} className="min-h-[46px] shrink-0 rounded-[14px] border-[1.5px] border-accent bg-surface px-3.5 text-[15px] font-semibold text-accent">
          Переименовать
        </button>
      </div>
      {others.length > 0 && (
        <>
          <div className="h-px bg-line" />
          <div role="radiogroup" aria-label="С какой сферой объединить" className="flex flex-col">
            <span className="pb-1 text-[15px] font-semibold">Объединить с другой сферой</span>
            {others.map((s) => (
              <button key={s.key} type="button" role="radio" aria-checked={into === s.key} onClick={() => setInto(s.key)} className={`${row} min-h-[46px] gap-3 text-[16px]`}>
                <span className={`size-[22px] shrink-0 rounded-full ${into === s.key ? 'border-[7px] border-accent bg-white' : 'border-[1.5px] border-muted/60 bg-surface'}`} />
                <span className="flex-1">{s.name}</span>
                <span className="text-[13px] text-muted">{people(counts.get(s.key) ?? 0)}</span>
              </button>
            ))}
          </div>
          {target && (
            <p className="rounded-[14px] bg-line/70 px-3.5 py-3 text-[14px] leading-[1.45]">
              У {n} {plural(n, ['человека', 'человек', 'человек'])} «{sphere.name}» станет «{target.name}».
            </p>
          )}
          <button type="button" onClick={() => void merge()} className={primaryClass}>Объединить</button>
        </>
      )}
      {error && <p role="alert" className="text-center text-[14px] text-danger">{error}</p>}
    </BottomSheet>
  )
}

function CircleSheet({ data, circle, onClose }: { data: PeopleData; circle: Circle | null; onClose: () => void }) {
  const [name, setName] = useState(circle?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const n = circle ? countByKey(data.people, (p) => [p.circleKey]).get(circle.key) ?? 0 : 0

  async function write(c: Circle) {
    try {
      await saveCircles([c])
      onClose()
    } catch (e) {
      setError(`Не сохранилось: ${errorText(e)}`)
    }
  }

  function save() {
    const clash = findByName(name, data.circles)
    if (!name.trim()) return setError('Нужно название')
    if (clash && clash.key !== circle?.key) return setError(`Круг «${clash.name}» уже есть`)
    const stamp = now()
    const order = Math.max(0, ...data.circles.map((c) => c.order)) + 1
    void write(circle
      ? { ...circle, name: name.trim(), updatedAt: stamp }
      : { key: crypto.randomUUID(), name: name.trim(), order, archived: false, createdAt: stamp, updatedAt: stamp, deletedAt: null })
  }

  return (
    <BottomSheet label={circle ? `Круг «${circle.name}»` : 'Новый круг'} onClose={onClose}>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-serif text-[20px] font-semibold">{circle ? `Круг «${circle.name}»` : 'Новый круг'}</h2>
        {circle && <span className="text-[13px] text-muted">{n} {plural(n, ['человек', 'человека', 'человек'])}</span>}
      </div>
      <Field label="Название"><input value={name} autoFocus={!circle} onChange={(e) => { setName(e.target.value); setError(null) }} className={fieldClass} /></Field>
      <button type="button" onClick={save} className={primaryClass}>Сохранить</button>
      {circle && (
        <button type="button" onClick={() => void write({ ...circle, archived: !circle.archived, updatedAt: now() })} className={secondaryClass}>
          {circle.archived ? 'Вернуть из архива' : 'Перенести в архив'}
        </button>
      )}
      {error && <p role="alert" className="text-center text-[14px] text-danger">{error}</p>}
    </BottomSheet>
  )
}

/** «Сферы и круги» (артборд 13): переименование и объединение сфер, круги — порядок, название, архив. */
export default function SpheresScreen({ data, backLabel, nav }: { data: PeopleData; backLabel: string; nav: Nav }) {
  const [sphere, setSphere] = useState<Sphere | null>(null)
  const [circle, setCircle] = useState<Circle | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const sphereCounts = countByKey(data.people, (p) => p.sphereKeys)
  const circleCounts = countByKey(data.people, (p) => [p.circleKey])
  const spheres = data.spheres.filter(isLive).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const circles = data.circles.filter(isLive).sort((a, b) => a.order - b.order)
  const active = circles.filter((c) => !c.archived)
  const archived = circles.filter((c) => c.archived)

  function move(i: number, delta: number) {
    const a = active[i]
    const b = active[i + delta]
    if (!a || !b) return
    const stamp = now()
    void saveCircles([{ ...a, order: b.order, updatedAt: stamp }, { ...b, order: a.order, updatedAt: stamp }])
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-8">
      <BackBar label={backLabel} onBack={nav.back} />
      <h1 className="font-serif text-[30px] leading-[1.15] font-semibold">Сферы и круги</h1>
      <h2 className="px-1 text-[15px] font-semibold">Сферы · {spheres.length}</h2>
      <section className="flex flex-col rounded-[20px] border border-line bg-surface px-4 py-0.5 shadow-card">
        {spheres.length === 0 && <p className="py-3 text-[15px] text-muted">Сфер пока нет</p>}
        {spheres.map((s) => (
          <button key={s.key} type="button" onClick={() => setSphere(s)} className={row}>
            <span className="flex-1">{s.name}</span>
            <span className="text-[13px] text-muted">{people(sphereCounts.get(s.key) ?? 0)}</span>
            <span className="text-muted/70">{icon('M9 5l7 7-7 7', 16, 2)}</span>
          </button>
        ))}
      </section>
      <h2 className="px-1 pt-1 text-[15px] font-semibold">Круги</h2>
      <section className="flex flex-col rounded-[20px] border border-line bg-surface py-0.5 pr-1 pl-4 shadow-card">
        {active.map((c, i) => (
          <div key={c.key} className="flex min-h-[44px] items-center gap-1 border-b border-line">
            <button type="button" onClick={() => setCircle(c)} className="flex min-h-[44px] flex-1 items-center gap-2.5 text-left text-[15px]">
              <span className="flex-1">{c.name}</span>
              <span className="text-[13px] text-muted">{people(circleCounts.get(c.key) ?? 0)}</span>
            </button>
            <IconButton label="Выше" disabled={i === 0} onClick={() => move(i, -1)}><path d="M12 19V5M6 11l6-6 6 6" /></IconButton>
            <IconButton label="Ниже" disabled={i === active.length - 1} onClick={() => move(i, 1)}><path d="M12 5v14M6 13l6 6 6-6" /></IconButton>
          </div>
        ))}
        <button type="button" onClick={() => setCircle('new')} className="flex min-h-[44px] items-center gap-2 text-[15px] font-semibold text-accent">
          {icon(PLUS_ICON, 18, 2.2)}Круг
        </button>
      </section>
      {archived.length > 0 && (
        <div className="flex flex-col gap-1">
          <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)} className="flex min-h-[44px] items-center gap-2.5 px-1 text-left text-[14px] text-muted">
            <span className="flex-1">В архиве: {archived.map((c) => c.name).join(', ')}</span>
            {icon(showArchived ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6', 16, 2)}
          </button>
          {showArchived && (
            <section className="flex flex-col rounded-[20px] border border-line bg-surface px-4 py-0.5">
              {archived.map((c) => (
                <button key={c.key} type="button" onClick={() => setCircle(c)} className={row}>
                  <span className="flex-1 text-muted">{c.name}</span>
                  <span className="text-[13px] text-muted">{people(circleCounts.get(c.key) ?? 0)}</span>
                </button>
              ))}
            </section>
          )}
        </div>
      )}
      {sphere && <SphereSheet key={sphere.key} data={data} sphere={sphere} counts={sphereCounts} onClose={() => setSphere(null)} />}
      {circle && <CircleSheet data={data} circle={circle === 'new' ? null : circle} onClose={() => setCircle(null)} />}
    </div>
  )
}
