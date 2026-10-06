import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react'
import { getDay, getMetrics, saveDay } from '../db/diary'
import { formCards } from '../domain/metrics'
import type { MetricDefinition, MetricValue } from '../domain/types'
import { errorText } from './errors'
import { Card, MetricCard, SleepCard } from './MetricCards'

const TEXT_DELAY_MS = 500

interface Loaded {
  metrics: Record<string, MetricValue>
  text: string
}

/** Форма итога дня. Монтировать с key={day}: при смене дня состояние начинается заново. */
export default function DayForm({ day }: { day: string }) {
  const defs = useLiveQuery(getMetrics)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getDay(day).then(
      (rec) => alive && setLoaded({ metrics: rec?.metrics ?? {}, text: rec?.text ?? '' }),
      (e) => alive && setLoadError(errorText(e)),
    )
    return () => {
      alive = false
    }
  }, [day])

  if (loadError) return <p className="text-[15px] text-danger">Не удалось открыть день: {loadError}</p>
  if (!defs || !loaded) return null
  return <DayFormBody day={day} defs={defs} initial={loaded} />
}

function DayFormBody({ day, defs, initial }: { day: string; defs: MetricDefinition[]; initial: Loaded }) {
  const [metrics, setMetrics] = useState(initial.metrics)
  const [text, setText] = useState(initial.text)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const area = useRef<HTMLTextAreaElement>(null)

  const onSaved = useCallback(() => setError(null), [])
  const onFailed = useCallback((e: unknown) => setError(`Не сохранилось: ${errorText(e)}`), [])

  function setMetric(key: string, value: MetricValue | null) {
    setMetrics((m) => {
      const next = { ...m }
      if (value === null) delete next[key]
      else next[key] = value
      return next
    })
    saveDay(day, { metrics: { [key]: value } }, new Date()).then(onSaved, onFailed)
  }

  /** Пишет отложенный текст сразу: таймер, уход приложения в фон, закрытие формы. */
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    if (pending.current === null) return
    const value = pending.current
    pending.current = null
    saveDay(day, { text: value }, new Date()).then(onSaved, onFailed)
  }, [day, onSaved, onFailed])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  function onText(e: ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    pending.current = e.target.value
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, TEXT_DELAY_MS)
  }

  // поле растёт вместе с текстом; страница прокручивается целиком
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  return (
    <div className="flex grow flex-col gap-3.5">
      {formCards(defs).map((card) =>
        card.kind === 'sleep' ? (
          <SleepCard key="sleep" start={card.start} end={card.end} metrics={metrics} onChange={setMetric} />
        ) : (
          <MetricCard
            key={card.def.key} def={card.def} value={metrics[card.def.key]}
            onChange={(v) => setMetric(card.def.key, v)}
          />
        ),
      )}
      <Card title="Как прошёл день" className="grow">
        <textarea
          ref={area} value={text} onChange={onText} aria-label="Как прошёл день"
          placeholder="Надиктуй или напиши пару строк…"
          className="min-h-[160px] shrink-0 grow resize-none bg-transparent text-[16px] leading-[1.55] text-ink outline-none placeholder:text-muted"
        />
      </Card>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  )
}
