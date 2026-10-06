import Dexie, { type EntityTable } from 'dexie'

interface Visit {
  id?: number
  at: string
}

const db = new Dexie('diary-probe') as Dexie & { visits: EntityTable<Visit, 'id'> }
db.version(1).stores({ visits: '++id, at' })

export async function recordVisit(at: string): Promise<number> {
  await db.visits.add({ at })
  return db.visits.count()
}

export async function firstVisitAt(): Promise<string | undefined> {
  return (await db.visits.orderBy('id').first())?.at
}

export const ISOLATION_MARKER_KEY = 'diary-probe-marker'

/** Отметка для «Пробы 2»: время и откуда открыт «Дневник» (с иконки или во вкладке Safari). */
export function writeIsolationMarker(at: string, standalone: boolean): void {
  try {
    localStorage.setItem(ISOLATION_MARKER_KEY, JSON.stringify({ at, standalone }))
  } catch {
    // хранилище недоступно — проверка изоляции покажет «нет маркера»
  }
}
