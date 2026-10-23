import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTER, activeFilterCount, filterPeople, matchesQuery } from './peopleList'
import { noteRec, personRec } from './testFixtures'

const ids = (people: { id: string }[]) => people.map((p) => p.id)

describe('matchesQuery', () => {
  const ivan = personRec({ name: 'Иван Петров', aliases: ['Ваня'], company: 'Кедр Консалтинг' })
  it('по псевдониму, компании и имени без учёта регистра и ё', () => {
    expect(matchesQuery(ivan, 'ваня')).toBe(true)
    expect(matchesQuery(ivan, ' кедр ')).toBe(true)
    expect(matchesQuery(personRec({ name: 'Алёна' }), 'алена')).toBe(true)
    expect(matchesQuery(ivan, 'анна')).toBe(false)
  })
  it('пустой запрос подходит всем', () => {
    expect(matchesQuery(ivan, '  ')).toBe(true)
  })
})

describe('filterPeople', () => {
  it('сферы — «или» внутри, с кругом — «и»', () => {
    const fits = personRec({ id: 'fits', sphereKeys: ['b'], circleKey: 'speaker' })
    const wrongCircle = personRec({ id: 'hr', sphereKeys: ['b'], circleKey: 'hr' })
    const noSphere = personRec({ id: 'none', circleKey: 'speaker' })
    const f = { ...DEFAULT_FILTER, sphereKeys: ['a', 'b'], circleKey: 'speaker' }
    expect(ids(filterPeople({ people: [fits, wrongCircle, noSphere], personNotes: [] }, '', f))).toEqual(['fits'])
  })
  it('архив скрыт по умолчанию, а с переключателем виден только он; удалённых нет никогда', () => {
    const people = [personRec({ id: 'live' }), personRec({ id: 'arch', archived: true }), personRec({ id: 'del', deletedAt: 'x' })]
    expect(ids(filterPeople({ people, personNotes: [] }, '', DEFAULT_FILTER))).toEqual(['live'])
    expect(ids(filterPeople({ people, personNotes: [] }, '', { ...DEFAULT_FILTER, archived: true }))).toEqual(['arch'])
  })
  it('не дополнено и неразобранные', () => {
    const bare = personRec({ id: 'bare' })
    const full = personRec({ id: 'full', company: 'Кедр Консалтинг' })
    const notes = [noteRec('full', { original: 'Заметка' })]
    expect(ids(filterPeople({ people: [bare, full], personNotes: notes }, '', { ...DEFAULT_FILTER, incomplete: true }))).toEqual(['bare'])
    expect(ids(filterPeople({ people: [bare, full], personNotes: notes }, '', { ...DEFAULT_FILTER, unparsed: true }))).toEqual(['full'])
  })
  it('по последней записи: свежие сверху, без записей — в конце', () => {
    const people = [personRec({ id: 'none', name: 'Борис' }), personRec({ id: 'old' }), personRec({ id: 'new' })]
    const notes = [noteRec('old', { day: '2026-10-18' }), noteRec('new', { day: '2026-10-25' })]
    expect(ids(filterPeople({ people, personNotes: notes }, '', DEFAULT_FILTER))).toEqual(['new', 'old', 'none'])
  })
  it('по дате добавления: новые сверху', () => {
    const people = [
      personRec({ id: 'first', createdAt: '2026-09-01T10:00:00.000+03:00' }),
      personRec({ id: 'second', createdAt: '2026-10-01T10:00:00.000+03:00' }),
    ]
    expect(ids(filterPeople({ people, personNotes: [] }, '', { ...DEFAULT_FILTER, sort: 'added' }))).toEqual(['second', 'first'])
  })
  it('поиск сужает список', () => {
    const people = [personRec({ id: 'ivan', name: 'Иван Петров' }), personRec({ id: 'anna', name: 'Анна Смирнова' })]
    expect(ids(filterPeople({ people, personNotes: [] }, 'анна', DEFAULT_FILTER))).toEqual(['anna'])
  })
})

describe('activeFilterCount', () => {
  it('сферы по одной, круг и переключатели по одному, сортировка не считается', () => {
    expect(activeFilterCount(DEFAULT_FILTER)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_FILTER, sphereKeys: ['a', 'b'], circleKey: 'hr', sort: 'added' })).toBe(3)
    expect(activeFilterCount({ ...DEFAULT_FILTER, incomplete: true, unparsed: true, archived: true })).toBe(3)
  })
})
