import { describe, expect, it } from 'vitest'
import {
  claudeDividerIndex, countByKey, createEvent, createNote, createPerson, createSphere, deleteNote, deletePerson, findByName,
  eventsByMonth, findSimilar, foldText, initials, isIncomplete, isSeenByClaude, isUnparsed, lastApplied, lastContactDay, linkPair, linkedIds,
  meetingAtEvent, mergeSphere, metInfo, normalizeName, peopleOfEvent, peopleStats, personFeed, setLinks, updateNote,
  updatePerson,
} from './people'
import { EMPTY_PEOPLE, T0, eventRec, linkRec, noteRec, personRec, sphereRec } from './testFixtures'
import type { AppliedPatch } from './types'

const NOW = '2026-10-25T23:00:00.000+03:00'

describe('createPerson', () => {
  it('обрезает имя, остальное пусто', () => {
    const p = createPerson({ name: '  Иван Петров ' }, NOW)
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(p).toMatchObject({
      name: 'Иван Петров', aliases: [], company: '', sphereKeys: [], circleKey: '', contacts: [], archived: false,
      createdAt: NOW, updatedAt: NOW, deletedAt: null,
    })
  })
  it('пустое имя — ошибка', () => {
    expect(() => createPerson({ name: ' ' }, NOW)).toThrow('Нужно имя')
  })
})

describe('updatePerson, deletePerson', () => {
  it('правка меняет поле и updatedAt, createdAt прежний', () => {
    const p = updatePerson(personRec(), { company: 'Кедр Консалтинг' }, NOW)
    expect(p).toMatchObject({ company: 'Кедр Консалтинг', createdAt: T0, updatedAt: NOW })
  })
  it('удаление мягкое', () => {
    expect(deletePerson(personRec(), NOW)).toMatchObject({ deletedAt: NOW, updatedAt: NOW })
  })
})

describe('записи ленты', () => {
  it('createNote: пустые поля, без patchId', () => {
    const n = createNote('p1', 'meeting', { day: '2026-10-25', original: 'Заметка' }, NOW)
    expect(n).toMatchObject({
      personId: 'p1', kind: 'meeting', day: '2026-10-25', occasion: '', eventId: '', talk: '', original: 'Заметка',
      patchId: '', createdAt: NOW, deletedAt: null,
    })
  })
  it('updateNote и deleteNote', () => {
    const n = noteRec('p1')
    expect(updateNote(n, { talk: 'О стажировке' }, NOW)).toMatchObject({ talk: 'О стажировке', updatedAt: NOW })
    expect(deleteNote(n, NOW).deletedAt).toBe(NOW)
  })
  it('meetingAtEvent берёт день и название события', () => {
    const ev = eventRec({ id: 'e1', day: '2026-10-15', title: 'Карьерный день' })
    expect(meetingAtEvent('p1', ev, NOW)).toMatchObject({
      personId: 'p1', kind: 'meeting', day: '2026-10-15', eventId: 'e1', occasion: 'Карьерный день',
    })
  })
})

describe('createEvent', () => {
  it('пустое название — ошибка', () => {
    expect(() => createEvent({ day: '2026-10-25', title: '  ' }, NOW)).toThrow('Нужно название')
  })
  it('тема по умолчанию пустая', () => {
    expect(createEvent({ day: '2026-10-25', title: 'Лекция' }, NOW)).toMatchObject({ title: 'Лекция', topic: '' })
  })
})

describe('isIncomplete', () => {
  it('только имя и псевдонимы — не дополнено', () => {
    expect(isIncomplete(personRec({ aliases: ['Ваня'] }))).toBe(true)
  })
  it('контакт — уже дополнено', () => {
    expect(isIncomplete(personRec({ contacts: [{ type: 'telegram', value: '@ivan' }] }))).toBe(false)
  })
  it('поле из пробелов не считается', () => {
    expect(isIncomplete(personRec({ company: '  ' }))).toBe(true)
  })
})

describe('isUnparsed', () => {
  const p = 'p1'
  it('встреча только с исходной заметкой', () => {
    expect(isUnparsed(noteRec(p, { original: 'Заметка' }))).toBe(true)
  })
  it('есть «о чём говорили» — разобрано', () => {
    expect(isUnparsed(noteRec(p, { original: 'Заметка', talk: 'x' }))).toBe(false)
  })
  it('из дневника и пустая заметка — нет', () => {
    expect(isUnparsed(noteRec(p, { kind: 'diary', original: 'Заметка' }))).toBe(false)
    expect(isUnparsed(noteRec(p, { original: ' ' }))).toBe(false)
  })
})

describe('personFeed, lastContactDay', () => {
  const notes = [
    noteRec('p1', { id: 'a', day: '2026-10-18' }),
    noteRec('p1', { id: 'b', day: '2026-10-25' }),
    noteRec('p1', { id: 'c', day: '2026-10-30', deletedAt: NOW }),
    noteRec('p2', { id: 'd', day: '2026-10-31' }),
  ]
  it('живые записи человека, новые сверху', () => {
    expect(personFeed('p1', notes).map((n) => n.id)).toEqual(['b', 'a'])
  })
  it('в один день — позже созданная первой', () => {
    const sameDay = [
      noteRec('p1', { id: 'early', createdAt: '2026-10-25T10:00:00.000+03:00' }),
      noteRec('p1', { id: 'late', createdAt: '2026-10-25T12:00:00.000+03:00' }),
    ]
    expect(personFeed('p1', sameDay).map((n) => n.id)).toEqual(['late', 'early'])
  })
  it('последняя запись без удалённых; нет записей — null', () => {
    expect(lastContactDay('p1', notes)).toBe('2026-10-25')
    expect(lastContactDay('p3', notes)).toBeNull()
  })
})

describe('metInfo', () => {
  it('самая ранняя встреча; повод из события, если свой пуст', () => {
    const ev = eventRec({ id: 'e1', title: 'Лекция о стратегии' })
    const notes = [
      noteRec('p1', { kind: 'diary', day: '2026-09-01', talk: 'Раньше всех, но из дневника' }),
      noteRec('p1', { day: '2026-10-25', occasion: 'кофе' }),
      noteRec('p1', { day: '2026-09-12', eventId: 'e1' }),
    ]
    expect(metInfo('p1', notes, [ev])).toEqual({ day: '2026-09-12', occasion: 'Лекция о стратегии' })
  })
  it('встреч нет — null', () => {
    expect(metInfo('p1', [noteRec('p1', { kind: 'diary' })], [])).toBeNull()
  })
})

describe('normalizeName, foldText', () => {
  it('порядок слов, регистр, пробелы и ё не важны', () => {
    expect(normalizeName('  Петров   Иван ')).toBe(normalizeName('иван петров'))
    expect(normalizeName('Алёна')).toBe('алена')
    expect(foldText('Ёлка')).toBe('елка')
  })
})

describe('findSimilar', () => {
  const ivan = personRec({ id: 'ivan', name: 'Иван Петров', company: 'Кедр Консалтинг' })
  it('то же имя в другом порядке', () => {
    expect(findSimilar('петров иван', '', [ivan]).map((p) => p.id)).toEqual(['ivan'])
  })
  it('первое слово и та же компания', () => {
    expect(findSimilar('Иван Сидоров', 'кедр консалтинг', [ivan]).map((p) => p.id)).toEqual(['ivan'])
    expect(findSimilar('Иван Сидоров', '', [ivan])).toEqual([])
  })
  it('удалённый не находится, архивный — находится', () => {
    expect(findSimilar('Иван Петров', '', [{ ...ivan, deletedAt: NOW }])).toEqual([])
    expect(findSimilar('Иван Петров', '', [{ ...ivan, archived: true }])).toHaveLength(1)
  })
})

describe('peopleOfEvent', () => {
  it('уникальные люди живых записей события', () => {
    const notes = [
      noteRec('p1', { eventId: 'e1' }), noteRec('p2', { eventId: 'e1' }), noteRec('p1', { eventId: 'e1' }),
      noteRec('p3', { eventId: 'e1', deletedAt: NOW }), noteRec('p4', { eventId: 'e2' }),
    ]
    expect(peopleOfEvent('e1', notes)).toEqual(['p1', 'p2'])
  })
})

describe('сферы', () => {
  it('findByName — без учёта регистра и ё, только живые', () => {
    const spheres = [sphereRec('s1', 'консалтинг'), sphereRec('s2', 'Маркетинг', { deletedAt: NOW })]
    expect(findByName(' Консалтинг ', spheres)?.key).toBe('s1')
    expect(findByName('маркетинг', spheres)).toBeUndefined()
  })
  it('createSphere — новый ключ', () => {
    expect(createSphere('аналитика', NOW)).toMatchObject({ name: 'аналитика', deletedAt: null })
  })
  it('mergeSphere не оставляет двух одинаковых ключей', () => {
    const both = personRec({ id: 'a', sphereKeys: ['konsalt', 'konsalting'] })
    const other = personRec({ id: 'b', sphereKeys: ['design'] })
    const changed = mergeSphere('konsalt', 'konsalting', [both, other], NOW)
    expect(changed.map((p) => [p.id, p.sphereKeys, p.updatedAt])).toEqual([['a', ['konsalting'], NOW]])
  })
})

describe('связи', () => {
  it('linkPair упорядочивает и не связывает с собой', () => {
    expect(linkPair('b', 'a')).toEqual(['a', 'b'])
    expect(linkPair('a', 'a')).toBeNull()
  })
  it('linkedIds — только живые', () => {
    const links = [linkRec('a', 'b'), linkRec('a', 'c', { deletedAt: NOW }), linkRec('d', 'a')]
    expect(linkedIds('a', links)).toEqual(['b', 'd'])
  })
  it('setLinks удаляет лишнее, создаёт недостающее, повтор ничего не меняет', () => {
    const links = [linkRec('a', 'b')]
    const changed = setLinks('a', ['c'], links, NOW)
    expect(changed.find((l) => l.b === 'b')?.deletedAt).toBe(NOW)
    expect(changed.find((l) => l.b === 'c')).toMatchObject({ a: 'a', b: 'c', deletedAt: null })
    const merged = [...links.filter((l) => !changed.some((c) => c.id === l.id)), ...changed]
    expect(setLinks('a', ['c'], merged, NOW)).toEqual([])
  })
  it('удалённая связь той же пары оживает', () => {
    const dead = linkRec('a', 'b', { deletedAt: T0 })
    expect(setLinks('b', ['a'], [dead], NOW)).toEqual([{ ...dead, deletedAt: null, updatedAt: NOW }])
  })
})

describe('полоса «разобрано Claude»', () => {
  const applied: AppliedPatch[] = [
    { id: 'old', appliedAt: '2026-10-15T12:00:00.000+03:00', basedOnExportAt: '2026-10-14T23:00:00.000+03:00' },
    { id: 'p1', appliedAt: '2026-10-22T12:00:00.000+03:00', basedOnExportAt: '2026-10-21T23:00:00.000+03:00' },
  ]
  const fresh = noteRec('x', { createdAt: '2026-10-24T10:00:00.000+03:00' })
  const seen = noteRec('x', { createdAt: '2026-10-20T10:00:00.000+03:00' })
  it('последний применённый — по basedOnExportAt', () => {
    expect(lastApplied(applied)?.id).toBe('p1')
    expect(lastApplied([])).toBeNull()
  })
  it('нет применённых файлов — полосы нет', () => {
    expect(claudeDividerIndex([fresh, seen], [])).toBe(-1)
  })
  it('новые выше увиденных — полоса перед первой увиденной', () => {
    expect(claudeDividerIndex([fresh, seen], applied)).toBe(1)
  })
  it('запись из файла изменений увидена при любом createdAt', () => {
    const fromPatch = noteRec('x', { createdAt: '2026-10-22T12:00:00.000+03:00', patchId: 'p1' })
    expect(isSeenByClaude(fromPatch, applied)).toBe(true)
    expect(claudeDividerIndex([fresh, fromPatch], applied)).toBe(1)
  })
  it('все увидены или все новые — полосы нет', () => {
    expect(claudeDividerIndex([seen], applied)).toBe(-1)
    expect(claudeDividerIndex([fresh], applied)).toBe(-1)
  })
  it('тот же момент с другим смещением — увидена', () => {
    const sameMoment = noteRec('x', { createdAt: '2026-10-21T23:00:00.000+03:00' })
    const utc: AppliedPatch[] = [{ id: 'p', appliedAt: NOW, basedOnExportAt: '2026-10-21T20:00:00.000Z' }]
    expect(isSeenByClaude(sameMoment, utc)).toBe(true)
  })
})

describe('для экранов', () => {
  it('initials — первые буквы двух первых слов', () => {
    expect(initials(' анна  смирнова ')).toBe('АС')
    expect(initials('Дмитрий')).toBe('Д')
    expect(initials('Иван Сергеевич Петров')).toBe('ИС')
  })
  it('peopleStats пустой базы — нули', () => {
    expect(peopleStats(EMPTY_PEOPLE)).toEqual({ total: 0, incomplete: 0, unparsed: 0 })
  })
  it('peopleStats: удалённые не считаются, архивные — да', () => {
    const data = {
      ...EMPTY_PEOPLE,
      people: [personRec({ id: 'bare' }), personRec({ id: 'arch', company: 'Луч', archived: true }), personRec({ id: 'dead', deletedAt: NOW })],
      personNotes: [noteRec('bare', { original: 'Заметка' }), noteRec('dead', { original: 'Заметка' })],
    }
    expect(peopleStats(data)).toEqual({ total: 2, incomplete: 1, unparsed: 1 })
  })
  it('countByKey — по живым людям', () => {
    const people = [
      personRec({ sphereKeys: ['a', 'b'] }), personRec({ sphereKeys: ['a'] }), personRec({ sphereKeys: ['a'], deletedAt: NOW }),
    ]
    const counts = countByKey(people, (p) => p.sphereKeys)
    expect([counts.get('a'), counts.get('b'), counts.get('c')]).toEqual([2, 1, undefined])
  })
  it('eventsByMonth — свежие сверху, с числом людей', () => {
    const events = [
      eventRec({ id: 'e15', day: '2026-10-15' }), eventRec({ id: 'e25', day: '2026-10-25' }),
      eventRec({ id: 'e12', day: '2026-09-12' }), eventRec({ id: 'gone', day: '2026-10-30', deletedAt: NOW }),
    ]
    const notes = [noteRec('p1', { eventId: 'e25' }), noteRec('p2', { eventId: 'e25' })]
    const months = eventsByMonth(events, notes)
    expect(months.map((m) => m.month)).toEqual(['2026-10', '2026-09'])
    expect(months[0].items.map((i) => [i.event.id, i.count])).toEqual([['e25', 2], ['e15', 0]])
  })
})
