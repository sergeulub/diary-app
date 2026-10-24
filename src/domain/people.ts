import { monthOf } from './dates'
import { SEED_TIME } from './metrics'
import type {
  AppliedPatch, Circle, ContactType, PeopleData, PeopleEvent, Person, PersonLink, PersonNote, PersonNoteKind, Sphere,
} from './types'

const circle = (key: string, name: string, order: number): Circle =>
  ({ key, name, order, archived: false, createdAt: SEED_TIME, updatedAt: SEED_TIME, deletedAt: null })

/** Нейтральные круги по умолчанию; свои пользователь задаёт в телефоне. */
export const DEFAULT_CIRCLES: Circle[] = [
  circle('speaker', 'Спикер / гость', 1),
  circle('friends', 'Однокурсник / друг', 2),
  circle('hr', 'Рекрутер / HR', 3),
  circle('mentor', 'Наставник / консультант', 4),
]

export const CONTACT_LABELS: Record<ContactType, string> = {
  phone: 'Телефон',
  telegram: 'Telegram',
  email: 'Почта',
  linkedin: 'LinkedIn',
  other: 'Другое',
}

export const isLive = (x: { deletedAt: string | null }) => !x.deletedAt

/** Для сравнения без учёта регистра и «ё». */
export const foldText = (s: string) => s.toLowerCase().replace(/ё/g, 'е')

const blank = (s: string) => !s.trim()
const byMoment = (a: string, b: string) => Date.parse(a) - Date.parse(b)

export type PersonFields = Omit<Person, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

export function createPerson(fields: Partial<PersonFields> & { name: string }, now: string): Person {
  const name = fields.name.trim()
  if (!name) throw new Error('Нужно имя')
  return {
    id: crypto.randomUUID(), aliases: [], company: '', position: '', about: '', sphereKeys: [], circleKey: '',
    canHelp: '', iCanHelp: '', personal: '', contacts: [], archived: false,
    ...fields, name, createdAt: now, updatedAt: now, deletedAt: null,
  }
}

export function updatePerson(p: Person, patch: Partial<PersonFields>, now: string): Person {
  return { ...p, ...patch, updatedAt: now }
}

export function deletePerson(p: Person, now: string): Person {
  return { ...p, deletedAt: now, updatedAt: now }
}

export type NoteFields = Pick<PersonNote, 'day' | 'occasion' | 'eventId' | 'talk' | 'life' | 'agreements' | 'original'>

export function createNote(
  personId: string, kind: PersonNoteKind, fields: Partial<NoteFields> & { day: string }, now: string,
): PersonNote {
  return {
    id: crypto.randomUUID(), personId, kind, occasion: '', eventId: '', talk: '', life: '', agreements: '', original: '',
    ...fields, patchId: '', createdAt: now, updatedAt: now, deletedAt: null,
  }
}

export function updateNote(n: PersonNote, patch: Partial<NoteFields>, now: string): PersonNote {
  return { ...n, ...patch, updatedAt: now }
}

export function deleteNote(n: PersonNote, now: string): PersonNote {
  return { ...n, deletedAt: now, updatedAt: now }
}

/** Новая встреча человека на событии: день, ссылка и название события уже стоят. */
export function meetingAtEvent(personId: string, ev: PeopleEvent, now: string): PersonNote {
  return createNote(personId, 'meeting', { day: ev.day, eventId: ev.id, occasion: ev.title }, now)
}

export function createEvent(fields: { day: string; title: string; topic?: string }, now: string): PeopleEvent {
  const title = fields.title.trim()
  if (!title) throw new Error('Нужно название')
  return {
    id: crypto.randomUUID(), day: fields.day, title, topic: fields.topic ?? '',
    createdAt: now, updatedAt: now, deletedAt: null,
  }
}

export function updateEvent(e: PeopleEvent, patch: Partial<Pick<PeopleEvent, 'day' | 'title' | 'topic'>>, now: string): PeopleEvent {
  return { ...e, ...patch, updatedAt: now }
}

/** Записи сохраняют occasion — название события остаётся в ленте. */
export function deleteEvent(e: PeopleEvent, now: string): PeopleEvent {
  return { ...e, deletedAt: now, updatedAt: now }
}

/** «Не дополнено»: кроме имени и «как ещё называю», ничего не заполнено. */
export function isIncomplete(p: Person): boolean {
  const texts = [p.company, p.position, p.about, p.circleKey, p.canHelp, p.iCanHelp, p.personal]
  return texts.every(blank) && p.sphereKeys.length === 0 && p.contacts.length === 0
}

/** «Не разобрано»: у встречи есть только исходная заметка. */
export function isUnparsed(n: PersonNote): boolean {
  return n.kind === 'meeting' && !blank(n.original) && [n.talk, n.life, n.agreements].every(blank)
}

/** Лента человека: живые записи, новые дни сверху; в один день — позже созданная первой. */
export function personFeed(personId: string, notes: PersonNote[]): PersonNote[] {
  return notes
    .filter((n) => n.personId === personId && isLive(n))
    .sort((a, b) => b.day.localeCompare(a.day) || byMoment(b.createdAt, a.createdAt))
}

export function lastContactDay(personId: string, notes: PersonNote[]): string | null {
  return personFeed(personId, notes)[0]?.day ?? null
}

/** Где познакомились — самая ранняя живая встреча; только для выгрузки people/. */
export function metInfo(personId: string, notes: PersonNote[], events: PeopleEvent[]): { day: string; occasion: string } | null {
  const first = personFeed(personId, notes).filter((n) => n.kind === 'meeting').at(-1)
  if (!first) return null
  const event = events.find((e) => e.id === first.eventId && isLive(e))
  return { day: first.day, occasion: first.occasion.trim() || event?.title || '' }
}

const words = (s: string) => foldText(s).split(/\s+/).filter(Boolean)

/** Регистр, «ё», лишние пробелы и порядок слов не важны. */
export function normalizeName(s: string): string {
  return words(s).sort().join(' ')
}

/** «Похоже, уже есть»: то же имя после нормализации или то же первое слово и та же непустая компания. */
export function findSimilar(name: string, company: string, people: Person[]): Person[] {
  const norm = normalizeName(name)
  const first = words(name)[0]
  const comp = foldText(company.trim())
  return people.filter((p) => isLive(p) && (
    normalizeName(p.name) === norm || (!!comp && words(p.name)[0] === first && foldText(p.company.trim()) === comp)
  ))
}

/** Люди события — по живым записям со ссылкой на него. */
export function peopleOfEvent(eventId: string, notes: PersonNote[]): string[] {
  return [...new Set(notes.filter((n) => n.eventId === eventId && isLive(n)).map((n) => n.personId))]
}

/** Живой элемент словаря с тем же именем без учёта регистра и «ё». */
export function findByName<T extends { name: string; deletedAt: string | null }>(name: string, items: T[]): T | undefined {
  const target = foldText(name.trim())
  return items.find((x) => isLive(x) && foldText(x.name.trim()) === target)
}

export function createSphere(name: string, now: string): Sphere {
  return { key: crypto.randomUUID(), name: name.trim(), createdAt: now, updatedAt: now, deletedAt: null }
}

/** Заменяет сферу у людей без повторов; возвращает только изменённых. */
export function mergeSphere(fromKey: string, intoKey: string, people: Person[], now: string): Person[] {
  return people
    .filter((p) => p.sphereKeys.includes(fromKey))
    .map((p) => ({ ...p, sphereKeys: [...new Set(p.sphereKeys.map((k) => (k === fromKey ? intoKey : k)))], updatedAt: now }))
}

/** Пара связи по порядку; с самим собой связи нет. */
export function linkPair(x: string, y: string): [string, string] | null {
  if (x === y) return null
  return x < y ? [x, y] : [y, x]
}

const other = (l: PersonLink, personId: string) => (l.a === personId ? l.b : l.a)
const touches = (l: PersonLink, personId: string) => l.a === personId || l.b === personId

export function linkedIds(personId: string, links: PersonLink[]): string[] {
  return links.filter((l) => isLive(l) && touches(l, personId)).map((l) => other(l, personId))
}

/** Связи человека ровно с wanted: возвращает изменённые и новые записи. */
export function setLinks(personId: string, wanted: string[], links: PersonLink[], now: string): PersonLink[] {
  const want = new Set(wanted.filter((id) => id !== personId))
  const changed: PersonLink[] = links
    .filter((l) => isLive(l) && touches(l, personId) && !want.has(other(l, personId)))
    .map((l) => ({ ...l, deletedAt: now, updatedAt: now }))
  for (const id of want) {
    const [a, b] = linkPair(personId, id)!
    const same = links.filter((l) => l.a === a && l.b === b)
    if (same.some(isLive)) continue
    const dead = same[0]
    changed.push(dead
      ? { ...dead, deletedAt: null, updatedAt: now }
      : { id: crypto.randomUUID(), a, b, createdAt: now, updatedAt: now, deletedAt: null })
  }
  return changed
}

/** Последний применённый файл изменений — с самой поздней выгрузкой. */
export function lastApplied(applied: AppliedPatch[]): AppliedPatch | null {
  return applied.reduce<AppliedPatch | null>(
    (best, p) => (!best || byMoment(p.basedOnExportAt, best.basedOnExportAt) > 0 ? p : best), null,
  )
}

/** Claude уже видел запись: она пришла из файла изменений или была в выгрузке, по которой он собран. */
export function isSeenByClaude(n: PersonNote, applied: AppliedPatch[]): boolean {
  if (n.patchId) return true
  const last = lastApplied(applied)
  return !!last && byMoment(n.createdAt, last.basedOnExportAt) <= 0
}

/** Аватар: первые буквы двух первых слов имени. */
export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? '').join('')
}

/** Числа карточки «Люди» в «Настройках»: живые люди с архивными, «не дополнено», неразобранные заметки. */
export function peopleStats(data: PeopleData): { total: number; incomplete: number; unparsed: number } {
  const people = data.people.filter(isLive)
  const ids = new Set(people.map((p) => p.id))
  return {
    total: people.length,
    incomplete: people.filter(isIncomplete).length,
    unparsed: data.personNotes.filter((n) => ids.has(n.personId) && isLive(n) && isUnparsed(n)).length,
  }
}

/** Сколько живых людей у каждой сферы или круга. */
export function countByKey(people: Person[], pick: (p: Person) => string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of people) if (isLive(p)) for (const k of pick(p)) counts.set(k, (counts.get(k) ?? 0) + 1)
  return counts
}

/** Вкладка «События»: живые события по месяцам, свежие сверху, с числом людей. */
export function eventsByMonth(
  events: PeopleEvent[], notes: PersonNote[],
): { month: string; items: { event: PeopleEvent; count: number }[] }[] {
  const months = new Map<string, { event: PeopleEvent; count: number }[]>()
  const sorted = events.filter(isLive).sort((a, b) => b.day.localeCompare(a.day) || byMoment(b.createdAt, a.createdAt))
  for (const event of sorted) {
    const month = monthOf(event.day)
    months.set(month, [...(months.get(month) ?? []), { event, count: peopleOfEvent(event.id, notes).length }])
  }
  return [...months].map(([month, items]) => ({ month, items }))
}

/** Перед какой записью ленты рисовать полосу «разобрано Claude»; -1 — полосы нет. */
export function claudeDividerIndex(feed: PersonNote[], applied: AppliedPatch[]): number {
  if (!lastApplied(applied)) return -1
  const i = feed.findIndex((n) => isSeenByClaude(n, applied))
  return i > 0 ? i : -1
}
