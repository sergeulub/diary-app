import { logicalDay } from './domain/logicalDay'

export default function App() {
  return (
    <main className="mx-auto max-w-md px-5 pt-[max(28px,env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Фаза 0</p>
      <h1 className="font-serif text-3xl font-semibold">Дневник</h1>
      <p className="mt-2 text-muted">Логический день: {logicalDay(new Date(), 6)}</p>
    </main>
  )
}
