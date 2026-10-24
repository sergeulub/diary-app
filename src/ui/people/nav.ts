/** Экраны модуля «Люди»: стек в состоянии PeopleApp, без роутера. */
export type Screen =
  | { kind: 'list' }
  | { kind: 'events' }
  | { kind: 'person'; id: string }
  | { kind: 'event'; id: string }
  | { kind: 'spheres' }
  | { kind: 'patch'; json?: string }

export interface Nav {
  push: (s: Screen) => void
  back: () => void
  /** Открыть день в дневнике — выход из модуля в «Календарь». */
  openDay: (day: string) => void
}
