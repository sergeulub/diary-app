import { useState } from 'react'
import type { Meta } from '../../domain/types'
import { primeKeyboard } from '../financeUi'
import type { Screen } from './nav'
import PeopleNav from './PeopleNav'

/** Мини-приложение «Люди» на весь экран; своя нижняя панель, панель дневника скрыта. */
export default function PeopleApp({ patchJson, onExit }: {
  meta: Meta
  patchJson?: string
  onExit: () => void
  onOpenDay: (day: string) => void
}) {
  const [stack, setStack] = useState<Screen[]>(() =>
    patchJson ? [{ kind: 'list' }, { kind: 'patch', json: patchJson }] : [{ kind: 'list' }])
  const screen = stack[stack.length - 1]
  const root = stack[0].kind === 'events' ? 'events' : 'list'

  return (
    <div className="flex h-dvh flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-6">
          <h1 className="font-serif text-[30px] font-semibold">{screen.kind === 'events' ? 'События' : 'Люди'}</h1>
        </div>
      </main>
      <PeopleNav active={root} onTab={(t) => setStack([{ kind: t }])} onAdd={primeKeyboard} onExit={onExit} />
    </div>
  )
}
