import { describe, expect, it } from 'vitest'
import { DEFAULT_CIRCLES } from './people'
import { buildPeopleFiles, personFileName, renderPeopleIndex, renderPersonFile, translit } from './peopleExport'
import { EMPTY_PEOPLE, eventRec, linkRec, noteRec, personRec, sphereRec } from './testFixtures'
import type { PeopleData } from './types'

const IVAN = '1a2b3c4d-0000-4000-8000-000000000001'
const ANNA = '9f8e7d6c-0000-4000-8000-000000000002'

function sample(): PeopleData {
  return {
    ...EMPTY_PEOPLE,
    people: [
      personRec({
        id: IVAN, name: 'Иван Петров', aliases: ['Ваня'], company: 'Кедр Консалтинг', position: 'партнёр',
        about: 'Стратегия для ритейла', sphereKeys: ['s1', 's2'], circleKey: 'speaker', canHelp: 'Стажировка',
        iCanHelp: 'Гости для подкаста', personal: 'Бегает марафоны',
        contacts: [{ type: 'telegram', value: '@ivan' }, { type: 'email', value: 'ivan@example.com' }],
        createdAt: '2026-10-25T21:00:00.000+03:00',
      }),
      personRec({ id: ANNA, name: 'Анна Смирнова', company: 'Северный банк', createdAt: '2026-10-25T21:30:00.000+03:00' }),
    ],
    personNotes: [
      noteRec(IVAN, {
        id: 'note-meet', day: '2026-10-25', eventId: 'e1', occasion: 'Встреча клуба', talk: 'О стажировке',
        life: 'Запускает подкаст', agreements: 'Написать в феврале', original: 'Заметка на ходу',
      }),
      noteRec(IVAN, { id: 'note-diary', kind: 'diary', day: '2026-10-18', talk: 'Ходили в кино' }),
      noteRec(ANNA, { id: 'note-anna', day: '2026-10-25', eventId: 'e1', occasion: 'Встреча клуба', original: 'HR банка' }),
    ],
    events: [eventRec({ id: 'e1', day: '2026-10-25', title: 'Встреча клуба' })],
    spheres: [sphereRec('s1', 'консалтинг'), sphereRec('s2', 'стратегия')],
    circles: DEFAULT_CIRCLES,
    personLinks: [linkRec(IVAN, ANNA)],
  }
}

describe('translit', () => {
  it('кириллица латиницей, пробелы в дефис', () => {
    expect(translit('Иван Петров')).toBe('ivan-petrov')
    expect(translit('Щука Ёжикова')).toBe('shchuka-ezhikova')
    expect(translit('Anna Ли')).toBe('anna-li')
  })
  it('нечего транслитерировать — person', () => {
    expect(translit('🙂')).toBe('person')
    expect(translit(' — ')).toBe('person')
  })
  it('не длиннее 40 символов и без дефиса в конце', () => {
    const long = translit('Иван Иванович Константинопольский-Длиннофамильный')
    expect(long.length).toBeLessThanOrEqual(40)
    expect(long.endsWith('-')).toBe(false)
  })
})

describe('personFileName', () => {
  it('у тёзок разные файлы', () => {
    const a = personFileName(personRec({ id: IVAN, name: 'Иван Петров' }))
    const b = personFileName(personRec({ id: ANNA, name: 'Иван Петров' }))
    expect(a).toBe('ivan-petrov-1a2b3c4d.md')
    expect(b).toBe('ivan-petrov-9f8e7d6c.md')
  })
})

describe('renderPersonFile', () => {
  it('текст как в ТЗ', () => {
    const data = sample()
    expect(renderPersonFile(data.people[0], data)).toBe([
      '# Иван Петров',
      `id: ${IVAN} · добавлен 2026-10-25`,
      'Как ещё называю: Ваня',
      'Компания и должность: Кедр Консалтинг, партнёр',
      'Чем занимается: Стратегия для ритейла',
      'Сферы: консалтинг, стратегия',
      'Круг: Спикер / гость',
      'Познакомились: 2026-10-25, Встреча клуба',
      'Чем может быть полезен: Стажировка',
      'Чем я могу быть полезен ему: Гости для подкаста',
      'Личное: Бегает марафоны',
      'Контакты: Telegram @ivan · Почта ivan@example.com',
      'Знаком с: [Анна Смирнова](anna-smirnova-9f8e7d6c.md)',
      '',
      '## Лента',
      '### 2026-10-25 · встреча · Встреча клуба',
      'id: note-meet',
      '**О чём говорили:** О стажировке',
      '**Что актуально у него:** Запускает подкаст',
      '**Договорились:** Написать в феврале',
      '**Исходная заметка:** Заметка на ходу',
      '',
      '### 2026-10-18 · из дневника',
      'id: note-diary',
      'Ходили в кино',
      '',
    ].join('\n'))
  })
  it('пустые поля пропускаются, пометки — в строке id', () => {
    const data = sample()
    expect(renderPersonFile(data.people[1], data)).toBe([
      '# Анна Смирнова',
      `id: ${ANNA} · добавлен 2026-10-25 · пометки: не разобрано`,
      'Компания и должность: Северный банк',
      'Познакомились: 2026-10-25, Встреча клуба',
      'Знаком с: [Иван Петров](ivan-petrov-1a2b3c4d.md)',
      '',
      '## Лента',
      '### 2026-10-25 · встреча · Встреча клуба',
      'id: note-anna',
      '**Исходная заметка:** HR банка',
      '',
    ].join('\n'))
  })
})

describe('renderPeopleIndex', () => {
  it('текст как в ТЗ', () => {
    expect(renderPeopleIndex(sample(), new Date(2026, 9, 25, 23, 10))).toBe([
      '# Люди — выгрузка 2026-10-25 23:10',
      'Всего: 2 · не дополнено: 0 · неразобранных заметок: 1 · в архиве: 0',
      '',
      '| Имя | Компания, должность | Сферы | Круг | Последняя запись | Пометки | Файл |',
      '|---|---|---|---|---|---|---|',
      '| Анна Смирнова | Северный банк |  |  | 2026-10-25 | не разобрано | anna-smirnova-9f8e7d6c.md |',
      '| Иван Петров (Ваня) | Кедр Консалтинг, партнёр | консалтинг, стратегия | Спикер / гость | 2026-10-25 |  | ivan-petrov-1a2b3c4d.md |',
      '',
      '## События',
      '| Дата | Событие | Люди |',
      '|---|---|---|',
      '| 2026-10-25 | Встреча клуба | Анна Смирнова, Иван Петров |',
      '',
    ].join('\n'))
  })
  it('| и перевод строки не ломают таблицу', () => {
    const data = { ...EMPTY_PEOPLE, people: [personRec({ id: IVAN, company: 'Кедр | Ко\nнсалтинг' })] }
    expect(renderPeopleIndex(data, new Date(2026, 9, 25, 23, 10))).toContain('| Кедр \\| Ко нсалтинг |')
  })
})

describe('buildPeopleFiles', () => {
  it('удалённых нет, архивные помечены', () => {
    const data = sample()
    data.people.push(
      personRec({ id: 'dead0000-x', name: 'Удалённый', deletedAt: '2026-10-26T10:00:00.000+03:00' }),
      personRec({ id: 'arch0000-x', name: 'Ольга Ветрова', archived: true }),
    )
    const files = buildPeopleFiles(data, new Date(2026, 9, 25, 23, 10))
    expect(Object.keys(files).sort()).toEqual([
      'people/anna-smirnova-9f8e7d6c.md', 'people/index.md', 'people/ivan-petrov-1a2b3c4d.md', 'people/olga-vetrova-arch0000.md',
    ])
    expect(files['people/index.md']).not.toContain('Удалённый')
    expect(files['people/index.md']).toContain('| не дополнено, архив | olga-vetrova-arch0000.md |')
    expect(files['people/olga-vetrova-arch0000.md']).toContain('пометки: не дополнено, архив')
  })
  it('пустая база — только index.md', () => {
    const files = buildPeopleFiles(EMPTY_PEOPLE, new Date(2026, 9, 25, 23, 10))
    expect(Object.keys(files)).toEqual(['people/index.md'])
    expect(files['people/index.md']).toContain('Всего: 0 · не дополнено: 0 · неразобранных заметок: 0 · в архиве: 0')
  })
})
