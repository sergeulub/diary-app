import { foldText, isIncomplete, isLive, isUnparsed, lastContactDay } from './people'
import type { PeopleData, Person } from './types'

/** Шторка «Фильтры» списка людей. */
export interface PeopleFilter {
  /** Любая из выбранных. */
  sphereKeys: string[]
  /** '' — все круги. */
  circleKey: string
  incomplete: boolean
  unparsed: boolean
  /** false — архив скрыт, true — только архив. */
  archived: boolean
  sort: 'lastContact' | 'added'
}

export const DEFAULT_FILTER: PeopleFilter = {
  sphereKeys: [], circleKey: '', incomplete: false, unparsed: false, archived: false, sort: 'lastContact',
}

/** Поиск по имени, «как ещё называю» и компании — подстрокой, без учёта регистра и «ё». */
export function matchesQuery(p: Person, query: string): boolean {
  const q = foldText(query.trim())
  return !q || [p.name, ...p.aliases, p.company].some((s) => foldText(s).includes(q))
}

export function filterPeople(data: Pick<PeopleData, 'people' | 'personNotes'>, query: string, f: PeopleFilter): Person[] {
  const unparsed = new Set(data.personNotes.filter((n) => isLive(n) && isUnparsed(n)).map((n) => n.personId))
  const found = data.people.filter((p) =>
    isLive(p) && p.archived === f.archived && matchesQuery(p, query) &&
    (f.sphereKeys.length === 0 || p.sphereKeys.some((k) => f.sphereKeys.includes(k))) &&
    (!f.circleKey || p.circleKey === f.circleKey) &&
    (!f.incomplete || isIncomplete(p)) &&
    (!f.unparsed || unparsed.has(p.id)),
  )
  if (f.sort === 'added') return found.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const last = new Map(found.map((p) => [p.id, lastContactDay(p.id, data.personNotes) ?? '']))
  return found.sort((a, b) => last.get(b.id)!.localeCompare(last.get(a.id)!) || a.name.localeCompare(b.name, 'ru'))
}

/** Число на кнопке «Фильтры»: каждая сфера отдельно, круг и переключатели по одному. */
export function activeFilterCount(f: PeopleFilter): number {
  return f.sphereKeys.length + [f.circleKey, f.incomplete, f.unparsed, f.archived].filter(Boolean).length
}
