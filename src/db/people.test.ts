import 'fake-indexeddb/auto' // до импорта Dexie: подменяет indexedDB в Node
import { beforeEach, describe, expect, it } from 'vitest'
import { isoWithOffset } from '../domain/dates'
import { defaultDecisions, parsePeoplePatch, planPatch } from '../domain/peoplePatch'
import { eventRec, noteRec, patchData, personRec, samplePatch, sphereRec } from '../domain/testFixtures'
import type { PeopleData } from '../domain/types'
import { db } from './database'
import { getMeta, initDb } from './diary'
import {
  addPersonWithNote, applyPeoplePatch, getPeopleData, mergeSphereInto, saveCircles, saveEvent, saveLinks, saveNote,
  savePerson, saveSpheres,
} from './people'

const at = (d: number, h = 10) => new Date(2026, 9, d, h)
const sample = () => parsePeoplePatch(JSON.stringify(samplePatch()))

beforeEach(async () => {
  await db.delete()
  await db.open()
  await initDb()
})

async function seed(data: PeopleData) {
  for (const p of data.people) await savePerson(p)
  for (const n of data.personNotes) await saveNote(n)
  for (const e of data.events) await saveEvent(e)
  await saveSpheres(data.spheres)
  await saveCircles(data.circles)
  await saveLinks(data.personLinks)
}

describe('запись и чтение', () => {
  it('быстрая форма: человек и первая запись вместе', async () => {
    const p = personRec({ id: 'ivan' })
    const n = noteRec('ivan', { original: 'Заметка' })
    await addPersonWithNote(p, n)
    const data = await getPeopleData()
    expect(data.people).toEqual([p])
    expect(data.personNotes).toEqual([n])
  })
  it('удалённые тоже читаются — отбирает домен', async () => {
    await savePerson(personRec({ id: 'gone', deletedAt: isoWithOffset(at(25)) }))
    expect((await getPeopleData()).people).toHaveLength(1)
  })
})

describe('mergeSphereInto', () => {
  it('у человека одна сфера, исходная удалена', async () => {
    await saveSpheres([sphereRec('a', 'консалт'), sphereRec('b', 'консалтинг')])
    await savePerson(personRec({ id: 'ivan', sphereKeys: ['a', 'b'] }))
    await mergeSphereInto('a', 'b', at(25))
    const data = await getPeopleData()
    expect(data.people[0].sphereKeys).toEqual(['b'])
    expect(data.spheres.find((s) => s.key === 'a')?.deletedAt).toBe(isoWithOffset(at(25)))
  })
})

describe('applyPeoplePatch', () => {
  it('пишет изменения и отмечает файл применённым', async () => {
    await seed(patchData())
    const event = eventRec({ id: 'e1' })
    await saveEvent(event)
    const plan = planPatch(sample(), await getPeopleData(), (await getMeta()).appliedPatches ?? [])
    const counts = await applyPeoplePatch(plan, defaultDecisions(plan), at(27))
    expect(counts).toEqual({ applied: 9, edited: 0, skipped: 0 })
    const data = await getPeopleData()
    expect(data.people.find((p) => p.name === 'Олег Белов')).toBeDefined()
    expect(data.people.find((p) => p.id === 'dima')?.deletedAt).toBe(isoWithOffset(at(27)))
    expect(data.events).toEqual([event])
    expect((await getMeta()).appliedPatches).toEqual([
      { id: 'patch-1', appliedAt: isoWithOffset(at(27)), basedOnExportAt: '2026-10-25T23:10:00+03:00' },
    ])
  })
  it('повторно с правкой: строка о файле одна, данных не больше, правка записана', async () => {
    await seed(patchData())
    const first = planPatch(sample(), await getPeopleData(), [])
    await applyPeoplePatch(first, defaultDecisions(first), at(27))
    const before = await getPeopleData()
    const again = planPatch(sample(), before, (await getMeta()).appliedPatches ?? [])
    expect(again.alreadyApplied).toBe(true)
    await applyPeoplePatch(again, { ...defaultDecisions(again), 1: { selected: true, set: { position: 'Руководитель практики' } } }, at(28))
    const after = await getPeopleData()
    expect(after.people).toHaveLength(before.people.length)
    expect(after.personNotes).toHaveLength(before.personNotes.length)
    expect(after.people.find((p) => p.id === 'ivan')?.position).toBe('Руководитель практики')
    expect((await getMeta()).appliedPatches).toEqual([
      { id: 'patch-1', appliedAt: isoWithOffset(at(28)), basedOnExportAt: '2026-10-25T23:10:00+03:00' },
    ])
  })
})
