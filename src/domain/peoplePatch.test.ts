import { describe, expect, it } from 'vitest'
import { PatchError, derivedId, isPeoplePatchJson, parsePeoplePatch } from './peoplePatch'
import { T0, samplePatch } from './testFixtures'

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
