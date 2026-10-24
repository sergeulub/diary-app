import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { getMeta, initDb } from './db/diary'
import { requestPersistence } from './db/storage'
import { errorText } from './ui/errors'
import CalendarScreen from './ui/CalendarScreen'
import FinanceScreen from './ui/FinanceScreen'
import GoalsScreen from './ui/GoalsScreen'
import PeopleApp from './ui/people/PeopleApp'
import SettingsScreen from './ui/SettingsScreen'
import SummaryScreen from './ui/SummaryScreen'
import TabBar, { type Tab } from './ui/TabBar'

/** Дневник или мини-приложение «Люди»; приложение всегда запускается в дневнике. */
type Mode = { kind: 'diary' } | { kind: 'people'; patchJson?: string }

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('summary')
  const [mode, setMode] = useState<Mode>({ kind: 'diary' })
  /** День, который «Люди» попросили открыть в «Календаре». */
  const [openDay, setOpenDay] = useState<string | null>(null)

  useEffect(() => {
    requestPersistence().catch(() => {})
    initDb().then(
      () => setReady(true),
      (e) => setError(errorText(e)),
    )
  }, [])

  const meta = useLiveQuery(() => (ready ? getMeta() : undefined), [ready])

  if (error) return <p className="p-5 text-[17px]">Не удалось открыть дневник: {error}</p>
  if (!meta) return null

  if (mode.kind === 'people') {
    return (
      <PeopleApp
        meta={meta} patchJson={mode.patchJson} onExit={() => setMode({ kind: 'diary' })}
        onOpenDay={(day) => {
          setOpenDay(day)
          setTab('calendar')
          setMode({ kind: 'diary' })
        }}
      />
    )
  }

  return (
    <div className="flex h-dvh flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'summary' && <SummaryScreen meta={meta} onOpenFinance={() => setTab('finance')} />}
        {tab === 'finance' && <FinanceScreen meta={meta} />}
        {tab === 'goals' && <GoalsScreen meta={meta} />}
        {tab === 'calendar' && <CalendarScreen key={openDay ?? ''} meta={meta} initialDay={openDay} />}
        {tab === 'settings' && (
          <SettingsScreen
            meta={meta} onOpenPeople={() => setMode({ kind: 'people' })}
            onPeoplePatch={(json) => setMode({ kind: 'people', patchJson: json })}
          />
        )}
      </main>
      <TabBar
        tab={tab}
        onChange={(t) => {
          setOpenDay(null)
          setTab(t)
        }}
      />
    </div>
  )
}
