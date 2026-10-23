import { isoWithOffset } from '../domain/dates'
import { mergeSphere } from '../domain/people'
import { applyPlan, type Decisions, type PatchCounts, type PatchPlan } from '../domain/peoplePatch'
import type { Circle, PeopleData, PeopleEvent, Person, PersonLink, PersonNote, Sphere } from '../domain/types'
import { db } from './database'
import { getMeta } from './diary'

const peopleTables = () => [db.people, db.personNotes, db.events, db.spheres, db.circles, db.personLinks]

/** Все строки модуля вместе с удалёнными: отбирает домен. */
export async function getPeopleData(): Promise<PeopleData> {
  return db.transaction('r', peopleTables(), async () => ({
    people: await db.people.toArray(),
    personNotes: await db.personNotes.toArray(),
    events: await db.events.toArray(),
    spheres: await db.spheres.toArray(),
    circles: await db.circles.toArray(),
    personLinks: await db.personLinks.toArray(),
  }))
}

export async function savePerson(p: Person): Promise<void> {
  await db.people.put(p)
}

export async function saveNote(n: PersonNote): Promise<void> {
  await db.personNotes.put(n)
}

export async function saveEvent(e: PeopleEvent): Promise<void> {
  await db.events.put(e)
}

export async function saveSpheres(s: Sphere[]): Promise<void> {
  await db.spheres.bulkPut(s)
}

export async function saveCircles(c: Circle[]): Promise<void> {
  await db.circles.bulkPut(c)
}

export async function saveLinks(l: PersonLink[]): Promise<void> {
  await db.personLinks.bulkPut(l)
}

/** Быстрая форма: человек и его первая встреча — одной транзакцией. */
export async function addPersonWithNote(p: Person, n: PersonNote): Promise<void> {
  await db.transaction('rw', db.people, db.personNotes, async () => {
    await db.people.put(p)
    await db.personNotes.put(n)
  })
}

/** Объединение сфер: ключ заменяется у людей без повторов, исходная сфера мягко удаляется. */
export async function mergeSphereInto(fromKey: string, intoKey: string, now: Date): Promise<void> {
  const stamp = isoWithOffset(now)
  await db.transaction('rw', db.people, db.spheres, async () => {
    await db.people.bulkPut(mergeSphere(fromKey, intoKey, await db.people.toArray(), stamp))
    const from = await db.spheres.get(fromKey)
    if (from) await db.spheres.put({ ...from, deletedAt: stamp, updatedAt: stamp })
  })
}

/** Файл изменений с ПК — одной транзакцией по свежим данным; файл отмечается применённым (повтор заменяет строку). */
export async function applyPeoplePatch(plan: PatchPlan, decisions: Decisions, now: Date): Promise<PatchCounts> {
  return db.transaction('rw', [...peopleTables(), db.meta], async () => {
    const { changes, applied, counts } = applyPlan(plan, decisions, await getPeopleData(), isoWithOffset(now))
    await db.people.bulkPut(changes.people)
    await db.personNotes.bulkPut(changes.personNotes)
    await db.spheres.bulkPut(changes.spheres)
    await db.circles.bulkPut(changes.circles)
    await db.personLinks.bulkPut(changes.personLinks)
    const rest = ((await getMeta()).appliedPatches ?? []).filter((a) => a.id !== applied.id)
    await db.meta.put({ key: 'appliedPatches', value: [...rest, applied] })
    return counts
  })
}
