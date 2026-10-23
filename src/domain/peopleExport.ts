import { pad } from './dates'
import {
  CONTACT_LABELS, isIncomplete, isLive, isUnparsed, lastContactDay, linkedIds, metInfo, peopleOfEvent, personFeed,
} from './people'
import type { PeopleData, Person, PersonNote } from './types'

const LETTERS: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/** Имя файла латиницей: «Иван Петров» → ivan-petrov; нечего транслитерировать — person. */
export function translit(s: string): string {
  const latin = [...s.toLowerCase()].map((ch) => LETTERS[ch] ?? (/[a-z0-9]/.test(ch) ? ch : '-')).join('')
  const slug = latin.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '')
  return slug || 'person'
}

export function personFileName(p: Person): string {
  return `${translit(p.name)}-${p.id.slice(0, 8)}.md`
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ru')
/** Значение строки-поля: переводы строк — пробелом. */
const oneLine = (s: string) => s.trim().replace(/\s*\n\s*/g, ' ')
/** Ячейка Markdown-таблицы: | и переводы строк не ломают строку. */
const cell = (s: string) => oneLine(s).replace(/\|/g, '\\|')
const row = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`

function marks(p: Person, notes: PersonNote[]): string[] {
  const unparsed = notes.some((n) => n.personId === p.id && isLive(n) && isUnparsed(n))
  return [isIncomplete(p) && 'не дополнено', unparsed && 'не разобрано', p.archived && 'архив'].filter((m): m is string => !!m)
}

const sphereNames = (p: Person, data: PeopleData) =>
  p.sphereKeys.map((k) => data.spheres.find((s) => s.key === k && isLive(s))?.name).filter((n): n is string => !!n)
const circleName = (p: Person, data: PeopleData) => data.circles.find((c) => c.key === p.circleKey)?.name ?? ''
const job = (p: Person) => [p.company, p.position].map(oneLine).filter(Boolean).join(', ')
const livePeople = (data: PeopleData) => data.people.filter(isLive).sort(byName)

function stampTitle(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export function renderPeopleIndex(data: PeopleData, now: Date): string {
  const people = livePeople(data)
  const ids = new Set(people.map((p) => p.id))
  const unparsedNotes = data.personNotes.filter((n) => ids.has(n.personId) && isLive(n) && isUnparsed(n)).length
  const lines = [
    `# Люди — выгрузка ${stampTitle(now)}`,
    `Всего: ${people.length} · не дополнено: ${people.filter(isIncomplete).length} · ` +
      `неразобранных заметок: ${unparsedNotes} · в архиве: ${people.filter((p) => p.archived).length}`,
    '',
    '| Имя | Компания, должность | Сферы | Круг | Последняя запись | Пометки | Файл |',
    '|---|---|---|---|---|---|---|',
    ...people.map((p) => row([
      p.aliases.length ? `${p.name} (${p.aliases.join(', ')})` : p.name,
      job(p), sphereNames(p, data).join(', '), circleName(p, data), lastContactDay(p.id, data.personNotes) ?? '',
      marks(p, data.personNotes).join(', '), personFileName(p),
    ])),
  ]
  const events = data.events.filter(isLive).sort((a, b) => b.day.localeCompare(a.day))
  if (events.length) {
    const nameOf = new Map(people.map((p) => [p.id, p.name]))
    lines.push('', '## События', '| Дата | Событие | Люди |', '|---|---|---|')
    for (const e of events) {
      const names = peopleOfEvent(e.id, data.personNotes).flatMap((id) => nameOf.get(id) ?? []).sort((a, b) => a.localeCompare(b, 'ru'))
      lines.push(row([e.day, e.title, names.join(', ')]))
    }
  }
  return lines.join('\n') + '\n'
}

const NOTE_FIELDS: [keyof Pick<PersonNote, 'talk' | 'life' | 'agreements' | 'original'>, string][] = [
  ['talk', 'О чём говорили'],
  ['life', 'Что актуально у него'],
  ['agreements', 'Договорились'],
  ['original', 'Исходная заметка'],
]

function noteBlock(n: PersonNote, data: PeopleData): string[] {
  if (n.kind === 'diary') return [`### ${n.day} · из дневника`, `id: ${n.id}`, n.talk.trim()]
  const occasion = n.occasion.trim() || data.events.find((e) => e.id === n.eventId && isLive(e))?.title || ''
  const lines = [`### ${n.day} · встреча${occasion ? ` · ${occasion}` : ''}`, `id: ${n.id}`]
  for (const [key, label] of NOTE_FIELDS) if (n[key].trim()) lines.push(`**${label}:** ${n[key].trim()}`)
  return lines
}

export function renderPersonFile(p: Person, data: PeopleData): string {
  const m = marks(p, data.personNotes)
  const met = metInfo(p.id, data.personNotes, data.events)
  const friends = linkedIds(p.id, data.personLinks)
    .flatMap((id) => data.people.find((x) => x.id === id && isLive(x)) ?? [])
    .sort(byName)
  const fields: [string, string][] = [
    ['Как ещё называю', p.aliases.join(', ')],
    ['Компания и должность', job(p)],
    ['Чем занимается', p.about],
    ['Сферы', sphereNames(p, data).join(', ')],
    ['Круг', circleName(p, data)],
    ['Познакомились', met ? [met.day, met.occasion].filter(Boolean).join(', ') : ''],
    ['Чем может быть полезен', p.canHelp],
    ['Чем я могу быть полезен ему', p.iCanHelp],
    ['Личное', p.personal],
    ['Контакты', p.contacts.filter((c) => c.value.trim()).map((c) => `${CONTACT_LABELS[c.type]} ${oneLine(c.value)}`).join(' · ')],
    ['Знаком с', friends.map((f) => `[${f.name}](${personFileName(f)})`).join(', ')],
  ]
  const lines = [
    `# ${p.name}`,
    `id: ${p.id} · добавлен ${p.createdAt.slice(0, 10)}${m.length ? ` · пометки: ${m.join(', ')}` : ''}`,
    ...fields.filter(([, v]) => oneLine(v)).map(([label, v]) => `${label}: ${oneLine(v)}`),
  ]
  const feed = personFeed(p.id, data.personNotes)
  if (feed.length) lines.push('', '## Лента', ...feed.flatMap((n, i) => [...(i ? [''] : []), ...noteBlock(n, data)]))
  return lines.join('\n') + '\n'
}

/** Папка people/ для zip: index.md и файл на каждого живого человека. */
export function buildPeopleFiles(data: PeopleData, now: Date): Record<string, string> {
  const files: Record<string, string> = { 'people/index.md': renderPeopleIndex(data, now) }
  for (const p of livePeople(data)) files[`people/${personFileName(p)}`] = renderPersonFile(p, data)
  return files
}
