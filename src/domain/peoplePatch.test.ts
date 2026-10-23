import { describe, expect, it } from 'vitest'
import {
  PatchError, defaultDecisions, derivedId, effectiveSelection, isPeoplePatchJson, parsePeoplePatch, planPatch,
  type PeoplePatch,
} from './peoplePatch'
import { T0, noteRec, patchData, samplePatch } from './testFixtures'
import type { AppliedPatch, PeopleData } from './types'

const parse = (x: unknown) => () => parsePeoplePatch(JSON.stringify(x))
const withOps = (...ops: unknown[]) => ({ ...samplePatch(), ops })

describe('parsePeoplePatch', () => {
  it('пример из ТЗ разбирается целиком', () => {
    const patch = parsePeoplePatch(JSON.stringify(samplePatch()))
    expect(patch).toMatchObject({ kind: 'people-patch', id: 'patch-1', basedOnExportAt: '2026-10-25T23:10:00+03:00' })
    expect(patch.ops.map((o) => o.op)).toEqual([
      'createPerson', 'updatePerson', 'updateNote', 'addNote', 'upsertDiaryNote', 'mergePeople', 'linkPeople',
      'renameSphere', 'mergeSpheres',
    ])
  })
  it('BOM в начале не мешает', () => {
    expect(parsePeoplePatch('﻿' + JSON.stringify(samplePatch())).id).toBe('patch-1')
  })
  it('не JSON', () => {
    expect(() => parsePeoplePatch('не json')).toThrow(new PatchError('Это не файл изменений: не JSON'))
  })
  it('нет kind или он другой', () => {
    expect(parse({ a: 1 })).toThrow(new PatchError('Это не файл изменений: нет kind'))
    expect(parse({ ...samplePatch(), kind: 'backup' })).toThrow(new PatchError('Это не файл изменений: нет kind'))
  })
  it('более новая версия', () => {
    expect(parse({ ...samplePatch(), patchVersion: 2 })).toThrow(
      new PatchError('Файл сделан более новой версией (patchVersion 2). Обновите дневник и откройте файл снова.'),
    )
  })
  it('нет обязательных полей файла', () => {
    const { basedOnExportAt: _b, ...broken } = samplePatch()
    expect(parse(broken)).toThrow(new PatchError('Файл изменений повреждён: не хватает полей'))
    expect(parse({ ...samplePatch(), ops: 'x' })).toThrow(new PatchError('Файл изменений повреждён: не хватает полей'))
  })
  it('неизвестная операция', () => {
    expect(parse(withOps({ op: 'deletePerson', id: 'x' }))).toThrow(
      new PatchError('Изменение №1: неизвестная операция «deletePerson»'),
    )
  })
  it('поля операции неверного типа', () => {
    const bad = new PatchError('Изменение №1: не хватает полей или они неверного типа')
    expect(parse(withOps({ op: 'updatePerson', id: 'ivan', set: {} }))).toThrow(bad)
    expect(parse(withOps({ op: 'upsertDiaryNote', personId: 'ivan', day: '18.10.2026', talk: 'x' }))).toThrow(bad)
    expect(parse(withOps({ op: 'createPerson', tempId: 'new-1', person: { name: ' ' } }))).toThrow(bad)
    expect(parse(withOps({ op: 'updatePerson', id: 'ivan', baseUpdatedAt: T0, set: { contacts: [{ type: 'fax', value: '1' }] } }))).toThrow(bad)
  })
  it('ссылка на нового человека без createPerson', () => {
    expect(parse(withOps({ op: 'addNote', personId: 'new-9', note: { kind: 'meeting', day: '2026-10-20' } }))).toThrow(
      new PatchError('Изменение №1: нет нового человека «new-9»'),
    )
  })
  it('createPerson позже ссылки тоже годится', () => {
    const ops = [
      { op: 'linkPeople', a: 'new-1', b: 'ivan' },
      { op: 'createPerson', tempId: 'new-1', person: { name: 'Олег Белов' } },
    ]
    expect(parsePeoplePatch(JSON.stringify(withOps(...ops))).ops).toHaveLength(2)
  })
  it('tempId не на new- и повторный tempId', () => {
    expect(parse(withOps({ op: 'createPerson', tempId: 'x1', person: { name: 'Олег' } }))).toThrow(
      new PatchError('Изменение №1: нет нового человека «x1»'),
    )
    const twice = withOps(
      { op: 'createPerson', tempId: 'new-1', person: { name: 'Олег' } },
      { op: 'createPerson', tempId: 'new-1', person: { name: 'Елена' } },
    )
    expect(parse(twice)).toThrow(new PatchError('Изменение №2: нет нового человека «new-1»'))
  })
})

describe('isPeoplePatchJson', () => {
  it('отличает файл изменений от бэкапа и мусора', () => {
    expect(isPeoplePatchJson('﻿{"kind":"people-patch"}')).toBe(true)
    expect(isPeoplePatchJson('{"formatVersion":5,"days":[]}')).toBe(false)
    expect(isPeoplePatchJson('не json')).toBe(false)
  })
})

describe('derivedId', () => {
  it('детерминирован, похож на UUID и различает соседние операции уже в первых 8 символах', () => {
    expect(derivedId('p:1')).toBe(derivedId('p:1'))
    expect(derivedId('p:1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(derivedId('p:1').slice(0, 8)).not.toBe(derivedId('p:2').slice(0, 8))
  })
})

const LATER = '2026-10-26T09:00:00.000+03:00'

const sample = (): PeoplePatch => parsePeoplePatch(JSON.stringify(samplePatch()))
const statusOf = (patch: PeoplePatch, data: PeopleData) => planPatch(patch, data, []).ops.map((o) => o.status)

describe('planPatch', () => {
  it('пример из ТЗ — всё применимо, операции нового человека зависят от него', () => {
    const plan = planPatch(sample(), patchData(), [])
    expect(plan.ops.map((o) => o.status)).toEqual(Array(9).fill('ok'))
    expect(plan.ops[3].dependsOn).toEqual(['new-1'])
    expect(plan.ops[6].dependsOn).toEqual(['new-1'])
    expect(plan.ops[0].personId).toBe('new-1')
    expect(plan.alreadyApplied).toBe(false)
    expect(plan.ops.filter((o) => o.editable).map((o) => o.op.op)).toEqual([
      'createPerson', 'updatePerson', 'updateNote', 'addNote', 'upsertDiaryNote', 'renameSphere',
    ])
  })
  it('было → станет', () => {
    const op = planPatch(sample(), patchData(), []).ops[1]
    expect(op.before.position).toBe('Партнёр')
    expect(op.after.position).toBe('Управляющий партнёр')
    expect(op.after.spheres).toBe('консалтинг')
  })
  it('карточку изменили в телефоне после выгрузки — конфликт, по умолчанию не выбран', () => {
    const data = patchData()
    data.people[0] = { ...data.people[0], updatedAt: LATER }
    const plan = planPatch(sample(), data, [])
    expect(plan.ops[1]).toMatchObject({ status: 'conflict', reason: 'Изменена в телефоне после выгрузки' })
    expect(defaultDecisions(plan)[1].selected).toBe(false)
  })
  it('тот же момент с другим смещением — не конфликт', () => {
    const data = patchData()
    data.people[0] = { ...data.people[0], updatedAt: '2026-10-01T19:00:00.000Z' }
    expect(statusOf(sample(), data)[1]).toBe('ok')
  })
  it('запись из дневника изменена после выгрузки — конфликт', () => {
    const data = patchData()
    data.personNotes.push(noteRec('ivan', { kind: 'diary', day: '2026-10-18', talk: 'Кино', updatedAt: LATER }))
    expect(statusOf(sample(), data)[4]).toBe('conflict')
  })
  it('удалённый человек: запись, связь и объединение заблокированы', () => {
    const data = patchData()
    data.people = data.people.map((p) => ({ ...p, deletedAt: LATER }))
    const plan = planPatch(sample(), data, [])
    for (const i of [1, 2, 4, 5, 6]) expect(plan.ops[i]).toMatchObject({ status: 'blocked', reason: 'Удалён в телефоне — применить нельзя' })
  })
  it('связь с самим собой и сфера, которой нет', () => {
    const patch = sample()
    patch.ops = [{ op: 'linkPeople', a: 'ivan', b: 'ivan' }, { op: 'mergeSpheres', from: 'дизайн', into: 'консалтинг' }]
    const plan = planPatch(patch, patchData(), [])
    expect(plan.ops[0].reason).toBe('Нельзя связать человека с самим собой')
    expect(plan.ops[1]).toMatchObject({ status: 'blocked', reason: 'Сферы «дизайн» нет' })
  })
  it('переименование в имя другой сферы заблокировано', () => {
    const patch = sample()
    patch.ops = [{ op: 'renameSphere', name: 'консалт', newName: 'Консалтинг' }]
    expect(planPatch(patch, patchData(), []).ops[0]).toMatchObject({
      status: 'blocked', reason: 'Сфера «Консалтинг» уже есть — объедините их',
    })
  })
  it('уже применённый файл', () => {
    const applied: AppliedPatch[] = [{ id: 'patch-1', appliedAt: LATER, basedOnExportAt: '2026-10-25T23:10:00+03:00' }]
    expect(planPatch(sample(), patchData(), applied).alreadyApplied).toBe(true)
  })
  it('повторный план по уже применённым данным — без ложных конфликтов', () => {
    const data = patchData()
    data.people[0] = { ...data.people[0], position: 'Управляющий партнёр', sphereKeys: ['s-kons'], updatedAt: LATER }
    data.personNotes[0] = { ...data.personNotes[0], talk: 'О стажировке', life: 'Подкаст', agreements: 'Резюме', patchId: 'patch-1', updatedAt: LATER }
    data.personNotes.push(noteRec('ivan', { kind: 'diary', day: '2026-10-18', talk: 'Ходили в кино', patchId: 'patch-1', updatedAt: LATER, createdAt: LATER }))
    expect(statusOf(sample(), data)).not.toContain('conflict')
  })
})

describe('effectiveSelection', () => {
  it('снятый новый человек снимает свои операции, отмеченный — возвращает', () => {
    const plan = planPatch(sample(), patchData(), [])
    const decisions = defaultDecisions(plan)
    decisions[0] = { selected: false }
    expect(effectiveSelection(plan, decisions).filter((_, i) => [0, 3, 6].includes(i))).toEqual([false, false, false])
    decisions[0] = { selected: true }
    expect(effectiveSelection(plan, decisions).filter((_, i) => [0, 3, 6].includes(i))).toEqual([true, true, true])
  })
  it('заблокированную нельзя выбрать', () => {
    const data = patchData()
    data.people = data.people.map((p) => ({ ...p, deletedAt: LATER }))
    const plan = planPatch(sample(), data, [])
    expect(effectiveSelection(plan, { 1: { selected: true } })[1]).toBe(false)
  })
})
