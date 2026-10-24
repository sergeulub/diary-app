import { isLive, isUnparsed } from './people'
import { isTempId, type PatchPlan, type PlannedOp } from './peoplePatch'
import { shortDay } from './ru'
import type { PeopleData } from './types'

/** Подписи полей в «было → станет». */
export const FIELD_LABELS: Record<string, string> = {
  name: 'Имя',
  aliases: 'Как ещё называю',
  company: 'Компания',
  position: 'Должность',
  about: 'Чем занимается',
  spheres: 'Сферы',
  circle: 'Круг',
  canHelp: 'Чем может быть полезен',
  iCanHelp: 'Чем я могу быть полезен ему',
  personal: 'Личное',
  contacts: 'Контакты',
  archived: 'В архиве',
  day: 'Дата',
  occasion: 'Повод',
  talk: 'О чём говорили',
  life: 'Что актуально у него',
  agreements: 'Договорились',
  original: 'Исходная заметка',
}

/** Заголовок строки операции в предпросмотре. */
export function opTitle(o: PlannedOp, data: PeopleData): string {
  const op = o.op
  switch (op.op) {
    case 'createPerson': return 'Новый человек'
    case 'updatePerson': return 'Карточка'
    case 'updateNote': {
      const n = data.personNotes.find((x) => x.id === op.id)
      const day = n ? ` · ${shortDay(n.day)}` : ''
      return n && isUnparsed(n) ? `Разобрать заметку${day}` : `Запись${day}`
    }
    case 'addNote':
      return op.note.kind === 'diary'
        ? `Из дневника · ${shortDay(op.note.day)}`
        : `Встреча · ${shortDay(op.note.day)}${op.note.occasion?.trim() ? ` · ${op.note.occasion.trim()}` : ''}`
    case 'upsertDiaryNote': return `Из дневника · ${shortDay(op.day)}`
    case 'mergePeople': return `Присоединить «${data.people.find((p) => p.id === op.fromId)?.name ?? ''}»`
    case 'linkPeople': return 'Знакомы'
    case 'renameSphere': return 'Переименовать сферу'
    case 'mergeSpheres': return 'Объединить сферы'
  }
}

export interface PreviewGroup {
  key: string
  title: string
  isNew: boolean
  ops: PlannedOp[]
}

/** Операции по людям в порядке появления; сферы — своей группой; группы с конфликтами и блокировками — в конце. */
export function previewGroups(plan: PatchPlan, data: PeopleData): PreviewGroup[] {
  const newNames = new Map(plan.ops.flatMap((o) => (o.op.op === 'createPerson' ? [[o.op.tempId, o.op.person.name] as const] : [])))
  const groups = new Map<string, PreviewGroup>()
  for (const o of plan.ops) {
    const key = o.personId || 'spheres'
    let g = groups.get(key)
    if (!g) {
      const person = data.people.find((p) => p.id === o.personId && isLive(p)) ?? data.people.find((p) => p.id === o.personId)
      const title = !o.personId ? 'Сферы' : isTempId(o.personId) ? newNames.get(o.personId) ?? '' : person?.name ?? ''
      g = { key, title, isNew: isTempId(o.personId), ops: [] }
      groups.set(key, g)
    }
    g.ops.push(o)
  }
  const clean = (g: PreviewGroup) => g.ops.every((o) => o.status === 'ok')
  const all = [...groups.values()]
  return [...all.filter(clean), ...all.filter((g) => !clean(g))]
}
