import { describe, expect, it } from 'vitest'
import { parsePeoplePatch, planPatch } from './peoplePatch'
import { FIELD_LABELS, opTitle, previewGroups } from './peoplePreview'
import { patchData, samplePatch } from './testFixtures'

const sample = () => parsePeoplePatch(JSON.stringify(samplePatch()))

describe('opTitle', () => {
  it('подписи девяти операций примера', () => {
    const data = patchData()
    const plan = planPatch(sample(), data, [])
    expect(plan.ops.map((o) => opTitle(o, data))).toEqual([
      'Новый человек',
      'Карточка',
      'Разобрать заметку · 25 окт',
      'Встреча · 20 окт · кофе',
      'Из дневника · 18 окт',
      'Присоединить «Дмитрий»',
      'Знакомы',
      'Переименовать сферу',
      'Объединить сферы',
    ])
  })
  it('правка уже разобранной записи', () => {
    const data = patchData()
    data.personNotes[0] = { ...data.personNotes[0], talk: 'Уже есть' }
    expect(opTitle(planPatch(sample(), data, []).ops[2], data)).toBe('Запись · 25 окт')
  })
})

describe('previewGroups', () => {
  it('по людям в порядке появления, сферы — отдельной группой', () => {
    const data = patchData()
    const groups = previewGroups(planPatch(sample(), data, []), data)
    expect(groups.map((g) => g.title)).toEqual(['Олег Белов', 'Иван Петров', 'Дмитрий Соколов', 'Сферы'])
    expect(groups[0].isNew).toBe(true)
    expect(groups[1].ops.map((o) => o.index)).toEqual([1, 2, 4])
  })
  it('группа с конфликтом уходит в конец', () => {
    const data = patchData()
    data.people[0] = { ...data.people[0], updatedAt: '2026-10-26T09:00:00.000+03:00' }
    const groups = previewGroups(planPatch(sample(), data, []), data)
    expect(groups.map((g) => g.title)).toEqual(['Олег Белов', 'Дмитрий Соколов', 'Сферы', 'Иван Петров'])
  })
})

describe('FIELD_LABELS', () => {
  it('подписи полей предпросмотра', () => {
    expect(FIELD_LABELS.talk).toBe('О чём говорили')
    expect(FIELD_LABELS.iCanHelp).toBe('Чем я могу быть полезен ему')
  })
})
