import { describe, expect, it } from 'vitest'
import { applyPlan, defaultDecisions, derivedId, parsePeoplePatch, planPatch, type PeoplePatch, type PatchResult } from './peoplePatch'
import { linkRec, noteRec, patchData, personRec, samplePatch } from './testFixtures'
import type { PeopleData } from './types'

const NOW = '2026-10-27T10:00:00.000+03:00'
const LATER = '2026-10-26T09:00:00.000+03:00'
const NEW_ID = derivedId('patch-1:0')

const sample = (): PeoplePatch => parsePeoplePatch(JSON.stringify(samplePatch()))
const withOps = (ops: unknown[], over: Record<string, unknown> = {}): PeoplePatch =>
  parsePeoplePatch(JSON.stringify({ ...samplePatch(), ...over, ops }))
const applyAll = (patch: PeoplePatch, data: PeopleData, now = NOW) => {
  const plan = planPatch(patch, data, [])
  return applyPlan(plan, defaultDecisions(plan), data, now)
}

/** Данные телефона после записи изменений: по id и key новые версии заменяют старые. */
function withChanges(data: PeopleData, { changes }: PatchResult): PeopleData {
  const merge = <T>(old: T[], fresh: T[], key: (x: T) => string) => {
    const map = new Map(old.map((x) => [key(x), x]))
    for (const x of fresh) map.set(key(x), x)
    return [...map.values()]
  }
  return {
    people: merge(data.people, changes.people, (p) => p.id),
    personNotes: merge(data.personNotes, changes.personNotes, (n) => n.id),
    events: data.events,
    spheres: merge(data.spheres, changes.spheres, (s) => s.key),
    circles: merge(data.circles, changes.circles, (c) => c.key),
    personLinks: merge(data.personLinks, changes.personLinks, (l) => l.id),
  }
}

describe('applyPlan', () => {
  it('новый человек, его запись и связь; сфера и круг — по названию', () => {
    const res = applyAll(sample(), patchData())
    const oleg = res.changes.people.find((p) => p.id === NEW_ID)
    expect(oleg).toMatchObject({ name: 'Олег Белов', company: 'Луч', circleKey: 'friends', createdAt: NOW, deletedAt: null })
    expect(res.changes.spheres.map((s) => s.name).sort()).toEqual(['аналитика', 'консалт', 'консалтинг'])
    expect(oleg?.sphereKeys).toEqual([derivedId('sphere:аналитика')])
    const note = res.changes.personNotes.find((n) => n.id === derivedId('patch-1:3'))
    expect(note).toMatchObject({ personId: NEW_ID, kind: 'meeting', day: '2026-10-20', occasion: 'кофе', talk: 'Об аналитике', patchId: 'patch-1' })
    const [a, b] = [NEW_ID, 'ivan'].sort()
    expect(res.changes.personLinks).toEqual([{ id: derivedId('patch-1:6'), a, b, createdAt: NOW, updatedAt: NOW, deletedAt: null }])
    expect(res.changes.people.find((p) => p.id === 'ivan')).toMatchObject({ position: 'Управляющий партнёр', sphereKeys: ['s-kons'], updatedAt: NOW })
    expect(res.changes.personNotes.find((n) => n.id === 'note-ivan')).toMatchObject({ talk: 'О стажировке', patchId: 'patch-1' })
    expect(res.applied).toEqual({ id: 'patch-1', appliedAt: NOW, basedOnExportAt: '2026-10-25T23:10:00+03:00' })
    expect(res.counts).toEqual({ applied: 9, edited: 0, skipped: 0 })
    expect(res.changes.events).toEqual([])
  })
  it('правка пользователя заменяет предложение файла', () => {
    const data = patchData()
    const plan = planPatch(sample(), data, [])
    const decisions = { ...defaultDecisions(plan), 1: { selected: true, set: { position: 'Руководитель практики' } } }
    const res = applyPlan(plan, decisions, data, NOW)
    expect(res.changes.people.find((p) => p.id === 'ivan')).toMatchObject({ position: 'Руководитель практики', sphereKeys: ['s-kons'] })
    expect(res.counts.edited).toBe(1)
  })
  it('принятый вручную конфликт применяется, заблокированная операция — нет', () => {
    const data = patchData()
    data.people = data.people.map((p) => (p.id === 'ivan' ? { ...p, updatedAt: LATER } : p.id === 'dima' ? { ...p, deletedAt: LATER } : p))
    const plan = planPatch(sample(), data, [])
    expect([plan.ops[1].status, plan.ops[5].status]).toEqual(['conflict', 'blocked'])
    const res = applyPlan(plan, { ...defaultDecisions(plan), 1: { selected: true }, 5: { selected: true } }, data, NOW)
    expect(res.changes.people.find((p) => p.id === 'ivan')?.position).toBe('Управляющий партнёр')
    expect(res.changes.people.find((p) => p.id === 'dmitry')).toBeUndefined()
    expect(res.counts).toEqual({ applied: 8, edited: 0, skipped: 1 })
  })
  it('снятый новый человек снимает свои записи и связи', () => {
    const data = patchData()
    const plan = planPatch(sample(), data, [])
    const res = applyPlan(plan, { ...defaultDecisions(plan), 0: { selected: false } }, data, NOW)
    expect(res.changes.people.find((p) => p.id === NEW_ID)).toBeUndefined()
    expect(res.changes.personLinks).toEqual([])
    expect(res.counts.skipped).toBe(3)
  })
  it('одна запись «из дневника» на день — и в одном файле, и в двух', () => {
    const data = patchData()
    const twice = withOps([
      { op: 'upsertDiaryNote', personId: 'ivan', day: '2026-10-18', talk: 'Кино' },
      { op: 'upsertDiaryNote', personId: 'ivan', day: '2026-10-18', talk: 'Ходили в кино' },
    ])
    const first = applyAll(twice, data)
    expect(first.changes.personNotes.filter((n) => n.kind === 'diary').map((n) => n.talk)).toEqual(['Ходили в кино'])
    const second = withOps([{ op: 'upsertDiaryNote', personId: 'ivan', day: '2026-10-18', talk: 'Кино и кофе' }], {
      id: 'patch-2', basedOnExportAt: '2026-10-28T09:00:00.000+03:00',
    })
    const after = withChanges(withChanges(data, first), applyAll(second, withChanges(data, first), '2026-10-28T10:00:00.000+03:00'))
    expect(after.personNotes.filter((n) => n.kind === 'diary').map((n) => [n.talk, n.patchId])).toEqual([['Кино и кофе', 'patch-2']])
  })
  it('объединение переносит записи и связи без петли, поля — по правилу', () => {
    const data = patchData()
    data.people = data.people.map((p) =>
      p.id === 'dima' ? { ...p, company: 'Луч', personal: 'Играет в шахматы', circleKey: 'friends' }
        : p.id === 'dmitry' ? { ...p, personal: 'Бегает' } : p)
    data.people.push(personRec({ id: 'x', name: 'Ксения Белова' }))
    data.personNotes.push(noteRec('dima', { id: 'note-dima' }))
    data.personLinks = [linkRec('dima', 'dmitry'), linkRec('dima', 'x'), linkRec('dmitry', 'x')]
    const res = applyAll(withOps([{ op: 'mergePeople', fromId: 'dima', intoId: 'dmitry', baseUpdatedAt: { from: data.people[1].updatedAt, into: data.people[2].updatedAt } }]), data)
    const after = withChanges(data, res)
    const into = after.people.find((p) => p.id === 'dmitry')!
    expect(into).toMatchObject({
      aliases: ['Дмитрий', 'Дима из клуба'], company: 'Луч', personal: 'Бегает\nИграет в шахматы', circleKey: 'friends', updatedAt: NOW,
    })
    expect(after.people.find((p) => p.id === 'dima')?.deletedAt).toBe(NOW)
    expect(after.personNotes.find((n) => n.id === 'note-dima')?.personId).toBe('dmitry')
    const live = after.personLinks.filter((l) => !l.deletedAt)
    expect(live.map((l) => [l.a, l.b])).toEqual([['dmitry', 'x']])
    expect(after.personLinks.some((l) => l.a === l.b)).toBe(false)
  })
  it('записи и связи не меняют updatedAt человека, объединение сфер — меняет', () => {
    const data = patchData()
    data.people[0] = { ...data.people[0], sphereKeys: ['s-konsalt'] }
    const notesOnly = applyAll(withOps([
      { op: 'addNote', personId: 'ivan', note: { kind: 'meeting', day: '2026-10-20', original: 'x' } },
      { op: 'linkPeople', a: 'ivan', b: 'dima' },
    ]), data)
    expect(notesOnly.changes.people).toEqual([])
    const spheres = applyAll(withOps([{ op: 'mergeSpheres', from: 'консалт', into: 'консалтинг' }]), data)
    expect(spheres.changes.people.map((p) => [p.id, p.sphereKeys, p.updatedAt])).toEqual([['ivan', ['s-kons'], NOW]])
    expect(spheres.changes.spheres.find((s) => s.key === 's-konsalt')?.deletedAt).toBe(NOW)
  })
  it('удалённое в телефоне после первого применения не воскресает при повторе', () => {
    const data = patchData()
    const once = withChanges(data, applyAll(sample(), data))
    const gone = '2026-10-28T10:00:00.000+03:00'
    const deleted: PeopleData = {
      ...once,
      people: once.people.map((p) => (p.id === NEW_ID ? { ...p, deletedAt: gone } : p)),
      personNotes: once.personNotes.map((n) => (n.kind === 'diary' ? { ...n, deletedAt: gone } : n)),
    }
    const plan = planPatch(sample(), deleted, [])
    expect([plan.ops[0].status, plan.ops[4].status]).toEqual(['blocked', 'blocked'])
    const after = withChanges(deleted, applyPlan(plan, defaultDecisions(plan), deleted, '2026-10-29T10:00:00.000+03:00'))
    expect(after.people.find((p) => p.id === NEW_ID)?.deletedAt).toBe(gone)
    expect(after.personNotes.filter((n) => n.kind === 'diary' && !n.deletedAt)).toEqual([])
    expect(after.personLinks.filter((l) => !l.deletedAt && (l.a === NEW_ID || l.b === NEW_ID))).toHaveLength(1)
  })
  it('повторное применение не плодит людей, записи и связи', () => {
    const data = patchData()
    const once = withChanges(data, applyAll(sample(), data))
    const plan = planPatch(sample(), once, [{ id: 'patch-1', appliedAt: NOW, basedOnExportAt: '2026-10-25T23:10:00+03:00' }])
    const twice = withChanges(once, applyPlan(plan, defaultDecisions(plan), once, '2026-10-27T11:00:00.000+03:00'))
    expect(twice.people).toHaveLength(once.people.length)
    expect(twice.personNotes).toHaveLength(once.personNotes.length)
    expect(twice.personLinks).toHaveLength(once.personLinks.length)
    expect(twice.spheres).toHaveLength(once.spheres.length)
    expect(twice.people.find((p) => p.id === NEW_ID)?.createdAt).toBe(NOW)
  })
})
