import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { getMeta, initDb } from './db/diary'
import { requestPersistence } from './db/storage'
import { errorText } from './ui/errors'
import CalendarScreen from './ui/CalendarScreen'
import SettingsScreen from './ui/SettingsScreen'
import SummaryScreen from './ui/SummaryScreen'
import TabBar, { type Tab } from './ui/TabBar'

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('summary')

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

  return (
    <div className="flex h-dvh flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'summary' && <SummaryScreen meta={meta} />}
        {tab === 'calendar' && <CalendarScreen meta={meta} />}
        {tab === 'settings' && <SettingsScreen meta={meta} />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  )
}
