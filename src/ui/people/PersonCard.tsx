import { CONTACT_LABELS, isLive, isUnparsed, linkedIds } from '../../domain/people'
import { plural } from '../../domain/ru'
import type { AppliedPatch, ContactType, PeopleData, PersonNote } from '../../domain/types'
import Feed from './Feed'
import type { Nav } from './nav'
import { Avatar, BackBar, PLUS_ICON, icon, textButton } from './peopleUi'

const CONTACT_ICONS: Record<ContactType, string> = {
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  telegram: 'M21 4L3 11l6 2.5M21 4l-3 16-9-6.5M21 4L9 13.5v5l3-3.2',
  email: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3.5 6.5L12 13l8.5-6.5',
  linkedin: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  other: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM8 12h8',
}
const COPY_ICON = 'M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'

/** Карточка человека (артборд 11.1) и его лента. */
export default function PersonCard({ data, id, applied, backLabel, nav, onEdit, onOpenNote, onNewNote }: {
  data: PeopleData
  id: string
  applied: AppliedPatch[]
  backLabel: string
  nav: Nav
  onEdit: () => void
  onOpenNote: (n: PersonNote) => void
  onNewNote: () => void
}) {
  const p = data.people.find((x) => x.id === id)
  if (!p || !isLive(p)) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))]">
        <BackBar label={backLabel} onBack={nav.back} />
        <p className="text-[15px] text-muted">Человек удалён</p>
      </div>
    )
  }
  const circle = data.circles.find((c) => c.key === p.circleKey)
  const spheres = p.sphereKeys.flatMap((k) => data.spheres.find((s) => s.key === k && isLive(s))?.name ?? [])
  const unparsed = data.personNotes.filter((n) => n.personId === p.id && isLive(n) && isUnparsed(n)).length
  const friends = linkedIds(p.id, data.personLinks)
    .flatMap((fid) => data.people.find((x) => x.id === fid && isLive(x)) ?? [])
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const job = [p.position, p.company].map((s) => s.trim()).filter(Boolean).join(', ')
  const info: [string, string][] = [
    ['Чем занимается', p.about], ['Чем может быть полезен', p.canHelp], ['Чем я могу быть полезен ему', p.iCanHelp], ['Личное', p.personal],
  ]
  const contacts = p.contacts.filter((c) => c.value.trim())
  const shownInfo = info.filter(([, v]) => v.trim())

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-8">
      <BackBar label={backLabel} onBack={nav.back} right={<button type="button" onClick={onEdit} className={textButton}>Изменить</button>} />
      <div className="flex items-start gap-3.5">
        <Avatar id={p.id} name={p.name} size={56} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="font-serif text-[27px] leading-[1.15] font-semibold">{p.name}</h1>
          {p.aliases.length > 0 && <span className="text-[14px] text-muted">{p.aliases.join(' · ')}</span>}
          {job && <span className="text-[15px]">{job}</span>}
        </div>
      </div>
      {(circle || unparsed > 0 || p.archived) && (
        <div className="flex flex-wrap items-center gap-2">
          {circle && <span className="rounded-full bg-accent/15 px-3 py-1 text-[13px] font-semibold text-accent">{circle.name}</span>}
          {p.archived && <span className="rounded-full bg-line px-3 py-1 text-[13px] font-semibold text-muted">В архиве</span>}
          {unparsed > 0 && (
            <span className="rounded-full bg-imp-optional/25 px-2.5 py-[3px] text-[12px] font-semibold">
              {unparsed} {plural(unparsed, ['заметка не разобрана', 'заметки не разобраны', 'заметок не разобрано'])}
            </span>
          )}
        </div>
      )}
      {(shownInfo.length > 0 || spheres.length > 0) && (
        <section className="flex flex-col rounded-[20px] border border-line bg-surface px-4 py-1 shadow-card">
          {[...shownInfo.slice(0, 1), ...(spheres.length ? [['Сферы', ''] as [string, string]] : []), ...shownInfo.slice(1)].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 border-b border-line py-2.5 last:border-b-0">
              <span className="text-[12.5px] text-muted">{label}</span>
              {label === 'Сферы' ? (
                <span className="flex flex-wrap gap-1.5">
                  {spheres.map((s) => <span key={s} className="rounded-full bg-line px-2.5 py-[3px] text-[13px]">{s}</span>)}
                </span>
              ) : (
                <span className="text-[15px] leading-[1.4] whitespace-pre-line">{value}</span>
              )}
            </div>
          ))}
        </section>
      )}
      {contacts.length > 0 && (
        <section className="flex flex-col rounded-[20px] border border-line bg-surface py-0.5 pr-3 pl-4">
          {contacts.map((c, i) => (
            <div key={i} className="flex min-h-[54px] items-center gap-3 border-b border-line last:border-b-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-accent/15 text-accent">{icon(CONTACT_ICONS[c.type], 18)}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12.5px] text-muted">{CONTACT_LABELS[c.type]}</span>
                <span className="truncate text-[15px] select-all">{c.value}</span>
              </span>
              <button
                type="button" aria-label="Скопировать" onClick={() => navigator.clipboard?.writeText(c.value).catch(() => {})}
                className="flex size-11 shrink-0 items-center justify-center text-muted"
              >
                {icon(COPY_ICON, 19)}
              </button>
            </div>
          ))}
        </section>
      )}
      {friends.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] text-muted">Знаком с</span>
          <div className="flex flex-wrap gap-2">
            {friends.map((f) => (
              <button
                key={f.id} type="button" onClick={() => nav.push({ kind: 'person', id: f.id })}
                className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-3.5 pl-1.5 text-[14px]"
              >
                <Avatar id={f.id} name={f.name} size={26} />{f.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between pt-2">
        <h2 className="font-serif text-[22px] font-semibold">Лента</h2>
        <button type="button" onClick={onNewNote} className="flex min-h-[38px] items-center gap-1.5 rounded-full bg-accent/15 px-3.5 text-[14px] font-semibold text-accent">
          {icon(PLUS_ICON, 16, 2.3)}Запись
        </button>
      </div>
      <Feed
        data={data} personId={p.id} applied={applied} onOpen={onOpenNote}
        onOpenEvent={(eid) => nav.push({ kind: 'event', id: eid })} onOpenDay={nav.openDay}
      />
    </div>
  )
}
